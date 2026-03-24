import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { callLLMJson, getApiKey } from "../services/ai.js";
import { checkAIUsage, requirePremium } from "../middleware/tierEnforcement.js";

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

// ---------------------------------------------------------------------------
// POST /api/messages/personalize — AI-personalized outreach message (Premium)
//
// Free users receive a generic template with variable substitution.
// Premium users get an LLM-generated message tailored to the recipient's
// profile, the role, and the desired tone.
// ---------------------------------------------------------------------------

const PersonalizeSchema = z.object({
  recipientName: z.string().min(1).max(200),
  recipientTitle: z.string().optional(),
  recipientCompany: z.string().optional(),
  jobTitle: z.string().optional(),
  senderName: z.string().min(1).max(200),
  context: z.string().max(2000).optional(),
  tone: z.enum(["professional", "friendly", "concise"]).default("professional"),
});

const PersonalizeResponseSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

messageRoutes.post("/personalize", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = PersonalizeSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const { recipientName, recipientTitle, recipientCompany, jobTitle, senderName, context, tone } = parsed.data;

  // --- Free tier: generic template ---
  const limitError = await checkAIUsage(c as any);
  const isPremiumUser = !limitError; // if no limit error, either premium or has credits remaining
  const apiKey = getApiKey((c.env as any) ?? {});

  if (!apiKey || !isPremiumUser) {
    // Return generic template with variable substitution
    const rolePhrase = jobTitle ? ` regarding the ${jobTitle} opportunity` : "";
    const companyPhrase = recipientCompany ? ` at ${recipientCompany}` : "";
    return c.json(
      success({
        tier: "basic",
        subject: `Following up${rolePhrase}`,
        body: `Hi ${recipientName},\n\nI hope this message finds you well. I wanted to reach out${companyPhrase}${rolePhrase}.\n\nI believe my background aligns well with what you're looking for, and I'd love to connect to discuss further.\n\nBest regards,\n${senderName}`,
        note: "Upgrade to Premium for AI-personalized messages tailored to each recipient.",
      }),
      200,
    );
  }

  // --- Premium tier: AI-generated personalized message ---
  try {
    const contextSection = context ? `\nAdditional context: ${context}` : "";
    const result = await callLLMJson(
      apiKey,
      {
        systemPrompt: `You are an expert recruiter and professional communication specialist. Write personalized outreach messages that feel genuine, relevant, and compelling. Tone: ${tone}. Return valid JSON only.`,
        userMessage: `Write a personalized outreach message with these details:
- Recipient: ${recipientName}${recipientTitle ? `, ${recipientTitle}` : ""}${recipientCompany ? ` at ${recipientCompany}` : ""}
- Regarding: ${jobTitle ?? "a professional opportunity"}
- From: ${senderName}${contextSection}

Return JSON: { "subject": "<concise email subject line>", "body": "<2-3 paragraph message body, no salutation or sign-off>" }`,
        responseFormat: "json_object",
        temperature: 0.7,
      },
      PersonalizeResponseSchema,
    );

    const db = getDb();
    await db.insert(schema.aiUsageRecords).values({
      userId,
      model: "google/gemini-flash-1.5",
      featureKey: "message_personalize",
      promptTokens: Math.round(((context ?? "").length + recipientName.length + 200) / 4),
      completionTokens: Math.round((result.subject.length + result.body.length) / 4),
      totalTokens: Math.round(((context ?? "").length + result.subject.length + result.body.length + 300) / 4),
    });

    return c.json(
      success({
        tier: "premium",
        subject: result.subject,
        body: `Hi ${recipientName},\n\n${result.body}\n\nBest regards,\n${senderName}`,
      }),
      200,
    );
  } catch {
    // Fallback to template on LLM error
    const rolePhrase = jobTitle ? ` regarding the ${jobTitle} opportunity` : "";
    return c.json(
      success({
        tier: "basic",
        subject: `Following up${rolePhrase}`,
        body: `Hi ${recipientName},\n\nI wanted to reach out and connect with you${rolePhrase}. I believe there's a strong alignment between my background and what you're looking for.\n\nWould you be open to a quick conversation?\n\nBest regards,\n${senderName}`,
      }),
      200,
    );
  }
});

messageRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_IMPLEMENTED", message: "Message routes coming soon" } }, 501),
);
