import { Hono } from "hono";
import { and, eq, desc } from "drizzle-orm";
import type { Env, Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import {
  createLLMClient,
  hasAnyLLMProviderKey,
  type LLMMessage,
  type ToolCall,
  type ToolSpec,
} from "../services/adapters/llm-client.js";
import { BuilderforceClient } from "@seanhogg/builderforce-sdk";
import { attachTokenBudget, checkTokenBudget } from "../middleware/tierEnforcement.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { servicesProcessor } from "../domains/services-processing/index.js";
import { getPrompt } from "../../../shared/ai-prompts/index.js";

export const aiRoutes = new Hono<AppEnv>();

// Piggy-back the live token-budget onto every AI response so clients can
// update the AI-tokens UI from the same round-trip. See attachTokenBudget.
aiRoutes.use("*", attachTokenBudget());

// GET /api/ai/models — vendor/model catalog. SuperAdmin only: end
// users must never see which LLM provider serves their requests; they
// only see "tokens consumed". Reads live from the Builderforce
// gateway (whatever's currently catalog-available + cooldown state)
// rather than a hand-maintained registry on our side.
aiRoutes.get("/models", superAdminMiddleware, async (c) => {
  const apiKey = c.env?.BUILDERFORCE_API_KEY?.trim();
  if (!apiKey) {
    return c.json(success({ configured: false, data: [] }));
  }
  const sdk = new BuilderforceClient({ apiKey, baseUrl: c.env?.BUILDERFORCE_GATEWAY_URL });
  try {
    const models = await sdk.models.list();
    return c.json(success(models));
  } catch (err) {
    return c.json(error("MODELS_UNAVAILABLE", err instanceof Error ? err.message : String(err)), 502);
  }
});

// Career-coach persona — single source in shared/ai-prompts/. The
// in-app AIChatPanel reads from the same prompt so the persona never
// drifts between the panel's enhanced prompt and this route's default.
const SYSTEM_PROMPT = getPrompt("career-coach").render({});

function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

function generateMockResponse(input: string): { message: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number } } {
  const normalized = (input ?? "").toLowerCase();
  let message = "I'm here to help with your career journey! What would you like to work on today?";

  if (normalized.includes("resume") || normalized.includes("cv")) {
    message = "I can help optimize your resume for ATS systems and hiring managers. Share your goals and I'll suggest targeted improvements.";
  } else if (normalized.includes("job") || normalized.includes("career") || normalized.includes("position")) {
    message = "Looking for a job? I can help you discover opportunities, tailor your applications, and optimize your profile for recruiters.";
  } else if (normalized.includes("recruit") || normalized.includes("hire") || normalized.includes("talent")) {
    message = "As a recruiter, I can help you source candidates, craft outreach messages, and track your hiring pipeline.";
  } else if (normalized.includes("interview")) {
    message = "Interview prep is key! I can help you practice common questions, structure your answers, and build confidence before your big day.";
  } else if (normalized.includes("video")) {
    message = "A strong video resume can set you apart. I can help with your script, delivery tips, and what to highlight for your target role.";
  } else if (normalized.includes("salary") || normalized.includes("negotiat")) {
    message = "Salary negotiation is important! Research market rates, know your worth, and be prepared to make a data-driven case for your ask.";
  } else if (normalized.includes("analytics") || normalized.includes("data") || normalized.includes("metrics")) {
    message = "I can help interpret your hiring metrics — from application conversion rates to time-to-hire — and suggest improvements.";
  } else if (normalized.includes("help") || normalized.includes("how") || normalized.includes("what")) {
    message = "Ask me anything about hiring, job searching, resume building, or video resumes and I'll do my best to help!";
  }

  const promptTokens = estimateTokens(input);
  const completionTokens = estimateTokens(message);
  return { message, usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens } };
}

// ---------------------------------------------------------------------------
// POST /api/ai/chat — persistent chat with session tracking
// ---------------------------------------------------------------------------
/**
 * Two request shapes:
 *
 *   A. New user turn:
 *      { message: string, sessionId?, history?, systemPrompt?, tools? }
 *
 *   B. Tool-result follow-up — the client executed the tool_calls we
 *      returned previously and is feeding the results back:
 *      { sessionId, assistantToolCalls: [...], toolResults: [...], tools? }
 *
 * Response:
 *   { message, sessionId, toolCalls?, usage }
 *
 * When `toolCalls` is present in the response, the client is expected to
 * execute each call (via its registry) and POST back with shape B. When
 * `toolCalls` is absent, the conversation has produced a final answer and
 * the round is complete.
 */
function isToolSpec(v: unknown): v is ToolSpec {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return t.type === "function" && typeof t.function === "object";
}

