import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import type { Variables, AppEnv } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { CampaignService } from "../services/campaigns/CampaignService.js";
import {
  findOrCreateDirectConversation,
  sendMessage,
} from "../services/messaging/messagingService.js";

export const communicationRoutes = new Hono<AppEnv>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function userId(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

const { conversations, conversationParticipants, messages, emailTemplates, communicationTracking } = schema;

communicationRoutes.get("/conversations", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);

  const repos = buildRepos(getDb());
  const list = await repos.conversations.findConversationsForUser(uid);
  return c.json(ok(list), 200);
});

communicationRoutes.post("/conversations", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);

  const body = await c.req.json().catch(() => ({}));
  const participantIds: string[] = Array.isArray(body.participantUserIds)
    ? body.participantUserIds.filter((x: unknown): x is string => typeof x === "string" && x.length > 0)
    : [];
  // Numeric enums on the wire (0 = Direct, 1 = Group, 2 = Broadcast); the
  // frontend uses these consistently, but accept the string forms too so
  // server-side scripts and curl probes don't have to know the magic numbers.
  const type = body.type === 0 || body.type === "direct" || body.type === undefined ? "direct" : "group";

  const repos = buildRepos(getDb());

  // Direct conversation: dedupe on the participant pair so clicking
  // "Message" twice doesn't create two threads.
  if (type === "direct" && participantIds.length === 1) {
    const { conversation } = await findOrCreateDirectConversation(
      { repos },
      {
        initiatorId: uid,
        recipientId: participantIds[0],
        initialMessage: typeof body.initialMessage === "string" ? body.initialMessage : undefined,
      },
    );
    return c.json(ok(conversation), 201);
  }

  // Group / broadcast path — straight create with all participants.
  const subject = typeof body.title === "string" ? body.title : null;
  const conversation = await repos.conversations.insertConversation({ subject, type } as any);
  const allParticipants = Array.from(new Set([uid, ...participantIds]));
  await repos.conversations.insertConversationParticipants(
    allParticipants.map((u) => ({ conversationId: conversation.id, userId: u, role: "member" } as any)),
  );
  return c.json(ok(conversation), 201);
});

communicationRoutes.get("/conversations/:conversationId", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);

  const convoId = c.req.param("conversationId");
  const repos = buildRepos(getDb());
  const conversation = await repos.conversations.findConversationById(convoId);
  if (!conversation) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Conversation not found" } }, 404);

  const db = getDb();
  const participants = await db
    .select({ participant: conversationParticipants })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, convoId));
  const msgs = await repos.conversations.findMessagesForConversation(convoId);

  return c.json(
    ok({ ...conversation, participants: participants.map((r) => r.participant), messages: msgs }),
    200,
  );
});

communicationRoutes.get("/messages", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);

  const db = getDb();
  const rows = await db
    .select({ message: messages })
    .from(messages)
    .innerJoin(conversationParticipants, eq(messages.conversationId, conversationParticipants.conversationId))
    .where(eq(conversationParticipants.userId, uid))
    .orderBy(desc(messages.createdAt));

  return c.json(ok(rows.map((r) => r.message)), 200);
});

communicationRoutes.post("/messages", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);

  const body = await c.req.json().catch(() => ({}));
  const convoId = typeof body.conversationId === "string" ? body.conversationId : "";
  const content = typeof body.content === "string" ? body.content : "";

  const repos = buildRepos(getDb());
  const conversation = await repos.conversations.findConversationById(convoId);
  if (!conversation) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Conversation not found" } }, 404);

  try {
    const msg = await sendMessage({ repos }, { conversationId: convoId, senderId: uid, content });
    return c.json(ok(msg), 201);
  } catch (err) {
    return c.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: (err as Error).message } },
      400,
    );
  }
});

communicationRoutes.post("/messages/mark-read", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);
  return c.json(ok({ success: true }), 200);
});

