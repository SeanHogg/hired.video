import { Hono } from "hono";
import { requestEnv } from "../utils/env.js";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { buildApiDeps } from "../services/apiDeps.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { aiFailure } from "../services/adapters/llm-error.js";
import { checkAIUsage } from "../middleware/tierEnforcement.js";
import {
  TIER_COPY,
  PERSONALIZE_TIER,
  type PersonalizeResponse,
} from "../../../shared/tier-copy.js";
import { listAiChatSessions, sendAiChatMessage } from "../services/messaging/aiChatService.js";
import {
  getThreadDetail,
  listInbox,
  markThreadRead,
  sendThreadMessage,
  startConversation,
} from "../services/messaging/conversationThreadService.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const messageRoutes = new Hono<AppEnv>();

messageRoutes.post("/", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listAiChatSessions(userId)), 200);
});

// Frontend AI service calls /api/chat/message in the legacy API.
// We map it under /api/messages/message and also mount /api/chat in app.ts.
messageRoutes.post("/message", async (c) => {
  const userId = requireUser(c);

  const body = await c.req.json().catch(() => ({}));
  const userMessage = typeof body.message === "string" ? body.message : "";

  const response = await sendAiChatMessage(userId, userMessage);
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
  const userId = requireUser(c);

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
  } catch (err) {
    // Configured Pro path threw — surface a typed AI_* envelope (with
    // correlationId) instead of silently downgrading to the basic
    // template as if it were the personalized result. The genuine
    // no-key / non-Pro fallback is the basic template returned above.
    return aiFailure(c, err, "[messages/personalize] LLM error");
  }
});

// ---------------------------------------------------------------------------
// Direct messaging — inbox, conversations, send, read receipts (Gap #45)
// Not-a-participant → 404 NOT_FOUND (DomainError from the thread service).
// ---------------------------------------------------------------------------

const threadDeps = (c: Parameters<typeof requestEnv>[0]) => ({ repos: buildApiDeps(requestEnv(c)).repos });

/** GET /api/messages/inbox — list conversations the current user participates in */
messageRoutes.get("/inbox", async (c) => {
  const uid = requireUser(c);
  return c.json(success(await listInbox(threadDeps(c), uid)), 200);
});

/** POST /api/messages/conversations — start a new conversation */
messageRoutes.post("/conversations", async (c) => {
  const uid = requireUser(c);

  const body = await c.req.json().catch(() => ({}));
  const subject = typeof body.subject === "string" ? body.subject : "Direct message";
  const participantIds: string[] = Array.isArray(body.participantIds) ? body.participantIds : [];

  const convo = await startConversation(threadDeps(c), { userId: uid, subject, participantIds });
  return c.json(success(convo), 201);
});

/** GET /api/messages/conversations/:id — conversation detail + message history */
messageRoutes.get("/conversations/:id", async (c) => {
  const uid = requireUser(c);
  const detail = await getThreadDetail(threadDeps(c), c.req.param("id"), uid);
  return c.json(success(detail), 200);
});

/** POST /api/messages/conversations/:id/send — send a message in a conversation */
messageRoutes.post("/conversations/:id/send", async (c) => {
  const uid = requireUser(c);

  const body = await c.req.json().catch(() => ({}));
  const content = typeof body.content === "string" && body.content.trim() ? body.content.trim() : null;
  if (!content) return c.json(error("VALIDATION_ERROR", "Message content is required"), 400);

  const msg = await sendThreadMessage(threadDeps(c), {
    conversationId: c.req.param("id"),
    userId: uid,
    content,
    contentType: body.contentType,
  });
  return c.json(success(msg), 201);
});

/** PUT /api/messages/conversations/:id/read — mark all messages in a conversation as read */
messageRoutes.put("/conversations/:id/read", async (c) => {
  const uid = requireUser(c);
  const markedRead = await markThreadRead(threadDeps(c), c.req.param("id"), uid);
  return c.json(success({ markedRead }), 200);
});
