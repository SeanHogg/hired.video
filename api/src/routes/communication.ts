import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { clampLimit } from "../utils/pagination.js";
import * as communication from "../services/communication/communicationService.js";
import { success } from "../types/index.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const communicationRoutes = new Hono<AppEnv>();

communicationRoutes.get("/conversations", async (c) => {
  const uid = requireUser(c);
  return c.json(success(await communication.listConversations(uid)), 200);
});

communicationRoutes.post("/conversations", async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  return c.json(success(await communication.createConversation(uid, body)), 201);
});

communicationRoutes.get("/conversations/:conversationId", async (c) => {
  const uid = requireUser(c);
  return c.json(success(await communication.getConversationDetail(uid, c.req.param("conversationId"))), 200);
});

communicationRoutes.get("/messages", async (c) => {
  const uid = requireUser(c);
  const rows = await communication.listMessages(uid, {
    conversationId: c.req.query("conversationId") || undefined,
    // Same default/bounds the repository applies (100, 1..500).
    limit: clampLimit(c.req.query("limit"), 100, 500),
  });
  return c.json(success(rows), 200);
});

communicationRoutes.post("/messages", async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  const convoId = typeof body.conversationId === "string" ? body.conversationId : "";
  const content = typeof body.content === "string" ? body.content : "";
  return c.json(success(await communication.postMessage(uid, convoId, content)), 201);
});

communicationRoutes.post("/messages/mark-read", async (c) => {
  requireUser(c);
  return c.json(success({ success: true }), 200);
});

communicationRoutes.get("/email-templates", async (c) => {
  return c.json(success(await communication.listEmailTemplates()), 200);
});

communicationRoutes.get("/email-templates/:templateId", async (c) => {
  return c.json(success(await communication.getEmailTemplate(c.req.param("templateId"))), 200);
});

communicationRoutes.post("/email-templates", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(success(await communication.createEmailTemplate(body)), 201);
});

communicationRoutes.put("/email-templates/:templateId", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(success(await communication.updateEmailTemplate(c.req.param("templateId"), body)), 200);
});

communicationRoutes.delete("/email-templates/:templateId", async (c) => {
  await communication.deleteEmailTemplate(c.req.param("templateId"));
  return c.json(success({ success: true }), 200);
});

// #1970 — user-facing Outreach campaign list: the canonical `CampaignDTO[]`
// (string status + stats + audience), scoped to the caller's own campaigns.
communicationRoutes.get("/email-campaigns", async (c) => {
  const uid = requireUser(c);
  return c.json(success(await communication.listMyCampaigns(uid)), 200);
});

// #1971 — create through the canonical engine with the recipients persisted
// as a `list` audience so the campaign is actually sendable.
communicationRoutes.post("/email-campaigns", async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  return c.json(success(await communication.createMyCampaign(uid, body)), 201);
});

// Real send of one of the caller's campaigns via the CampaignService engine.
communicationRoutes.post("/email-campaigns/:campaignId/send", async (c) => {
  const uid = requireUser(c);
  return c.json(success(await communication.sendMyCampaign(uid, c.req.param("campaignId"))), 200);
});

// The caller's own outreach log (was every user's rows; writes now stamp the caller).
communicationRoutes.get("/tracking", async (c) => {
  const uid = requireUser(c);
  return c.json(success(await communication.listTracking(uid)), 200);
});

communicationRoutes.post("/tracking", async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  return c.json(success(await communication.recordTracking(uid, body)), 201);
});

communicationRoutes.post("/follow-ups", (c) => c.json(success({ success: true }), 201));

communicationRoutes.get("/external-contacts", (c) => c.json(success([]), 200));
communicationRoutes.post("/external-contacts", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(success({ id: crypto.randomUUID(), ...body }), 201);
});
communicationRoutes.put("/external-contacts/:contactId", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(success({ id: c.req.param("contactId"), ...body }), 200);
});
communicationRoutes.delete("/external-contacts/:contactId", (c) => c.json(success(undefined), 200));

communicationRoutes.get("/stats", (c) =>
  c.json(
    success({
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
    success([
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
  return c.json(success(postings), 201);
});
communicationRoutes.get("/job-boards/jobs/:jobId/postings", (c) =>
  c.json(success([{ id: "posting-1", jobId: c.req.param("jobId"), jobBoardId: "board-stub" }]), 200),
);
communicationRoutes.get("/job-boards/postings", (c) => c.json(success([]), 200));
communicationRoutes.get("/job-boards/stats", (c) =>
  c.json(
    success({
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
communicationRoutes.delete("/job-boards/postings/:postingId", (c) => c.json(success(true), 200));
