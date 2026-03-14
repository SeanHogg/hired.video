import { Hono } from "hono";
import type { Variables } from "../types/index.js";

export const communicationRoutes = new Hono<{ Variables: Variables }>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

const now = () => new Date().toISOString();

function conversationStub(id = crypto.randomUUID()) {
  return {
    id,
    title: "Conversation",
    type: 0,
    createdByUserId: "",
    companyId: undefined,
    isArchived: false,
    isMuted: false,
    lastActivityAt: now(),
    participants: [],
    messages: [],
    creationDateTime: now(),
    updateDateTime: now(),
  };
}

function messageStub(id = crypto.randomUUID()) {
  return {
    id,
    conversationId: "",
    content: "",
    messageType: 0,
    attachmentUrl: undefined,
    attachmentName: undefined,
    replyToMessageId: undefined,
    isEdited: false,
    editedAt: undefined,
    isDeleted: false,
    deletedAt: undefined,
    senderId: "",
    recipientId: "",
    readReceipts: [],
    creationDateTime: now(),
    updateDateTime: now(),
  };
}

function emailTemplateStub(id = crypto.randomUUID()) {
  return {
    id,
    name: "Default Template",
    description: "",
    subject: "",
    body: "",
    category: 8,
    targetRole: 0,
    isSystemTemplate: false,
    isActive: true,
    createdByUserId: "",
    companyId: undefined,
    variables: undefined,
    usageCount: 0,
    lastUsedAt: undefined,
    creationDateTime: now(),
    updateDateTime: now(),
  };
}

function emailCampaignStub(id = crypto.randomUUID()) {
  return {
    id,
    name: "Campaign",
    description: "",
    emailTemplateId: "",
    createdByUserId: "",
    companyId: undefined,
    status: 0,
    sentAt: undefined,
    totalRecipients: 0,
    emailsSent: 0,
    emailsDelivered: 0,
    emailsOpened: 0,
    emailsClicked: 0,
    repliesReceived: 0,
    recipients: [],
    creationDateTime: now(),
    updateDateTime: now(),
  };
}

function trackingStub(id = crypto.randomUUID()) {
  return {
    id,
    initiatorUserId: "",
    targetUserId: undefined,
    externalEmail: undefined,
    externalName: undefined,
    companyId: undefined,
    type: 0,
    channel: 0,
    subject: "",
    content: "",
    status: 0,
    priority: 1,
    tags: "",
    followUpDate: undefined,
    requiresFollowUp: false,
    followUpNotes: "",
    responseReceivedAt: undefined,
    responseContent: "",
    responseSentiment: "",
    relatedJobId: undefined,
    relatedResumeId: undefined,
    relatedConversationId: undefined,
    relatedEmailCampaignId: undefined,
    metadata: "",
    followUps: [],
    creationDateTime: now(),
    updateDateTime: now(),
  };
}

function externalContactStub(id = crypto.randomUUID()) {
  return {
    id,
    userId: "",
    companyId: undefined,
    email: "contact@example.com",
    firstName: "",
    lastName: "",
    jobTitle: "",
    companyName: "",
    phone: "",
    linkedInUrl: "",
    location: "",
    notes: "",
    tags: "",
    lastCommunicationAt: undefined,
    preferredFrequency: 3,
    isActive: true,
    creationDateTime: now(),
    updateDateTime: now(),
  };
}

const jobBoardStub = {
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
};

const jobBoardPostingStub = {
  id: "posting-stub",
  jobId: "",
  jobTitle: "",
  companyName: "",
  jobBoardId: jobBoardStub.id,
  jobBoardName: jobBoardStub.name,
  status: "pending",
  externalPostingId: null,
  externalUrl: null,
  postedAt: now(),
  expiresAt: null,
  views: 0,
  clicks: 0,
  applications: 0,
  cost: null,
};

communicationRoutes.get("/conversations", (c) => c.json(ok([]), 200));
communicationRoutes.post("/conversations", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const conv = { ...conversationStub(), title: body?.title || "Conversation", type: body?.type ?? 0 };
  return c.json(ok(conv), 201);
});
communicationRoutes.get("/conversations/:conversationId", (c) =>
  c.json(ok({ ...conversationStub(c.req.param("conversationId")), messages: [] }), 200),
);

communicationRoutes.get("/messages", (c) => c.json(ok([]), 200));
communicationRoutes.post("/messages", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const msg = {
    ...messageStub(),
    conversationId: body?.conversationId ?? "",
    content: body?.content ?? "",
    messageType: body?.messageType ?? 0,
  };
  return c.json(ok(msg), 201);
});
communicationRoutes.post("/messages/mark-read", (c) => c.json(ok({ success: true }), 200));

communicationRoutes.get("/email-templates", (c) => c.json(ok([]), 200));
communicationRoutes.get("/email-templates/:templateId", (c) => c.json(ok(emailTemplateStub(c.req.param("templateId"))), 200));
communicationRoutes.post("/email-templates", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(ok({ ...emailTemplateStub(), ...body, id: crypto.randomUUID(), usageCount: 0 }), 201);
});
communicationRoutes.put("/email-templates/:templateId", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(ok({ ...emailTemplateStub(c.req.param("templateId")), ...body }), 200);
});
communicationRoutes.delete("/email-templates/:templateId", (c) => c.json(ok(undefined), 200));

communicationRoutes.get("/email-campaigns", (c) => c.json(ok([]), 200));
communicationRoutes.post("/email-campaigns", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(ok({ ...emailCampaignStub(), ...body, id: crypto.randomUUID() }), 201);
});
communicationRoutes.post("/email-campaigns/:campaignId/send", (c) => c.json(ok({ success: true }), 200));

communicationRoutes.get("/tracking", (c) => c.json(ok([]), 200));
communicationRoutes.post("/tracking", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(ok({ ...trackingStub(), ...body, id: crypto.randomUUID() }), 201);
});
communicationRoutes.post("/follow-ups", (c) => c.json(ok({ success: true }), 201));

communicationRoutes.get("/external-contacts", (c) => c.json(ok([]), 200));
communicationRoutes.post("/external-contacts", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(ok({ ...externalContactStub(), ...body, id: crypto.randomUUID() }), 201);
});
communicationRoutes.put("/external-contacts/:contactId", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(ok({ ...externalContactStub(c.req.param("contactId")), ...body }), 200);
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

communicationRoutes.get("/job-boards", (c) => c.json(ok([jobBoardStub]), 200));
communicationRoutes.post("/job-boards/post", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const boardIds = Array.isArray(body?.boardIds) ? body.boardIds : [];
  const postings = boardIds.length
    ? boardIds.map((boardId: string, idx: number) => ({
        ...jobBoardPostingStub,
        id: `posting-${idx + 1}`,
        jobId: body?.jobId ?? "",
        jobBoardId: boardId,
      }))
    : [{ ...jobBoardPostingStub, jobId: body?.jobId ?? "" }];
  return c.json(ok(postings), 201);
});
communicationRoutes.get("/job-boards/jobs/:jobId/postings", (c) =>
  c.json(ok([{ ...jobBoardPostingStub, jobId: c.req.param("jobId") }]), 200),
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