communicationRoutes.get("/email-templates", async (c) => {
  const db = getDb();
  const rows = await db.select().from(emailTemplates).orderBy(desc(emailTemplates.createdAt));
  return c.json(ok(rows), 200);
});

communicationRoutes.get("/email-templates/:templateId", async (c) => {
  const db = getDb();
  const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, c.req.param("templateId"))).limit(1);
  if (!template) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Template not found" } }, 404);
  return c.json(ok(template), 200);
});

communicationRoutes.post("/email-templates", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  const [created] = await db
    .insert(emailTemplates)
    .values({
      name: String(body.name ?? "Untitled"),
      subject: String(body.subject ?? ""),
      htmlBody: String(body.body ?? ""),
      textBody: String(body.textBody ?? ""),
      variables: body.variables ?? [],
      isActive: body.isActive ?? true,
    } as any)
    .returning();
  return c.json(ok(created), 201);
});

communicationRoutes.put("/email-templates/:templateId", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  const [updated] = await db
    .update(emailTemplates)
    .set({
      name: body.name,
      subject: body.subject,
      htmlBody: body.body,
      textBody: body.textBody,
      variables: body.variables,
      isActive: body.isActive,
      updatedAt: new Date(),
    } as any)
    .where(eq(emailTemplates.id, c.req.param("templateId")))
    .returning();
  if (!updated) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Template not found" } }, 404);
  return c.json(ok(updated), 200);
});

communicationRoutes.delete("/email-templates/:templateId", async (c) => {
  const db = getDb();
  await db.delete(emailTemplates).where(eq(emailTemplates.id, c.req.param("templateId")));
  return c.json(ok({ success: true }), 200);
});

// #1970 — user-facing Outreach campaign list. Returns the canonical
// `CampaignDTO[]` (string status + stats + audience) from the engine, scoped
// to the caller's own campaigns, so Outreach drives the same reusable
// `<CampaignList>` as the SuperAdmin surface. The old handler returned raw DB
// rows (numeric-enum-shaped, no stats/audience) for EVERY user's campaigns.
communicationRoutes.get("/email-campaigns", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);
  const campaigns = await CampaignService.create(getDb()).listByUser(uid);
  return c.json(ok(campaigns), 200);
});

// #1971 — persist the recipients as a `list` audience so the campaign is
// actually sendable. The old handler inserted a bare row with no `audience`
// and dropped `recipients` entirely, so the now-real `/send` (which delegates
// to CampaignService.schedule) 400'd with "no audience selected". Route the
// create through the canonical engine instead of a raw insert.
communicationRoutes.post("/email-campaigns", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);

  const body = await c.req.json().catch(() => ({} as any));
  const rawRecipients = Array.isArray(body.recipients) ? body.recipients : [];
  const recipients = rawRecipients
    .filter((r: any) => r && typeof r.email === "string" && r.email.includes("@"))
    .map((r: any) => ({
      email: String(r.email),
      ...(r.name ? { name: String(r.name).slice(0, 255) } : {}),
    }));

  // The dialog creates a template first, then passes its id. Accept either the
  // legacy `templateId` or the dialog's `emailTemplateId`.
  const templateId = (body.templateId ?? body.emailTemplateId) || null;
  // CreateCampaignSchema requires a non-empty subject; the email's real
  // subject comes from the attached template at render time (resolveContent
  // falls back to it), so the campaign name is a safe placeholder.
  const subject = String(body.subject || body.name || "Campaign").slice(0, 500);

  const service = CampaignService.create(getDb());
  const created = await service.create(
    {
      name: String(body.name ?? "Campaign").slice(0, 255),
      subject,
      description: body.description ? String(body.description).slice(0, 1000) : undefined,
      templateId,
      audience: recipients.length > 0 ? { kind: "list", recipients } : undefined,
      status: "draft",
    },
    { createdByUserId: uid },
  );
  return c.json(ok(created), 201);
});

