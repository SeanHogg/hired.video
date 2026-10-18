/**
 * POST /api/ai/chat — the career coach / AI Brain conversation turn, with
 * session persistence and client-executed tool calls.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import {
  createLLMClient,
  hasAnyLLMProviderKey,
  type LLMMessage,
  type ToolCall,
  type ToolSpec,
} from "../../services/adapters/llm-client.js";
import { aiFailure } from "../../services/adapters/llm-error.js";
import { estimateTokens } from "../../services/adapters/llm-stream.js";
import { checkTokenBudget } from "../../middleware/tierEnforcement.js";
import { servicesProcessor } from "../../domains/services-processing/index.js";
import { getPrompt } from "../../../../shared/ai-prompts/index.js";
import {
  loadCoachHistory,
  persistCoachMessage,
  resolveCoachSession,
} from "../../services/messaging/aiCoachSessions.js";
import { requireUser } from "../helpers/routerHelpers.js";

export const aiChatRoutes = new Hono<AppEnv>();

// Career-coach persona — single source in shared/ai-prompts/. The
// in-app AIChatPanel reads from the same prompt so the persona never
// drifts between the panel's enhanced prompt and this route's default.
export const SYSTEM_PROMPT = getPrompt("career-coach").render({});

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

  const promptTokens = estimateTokens(input.length);
  const completionTokens = estimateTokens(message.length);
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

aiChatRoutes.post("/chat", async (c) => {
  const userId = requireUser(c);

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

  // Resolve or create a chat session (owner-filtered — a missing or foreign
  // session id silently falls through to a fresh session).
  const sessionId = await resolveCoachSession(userId, incomingSessionId, {
    title: (userMessage || "Tool-call follow-up").slice(0, 100),
    systemPrompt: customSystemPrompt,
  });

  // Tool follow-ups carry their own minimal context (the prior assistant
  // tool_call turn + tool results); plain user turns load history from
  // the DB if the client didn't supply it. Loaded BEFORE the user-turn
  // persistence below so we don't replay the just-written turn back at
  // the LLM as duplicated context.
  if (history.length === 0 && !isToolFollowup) {
    history.push(...(await loadCoachHistory(sessionId)));
  }

  // Persistence is best-effort (persistCoachMessage logs + swallows). We
  // persist the user message BEFORE the LLM call so it lands while there's
  // still subrequest budget — the LLM dispatch + token-ledger writes inside
  // callMessages burn most of the per-invocation cap (#1570 + #1578).
  const persistChatMessage = (role: "user" | "assistant", content: string, tokensUsed: number) =>
    persistCoachMessage(sessionId, role, content, tokensUsed);

  if (!isToolFollowup && userMessage) {
    // `tokens_used` on the message row is denormalized + approximate;
    // the authoritative LLM cost ledger is `ai_usage_records` (charged
    // inside callMessages). Estimating from the message content keeps
    // the per-row column meaningful without needing the LLM result.
    await persistChatMessage("user", userMessage, estimateTokens(userMessage.length));
  }

  let responseMessage = "";
  let responseToolCalls: ToolCall[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  // Gateway trace id (`llm-…`) for this completion — echoed back so the
  // client/support can quote it for server-side diagnostics. Undefined on
  // the mock fallback path (no gateway call was made).
  let traceId: string | undefined;

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
      traceId = result.usage.traceId;
    } catch (err) {
      // Configured-but-threw: surface a typed AI_* envelope (correlationId
      // + upgrade banner on plan exhaustion) instead of silently serving a
      // canned mock reply as if the assistant answered. The no-key branch
      // below remains the genuine mock fallback.
      return aiFailure(c, err, "[ai/chat] LLM error");
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
      usage: { promptTokens, completionTokens, totalTokens, ...(traceId ? { traceId } : {}) },
    }),
    200,
  );
});