aiRoutes.post("/chat", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const limitError = await checkTokenBudget(c as any);
  if (limitError) return limitError;

  const body = await c.req.json().catch(() => ({}));
  const userMessage = typeof body.message === "string" ? body.message.trim() : "";
  const incomingSessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  const history: Array<{ role: string; content: string }> = Array.isArray(body.history) ? body.history : [];
  const customSystemPrompt = typeof body.systemPrompt === "string" && body.systemPrompt.trim()
    ? body.systemPrompt.trim()
    : SYSTEM_PROMPT;

  // Tool-calling inputs. The client owns tool definitions (the registry is
  // a frontend concern) — we forward them verbatim to the LLM and pass
  // any returned tool_calls back to the client for execution.
  const tools: ToolSpec[] = Array.isArray(body.tools) ? body.tools.filter(isToolSpec) : [];
  const assistantToolCalls: ToolCall[] = Array.isArray(body.assistantToolCalls) ? body.assistantToolCalls : [];
  const toolResults: Array<{ toolCallId: string; name?: string; result: unknown }> = Array.isArray(body.toolResults) ? body.toolResults : [];
  const isToolFollowup = assistantToolCalls.length > 0 && toolResults.length > 0;

  if (!userMessage && !isToolFollowup) {
    return c.json(error("VALIDATION_ERROR", "message is required"), 400);
  }

  // Closes gap-register #765 — Free-tier 20 Career Coach messages / month.
  // Gate only fresh user turns; tool follow-ups are part of the same logical
  // message round and were already counted on the originating turn.
  if (!isToolFollowup) {
    const blocked = await servicesProcessor.enforce(c, "career_coach_msg");
    if (blocked) return blocked;
  }

  const db = getDb();

  // Resolve or create a chat session. The ownership filter (`userId` AND
  // `id`) is load-bearing: without it, any authenticated user could post
  // a turn that persists into another user's session by guessing or
  // observing the UUID — leaking content + corrupting their history. If
  // the supplied session id is missing or belongs to someone else we
  // silently fall through to creating a fresh session below.
  let sessionId = incomingSessionId;
  if (sessionId) {
    const [existing] = await db
      .select({ id: schema.aiChatSessions.id })
      .from(schema.aiChatSessions)
      .where(and(
        eq(schema.aiChatSessions.id, sessionId),
        eq(schema.aiChatSessions.userId, userId),
      ))
      .limit(1);
    if (!existing) sessionId = null;
  }

  if (!sessionId) {
    const [created] = await db
      .insert(schema.aiChatSessions)
      .values({
        userId,
        title: (userMessage || "Tool-call follow-up").slice(0, 100),
        model: "google/gemini-flash-1.5",
        systemPrompt: customSystemPrompt,
        isActive: true,
      } as any)
      .returning({ id: schema.aiChatSessions.id });
    sessionId = created.id;
  } else {
    await db
      .update(schema.aiChatSessions)
      .set({ updatedAt: new Date() } as any)
      .where(eq(schema.aiChatSessions.id, sessionId));
  }

  // Tool follow-ups carry their own minimal context (the prior assistant
  // tool_call turn + tool results); plain user turns load history from
  // the DB if the client didn't supply it. Loaded BEFORE the user-turn
  // persistence below so we don't replay the just-written turn back at
  // the LLM as duplicated context.
  if (history.length === 0 && !isToolFollowup) {
    const prevMessages = await db
      .select({ role: schema.aiChatMessages.role, content: schema.aiChatMessages.content })
      .from(schema.aiChatMessages)
      .where(eq(schema.aiChatMessages.sessionId, sessionId))
      .orderBy(desc(schema.aiChatMessages.createdAt))
      .limit(20);
    history.push(...prevMessages.reverse());
  }

  // Persistence is best-effort: a failure here (Cloudflare per-invocation
  // subrequest cap, Neon transient, FK race) must NOT take down the
  // chat — the user message is already in the request body, the
  // assistant response is already generated, and the client cares about
  // getting the answer back. We log + swallow so the route still
  // returns 200. Once gap #1578's `_pg` surface confirms the failure
  // class we can either wrap the two writes in a Neon transaction (FK
  // race) or trim the dispatch chain (subrequest cap).
  //
  // We persist the user message BEFORE the LLM call so it lands while
  // there's still subrequest budget — the LLM dispatch + token-ledger
  // writes inside callMessages burn most of the per-invocation cap and
  // were leaving the post-LLM message inserts to fail every time
  // (see #1570 + #1578).
  async function persistChatMessage(role: "user" | "assistant", content: string, tokensUsed: number) {
    if (!content) return;
    try {
      await db.insert(schema.aiChatMessages).values({ sessionId, role, content, tokensUsed } as any);
    } catch (persistErr) {
      console.error("[ai/chat] persist message failed", { sessionId, role, tokensUsed, err: persistErr });
    }
  }

  if (!isToolFollowup && userMessage) {
    // `tokens_used` on the message row is denormalized + approximate;
    // the authoritative LLM cost ledger is `ai_usage_records` (charged
    // inside callMessages). Estimating from the message content keeps
    // the per-row column meaningful without needing the LLM result.
    await persistChatMessage("user", userMessage, estimateTokens(userMessage));
  }

  let responseMessage = "";
  let responseToolCalls: ToolCall[] = [];
  let promptTokens = 0;
  let completionTokens = 0;

  if (hasAnyLLMProviderKey(c.env as any)) {
    try {
      const llmMessages: LLMMessage[] = [
        { role: "system", content: customSystemPrompt },
        ...history.slice(-16).map((h) => ({
          role: (h.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
          content: h.content,
        })),
      ];

      if (isToolFollowup) {
        // Replay the assistant turn that requested the tools, then the
        // tool result messages — required for the model to produce its
        // final answer.
        llmMessages.push({ role: "assistant", content: "", tool_calls: assistantToolCalls });
        for (const r of toolResults) {
          llmMessages.push({
            role: "tool",
            tool_call_id: r.toolCallId,
            name: r.name,
            content: typeof r.result === "string" ? r.result : JSON.stringify(r.result ?? {}),
          });
        }
      } else {
        llmMessages.push({ role: "user", content: userMessage });
      }

      const llm = createLLMClient(c.env as any, c.var.user);
      const result = await llm.callMessages("chat", {
        useCase: "chat",
        messages: llmMessages,
        responseFormat: "text",
        tools: tools.length > 0 ? tools : undefined,
      }, { sessionId });
      responseMessage = result.content;
      responseToolCalls = result.toolCalls;
      promptTokens = result.usage.promptTokens;
      completionTokens = result.usage.completionTokens;
    } catch {
      const mock = generateMockResponse(userMessage || "");
      responseMessage = mock.message;
      promptTokens = mock.usage.promptTokens;
      completionTokens = mock.usage.completionTokens;
    }
  } else {
    const mock = generateMockResponse(userMessage || "");
    responseMessage = mock.message;
    promptTokens = mock.usage.promptTokens;
    completionTokens = mock.usage.completionTokens;
  }

  const totalTokens = promptTokens + completionTokens;

  // Assistant prose persistence — best-effort via `persistChatMessage`.
  // Tool-call / tool-result intermediate turns are session-local and not
  // replayed on history reload, so we skip them here.
  await persistChatMessage("assistant", responseMessage, completionTokens);

  // Token usage is charged automatically by `LLMClient.callMessages`
  // (with `sessionId` linked through the `LLMCallOpts`) — no second
  // recordTokenUsage call needed.

  // Meter the message count for the Free-tier 20/mo Career Coach cap.
  // Same `isToolFollowup` guard as the gate above so a multi-turn tool
  // exchange consumes one message, not three.
  if (!isToolFollowup) {
    servicesProcessor.meterEvent(c, "career_coach_msg", { sessionId });
  }

  return c.json(
    success({
      message: responseMessage,
      sessionId,
      toolCalls: responseToolCalls.length > 0 ? responseToolCalls : undefined,
      usage: { promptTokens, completionTokens, totalTokens },
    }),
    200,
  );
});

