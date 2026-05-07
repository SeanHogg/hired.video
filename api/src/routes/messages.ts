import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { checkAIUsage, requirePro } from "../middleware/tierEnforcement.js";
import {
  TIER_COPY,
  PERSONALIZE_TIER,
  type PersonalizeResponse,
} from "../../../shared/tier-copy.js";

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
// POST /api/messages/personalize — AI-personalized outreach message (Pro)
//
// Free users receive a generic template with variable substitution.
// Pro users get an LLM-generated message tailored to the recipient's
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
  const isProUser = !limitError; // if no limit error, either Pro or has credits remaining

  if (!hasAnyLLMProviderKey(c.env as any) || !isProUser) {
    // Return generic template with variable substitution
    const rolePhrase = jobTitle ? ` regarding the ${jobTitle} opportunity` : "";
    const companyPhrase = recipientCompany ? ` at ${recipientCompany}` : "";
    const basicResponse: PersonalizeResponse = {
      tier: PERSONALIZE_TIER.basic,
      subject: `Following up${rolePhrase}`,
      body: `Hi ${recipientName},\n\nI hope this message finds you well. I wanted to reach out${companyPhrase}${rolePhrase}.\n\nI believe my background aligns well with what you're looking for, and I'd love to connect to discuss further.\n\nBest regards,\n${senderName}`,
      note: TIER_COPY.upgradeForPersonalizedMessages(),
    };
    return c.json(success(basicResponse), 200);
  }

  // --- Pro tier: AI-generated personalized message ---
  try {
    const contextSection = context ? `\nAdditional context: ${context}` : "";
    const llm = createLLMClient(c.env as any, c.var.user);
    const { data } = await llm.callJson(
      "message_personalize",
      {
        systemPrompt: `You are an expert recruiter and professional communication specialist. Write personalized outreach messages that feel genuine, relevant, and compelling. Tone: ${tone}. Return valid JSON only.`,
        userMessage: `Write a personalized outreach message with these details:
- Recipient: ${recipientName}${recipientTitle ? `, ${recipientTitle}` : ""}${recipientCompany ? ` at ${recipientCompany}` : ""}
- Regarding: ${jobTitle ?? "a professional opportunity"}
- From: ${senderName}${contextSection}

Return JSON: { "subject": "<concise email subject line>", "body": "<2-3 paragraph message body, no salutation or sign-off>" }`,
        responseFormat: "json_object",
        useCase: "recruiter_outreach",
      },
      PersonalizeResponseSchema,
    );

    const proResponse: PersonalizeResponse = {
      tier: PERSONALIZE_TIER.pro,
      subject: data.subject,
      body: `Hi ${recipientName},\n\n${data.body}\n\nBest regards,\n${senderName}`,
    };
    return c.json(success(proResponse), 200);
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

// ---------------------------------------------------------------------------
// Direct messaging — inbox, conversations, send, read receipts (Gap #45)
// ---------------------------------------------------------------------------

const { conversations, conversationParticipants, messages, messageReadReceipts } = schema;

/** GET /api/messages/inbox — list conversations the current user participates in */
messageRoutes.get("/inbox", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const rows = await db
    .select({ convo: conversations })
    .from(conversationParticipants)
    .innerJoin(conversations, eq(conversationParticipants.conversationId, conversations.id))
    .where(eq(conversationParticipants.userId, uid))
    .orderBy(desc(conversations.updatedAt));

  return c.json(success(rows.map((r) => r.convo)), 200);
});

/** POST /api/messages/conversations — start a new conversation */
messageRoutes.post("/conversations", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => ({}));
  const subject = typeof body.subject === "string" ? body.subject : "Direct message";
  const participantIds: string[] = Array.isArray(body.participantIds) ? body.participantIds : [];

  const db = getDb();
  const [convo] = await db.insert(conversations).values({ subject, type: "direct" }).returning();

  const allParticipants = [...new Set([uid, ...participantIds])];
  await Promise.all(
    allParticipants.map((pId) =>
      db.insert(conversationParticipants).values({ conversationId: convo.id, userId: pId, role: "member" } as any),
    ),
  );

  return c.json(success(convo), 201);
});

