import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { callLLMWithMessagesAndUsage, getApiKey, MODEL_CATALOG } from "../services/ai.js";
import type { LLMMessage } from "../services/ai.js";
import { attachTokenBudget, checkTokenBudget } from "../middleware/tierEnforcement.js";
import { recordTokenUsage } from "../services/billing.js";

export const aiRoutes = new Hono<{ Variables: Variables }>();

// Piggy-back the live token-budget onto every AI response so clients can
// update the AI-tokens UI from the same round-trip. See attachTokenBudget.
aiRoutes.use("*", attachTokenBudget());

// GET /api/ai/models — returns available LLM models for the frontend settings UI
aiRoutes.get("/models", (c) => {
  return c.json(success(MODEL_CATALOG));
});

const SYSTEM_PROMPT = `You are an AI career assistant for hired.video, a platform for video resumes, job search, and talent management.
Help users with: resume writing and optimization, video resume tips, job searching and applications, interview preparation, career advice, networking, and recruitment.
Be concise, actionable, and encouraging. When relevant, suggest platform features that could help.`;

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
// POST /api/ai/context — legacy context-aware assistant (mock)
// ---------------------------------------------------------------------------
aiRoutes.post("/context", async (c) => {
  const limitError = await checkTokenBudget(c as any);
  if (limitError) return limitError;
  const body = await c.req.json().catch(() => ({}));
  const userMessage = typeof body?.message === "string" ? body.message : "";
  const response = generateMockResponse(userMessage);

  return c.json(
    success({
      message: response.message,
      action: body?.action,
      contextType: body?.context?.contextType,
      usage: response.usage,
    }),
    200,
  );
});

// ---------------------------------------------------------------------------
// POST /api/ai/chat — persistent chat with session tracking
// ---------------------------------------------------------------------------
aiRoutes.post("/chat", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const limitError = await checkTokenBudget(c as any);
  if (limitError) return limitError;

  const body = await c.req.json().catch(() => ({}));
  const userMessage = typeof body.message === "string" ? body.message.trim() : "";
  if (!userMessage) return c.json(error("VALIDATION_ERROR", "message is required"), 400);

  const incomingSessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  const history: Array<{ role: string; content: string }> = Array.isArray(body.history) ? body.history : [];
  // Accept a custom system prompt from the frontend (includes user role, context, etc.)
  const customSystemPrompt = typeof body.systemPrompt === "string" && body.systemPrompt.trim()
    ? body.systemPrompt.trim()
    : SYSTEM_PROMPT;
  const db = getDb();

  // Resolve or create a chat session
  let sessionId = incomingSessionId;
  if (sessionId) {
    const [existing] = await db
      .select({ id: schema.aiChatSessions.id })
      .from(schema.aiChatSessions)
      .where(eq(schema.aiChatSessions.id, sessionId))
      .limit(1);
    if (!existing) sessionId = null;
  }

  if (!sessionId) {
    const [created] = await db
      .insert(schema.aiChatSessions)
      .values({
        userId,
        title: userMessage.slice(0, 100),
        model: "google/gemini-flash-1.5",
        systemPrompt: customSystemPrompt,
        isActive: true,
      } as any)
      .returning({ id: schema.aiChatSessions.id });
    sessionId = created.id;
  } else {
    // Update the session's updatedAt so it bubbles to top of history list
    await db
      .update(schema.aiChatSessions)
      .set({ updatedAt: new Date() } as any)
      .where(eq(schema.aiChatSessions.id, sessionId));
  }

  // Fetch previous messages when no history provided
  if (history.length === 0) {
    const prevMessages = await db
      .select({ role: schema.aiChatMessages.role, content: schema.aiChatMessages.content })
      .from(schema.aiChatMessages)
      .where(eq(schema.aiChatMessages.sessionId, sessionId))
      .orderBy(desc(schema.aiChatMessages.createdAt))
      .limit(20);
    history.push(...prevMessages.reverse());
  }

  let responseMessage: string;
  let promptTokens: number;
  let completionTokens: number;
  let model = "mock";

  const apiKey = getApiKey((c.env as any) ?? {});
  if (apiKey) {
    try {
      // Build a proper messages array for multi-turn conversation
      const llmMessages: LLMMessage[] = [
        { role: "system", content: customSystemPrompt },
        ...history.slice(-16).map((h) => ({
          role: (h.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
          content: h.content,
        })),
        { role: "user", content: userMessage },
      ];

      const result = await callLLMWithMessagesAndUsage(apiKey, {
        messages: llmMessages,
        responseFormat: "text",
        temperature: 0.7,
      });
      responseMessage = result.content;
      promptTokens = result.usage.promptTokens;
      completionTokens = result.usage.completionTokens;
      model = result.usage.model;
    } catch {
      const mock = generateMockResponse(userMessage);
      responseMessage = mock.message;
      promptTokens = mock.usage.promptTokens;
      completionTokens = mock.usage.completionTokens;
    }
  } else {
    const mock = generateMockResponse(userMessage);
    responseMessage = mock.message;
    promptTokens = mock.usage.promptTokens;
    completionTokens = mock.usage.completionTokens;
  }

  const totalTokens = promptTokens + completionTokens;

  // Persist the exchange
  await db.insert(schema.aiChatMessages).values([
    { sessionId, role: "user", content: userMessage, tokensUsed: promptTokens },
    { sessionId, role: "assistant", content: responseMessage, tokensUsed: completionTokens },
  ] as any);

  // Track usage via the central recorder (debits monthly OR pack bucket).
  if (totalTokens > 0) {
    await recordTokenUsage({
      userId,
      model,
      featureKey: "chat",
      promptTokens,
      completionTokens,
      sessionId,
    });
  }

  return c.json(success({ message: responseMessage, sessionId, usage: { promptTokens, completionTokens, totalTokens } }), 200);
});

// ---------------------------------------------------------------------------
// GET /api/ai/sessions — list chat sessions for the current user
// ---------------------------------------------------------------------------
aiRoutes.get("/sessions", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const sessions = await db
    .select({
      id: schema.aiChatSessions.id,
      title: schema.aiChatSessions.title,
      model: schema.aiChatSessions.model,
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

  return c.json(success({ ...session, messages }), 200);
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