// ---------------------------------------------------------------------------
// GET /api/ai/sessions — list chat sessions for the current user
// ---------------------------------------------------------------------------
aiRoutes.get("/sessions", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  // The `model` column is stored for SuperAdmin audit but must NEVER
  // leak to consumers — they only see tokens, not vendors. Same rule
  // applies to /sessions/:id below.
  const sessions = await db
    .select({
      id: schema.aiChatSessions.id,
      title: schema.aiChatSessions.title,
      isActive: schema.aiChatSessions.isActive,
      createdAt: schema.aiChatSessions.createdAt,
      updatedAt: schema.aiChatSessions.updatedAt,
    })
    .from(schema.aiChatSessions)
    .where(eq(schema.aiChatSessions.userId, userId))
    .orderBy(desc(schema.aiChatSessions.updatedAt))
    .limit(50);
  return c.json(success(sessions), 200);
});

// ---------------------------------------------------------------------------
// GET /api/ai/sessions/:id — get session with messages
// ---------------------------------------------------------------------------
aiRoutes.get("/sessions/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [session] = await db
    .select()
    .from(schema.aiChatSessions)
    .where(eq(schema.aiChatSessions.id, c.req.param("id")))
    .limit(1);
  if (!session || session.userId !== userId) return c.json(error("NOT_FOUND", "Session not found"), 404);

  const messages = await db
    .select()
    .from(schema.aiChatMessages)
    .where(eq(schema.aiChatMessages.sessionId, session.id))
    .orderBy(schema.aiChatMessages.createdAt);

  // Strip `model` and `systemPrompt` — both reveal vendor / prompt
  // engineering details that consumers must never see. Audit access to
  // these fields lives on SuperAdmin-only routes.
  const { model: _model, systemPrompt: _sp, ...sessionPublic } = session;
  return c.json(success({ ...sessionPublic, messages }), 200);
});

// ---------------------------------------------------------------------------
// DELETE /api/ai/sessions/:id
// ---------------------------------------------------------------------------
aiRoutes.delete("/sessions/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [session] = await db
    .select({ id: schema.aiChatSessions.id, userId: schema.aiChatSessions.userId })
    .from(schema.aiChatSessions)
    .where(eq(schema.aiChatSessions.id, c.req.param("id")))
    .limit(1);
  if (!session || session.userId !== userId) return c.json(error("NOT_FOUND", "Session not found"), 404);
  await db.delete(schema.aiChatSessions).where(eq(schema.aiChatSessions.id, session.id));
  return c.json(success({ deleted: true }), 200);
});

aiRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "AI route not found" } }, 404),
);
