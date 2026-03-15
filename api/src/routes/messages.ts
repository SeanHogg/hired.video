import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { aiChatSessions, aiChatMessages } = schema;

export const messageRoutes = new Hono<{ Variables: Variables }>();

function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

function generateMockResponse(input: string) {
  const normalized = (input ?? "").toLowerCase();
  let message = "I'm here to help! Ask me anything about resumes, jobs, or hiring.";

  if (normalized.includes("resume") || normalized.includes("cv")) {
    message =
      "I can help optimize your resume for ATS and hiring managers. Share what you'd like to improve, and I'll suggest updates.";
  } else if (normalized.includes("job") || normalized.includes("career") || normalized.includes("position")) {
    message =
      "Looking for a job? I can help you discover opportunities, tailor applications, and optimize your profile for recruiters.";
  } else if (normalized.includes("recruit") || normalized.includes("hire") || normalized.includes("talent")) {
    message =
      "As a recruiter, I can help you source candidates, craft outreach messages, and track hiring progress.";
  } else if (normalized.includes("analytics") || normalized.includes("data") || normalized.includes("metrics")) {
    message =
      "I can analyze your hiring data and help you interpret key metrics like time-to-hire, conversion rates, and engagement.";
  } else if (normalized.includes("help") || normalized.includes("how") || normalized.includes("what")) {
    message =
      "Ask me anything about hiring, job searching, or resume building and I'll do my best to help.";
  }

  const promptTokens = estimateTokens(input);
  const completionTokens = estimateTokens(message);
  return { message, usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens } };
}

messageRoutes.post("/", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);

  const db = getDb();
  const sessions = await db
    .select()
    .from(aiChatSessions)
    .where(eq(aiChatSessions.userId, userId))
    .orderBy(aiChatSessions.createdAt);

  return c.json(success(sessions), 200);
});

// Frontend AI service calls /api/chat/message in the legacy API.
// We map it under /api/messages/message and also mount /api/chat in app.ts.
messageRoutes.post("/message", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);

  const body = await c.req.json().catch(() => ({}));
  const userMessage = typeof body.message === "string" ? body.message : "";

  const db = getDb();
  let session = (await db
    .select()
    .from(aiChatSessions)
    .where(eq(aiChatSessions.userId, userId))
    .limit(1))[0];

  if (!session) {
    const [created] = await db
      .insert(aiChatSessions)
      .values({ userId, title: "AI Chat", model: "gpt-3.5", systemPrompt: "" } as any)
      .returning();
    session = created;
  }

  await db.insert(aiChatMessages).values({
    sessionId: session.id,
    role: "user",
    content: userMessage,
    tokensUsed: estimateTokens(userMessage),
  } as any);

  const response = generateMockResponse(userMessage);

  await db.insert(aiChatMessages).values({
    sessionId: session.id,
    role: "assistant",
    content: response.message,
    tokensUsed: response.usage.totalTokens,
  } as any);

  return c.json(success({ message: response.message, usage: response.usage }), 200);
});

messageRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_IMPLEMENTED", message: "Message routes coming soon" } }, 501),
);