/** GET /api/messages/conversations/:id — conversation detail + message history */
messageRoutes.get("/conversations/:id", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const convoId = c.req.param("id");
  const db = getDb();

  // Verify participant
  const [participant] = await db
    .select()
    .from(conversationParticipants)
    .where(and(eq(conversationParticipants.conversationId, convoId), eq(conversationParticipants.userId, uid)))
    .limit(1);
  if (!participant) return c.json(error("NOT_FOUND", "Conversation not found"), 404);

  const [convo] = await db.select().from(conversations).where(eq(conversations.id, convoId)).limit(1);
  if (!convo) return c.json(error("NOT_FOUND", "Conversation not found"), 404);

  const [msgRows, participants] = await Promise.all([
    db.select().from(messages).where(and(eq(messages.conversationId, convoId), eq(messages.isDeleted, false))).orderBy(desc(messages.createdAt)),
    db.select().from(conversationParticipants).where(eq(conversationParticipants.conversationId, convoId)),
  ]);

  // Annotate each message with whether current user has read it
  const readReceiptRows = await db
    .select({ messageId: messageReadReceipts.messageId })
    .from(messageReadReceipts)
    .where(eq(messageReadReceipts.userId, uid));
  const readSet = new Set(readReceiptRows.map((r) => r.messageId));

  const annotatedMessages = msgRows.map((m) => ({
    ...m,
    readByMe: m.senderId === uid || readSet.has(m.id),
  }));

  return c.json(success({ ...convo, participants, messages: annotatedMessages }), 200);
});

/** POST /api/messages/conversations/:id/send — send a message in a conversation */
messageRoutes.post("/conversations/:id/send", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const convoId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const content = typeof body.content === "string" && body.content.trim() ? body.content.trim() : null;
  if (!content) return c.json(error("VALIDATION_ERROR", "Message content is required"), 400);

  const db = getDb();

  // Verify participant
  const [participant] = await db
    .select()
    .from(conversationParticipants)
    .where(and(eq(conversationParticipants.conversationId, convoId), eq(conversationParticipants.userId, uid)))
    .limit(1);
  if (!participant) return c.json(error("NOT_FOUND", "Conversation not found"), 404);

  const [msg] = await db.insert(messages).values({
    conversationId: convoId,
    senderId: uid,
    content,
    contentType: body.contentType ?? "text",
  } as any).returning();

  // Touch conversation updatedAt for inbox ordering
  await db.update(conversations).set({ updatedAt: new Date() } as any).where(eq(conversations.id, convoId));

  return c.json(success(msg), 201);
});

/** PUT /api/messages/conversations/:id/read — mark all messages in a conversation as read */
messageRoutes.put("/conversations/:id/read", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const convoId = c.req.param("id");
  const db = getDb();

  // Verify participant
  const [participant] = await db
    .select()
    .from(conversationParticipants)
    .where(and(eq(conversationParticipants.conversationId, convoId), eq(conversationParticipants.userId, uid)))
    .limit(1);
  if (!participant) return c.json(error("NOT_FOUND", "Conversation not found"), 404);

  // Get all messages in conversation not sent by current user
  const unreadMsgs = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.conversationId, convoId), eq(messages.isDeleted, false)));

  // Insert read receipts (ignore conflicts for already-read messages)
  const now = new Date();
  await Promise.all(
    unreadMsgs.map((m) =>
      db.insert(messageReadReceipts)
        .values({ messageId: m.id, userId: uid, readAt: now } as any)
        .onConflictDoNothing()
        .catch(() => undefined),
    ),
  );

  return c.json(success({ markedRead: unreadMsgs.length }), 200);
});

messageRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Message route not found" } }, 404),
);