// Real send: hands the campaign to the canonical CampaignService engine
// (resolve audience → render → send via the email provider on the cron loop).
// Replaces the old no-op that just flipped status='sent' without delivering.
communicationRoutes.post("/email-campaigns/:campaignId/send", async (c) => {
  const service = CampaignService.create(getDb());
  const result = await service.schedule(c.req.param("campaignId"), null);
  if (result.ok && result.campaign) {
    return c.json(ok(result.campaign), 200);
  }
  return c.json(
    { success: false, error: { code: "VALIDATION_ERROR", message: result.reason ?? "Cannot send campaign" } },
    400,
  );
});

communicationRoutes.get("/tracking", async (c) => {
  const db = getDb();
  const rows = await db.select().from(communicationTracking).orderBy(desc(communicationTracking.createdAt));
  return c.json(ok(rows), 200);
});

communicationRoutes.post("/tracking", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  const [created] = await db
    .insert(communicationTracking)
    .values({
      userId: body.userId,
      type: String(body.type ?? ""),
      channel: String(body.channel ?? ""),
      referenceId: body.referenceId,
      referenceType: String(body.referenceType ?? ""),
      status: String(body.status ?? "sent"),
      metadata: body.metadata ?? {},
    } as any)
    .returning();
  return c.json(ok(created), 201);
});

communicationRoutes.post("/follow-ups", (c) => c.json(ok({ success: true }), 201));

communicationRoutes.get("/external-contacts", (c) => c.json(ok([]), 200));
communicationRoutes.post("/external-contacts", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(ok({ id: crypto.randomUUID(), ...body }), 201);
});
communicationRoutes.put("/external-contacts/:contactId", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(ok({ id: c.req.param("contactId"), ...body }), 200);
});
communicationRoutes.delete("/external-contacts/:contactId", (c) => c.json(ok(undefined), 200));

communicationRoutes.get("/stats", (c) =>
  c.json(
    ok({
      totalConversations: 0,
      activeConversations: 0,
      totalMessages: 0,
      unreadMessages: 0,
      totalEmailTemplates: 0,
      totalCampaigns: 0,
      campaignsSent: 0,
      totalExternalContacts: 0,
      pendingFollowUps: 0,
      responseRate: 0,
      channelStats: [],
      trendData: [],
    }),
    200,
  ),
);

communicationRoutes.get("/job-boards", (c) =>
  c.json(
    ok([
      {
        id: "board-stub",
        name: "General Jobs",
        slug: "general-jobs",
        description: "",
        logoUrl: null,
        websiteUrl: null,
        category: "general",
        tier: "free",
        costPerPosting: null,
        isActive: true,
        requiresApiKey: false,
        supportsAutoPosting: true,
        maxPostingDuration: null,
      },
    ]),
    200,
  ),
);
communicationRoutes.post("/job-boards/post", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const boardIds = Array.isArray(body?.boardIds) ? body.boardIds : [];
  const postings = boardIds.length
    ? boardIds.map((boardId: string, idx: number) => ({
        id: `posting-${idx + 1}`,
        jobId: body?.jobId ?? "",
        jobBoardId: boardId,
      }))
    : [{ id: "posting-1", jobId: body?.jobId ?? "", jobBoardId: "board-stub" }];
  return c.json(ok(postings), 201);
});
communicationRoutes.get("/job-boards/jobs/:jobId/postings", (c) =>
  c.json(ok([{ id: "posting-1", jobId: c.req.param("jobId"), jobBoardId: "board-stub" }]), 200),
);
communicationRoutes.get("/job-boards/postings", (c) => c.json(ok([]), 200));
communicationRoutes.get("/job-boards/stats", (c) =>
  c.json(
    ok({
      totalPostings: 0,
      activePostings: 0,
      totalViews: 0,
      totalApplications: 0,
      totalCost: 0,
      boardPerformance: [],
    }),
    200,
  ),
);
communicationRoutes.delete("/job-boards/postings/:postingId", (c) => c.json(ok(true), 200));

communicationRoutes.all("*", (c) =>
  c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Communication routes coming soon" }, timestamp: new Date().toISOString() }, 501),
);
