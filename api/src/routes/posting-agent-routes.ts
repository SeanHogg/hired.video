/**
 * /api/distribution/posting-agent — AI posting agent settings, drafts,
 * pause-link, and approve/skip/rewrite/undo (#2300).
 *
 * Mounted from distribution.ts so Hub queue routes stay a thin HTTP layer
 * and the agent surface can grow without bloating that file.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { error, success } from "../types/index.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import {
  captionLimitFor,
  type DistributionDestination,
} from "../../../shared/social-publish-jobs.js";
import { fitCaption, agentJobNeedsPreparedClip } from "../../../shared/posting-agent.js";
import { verifyAgentPauseToken } from "../services/distribution/agent-pause-token.js";
import {
  localeFromAcceptLanguage,
  pauseConfirmPage,
  pauseDonePage,
  pauseInvalidPage,
} from "../services/distribution/agent-pause-page.js";
import { gateAgentDraftApprove } from "../services/distribution/gate-agent-draft.js";
import { pausePostingAgent } from "../services/distribution/pause-posting-agent.js";
import {
  getSettings,
  upsertSettings,
  enableAgent,
} from "../repositories/postingAgentSettingsRepository.js";
import {
  listAgentDrafts,
  approveAgentDraft,
  skipAgentDraft,
  updateAgentDraftCaption,
  getAgentDraft,
  undoAgentDraft,
  countExpiredAgentDrafts,
  attachAgentJobVariant,
} from "../repositories/socialPublishJobRepository.js";
import { requirePro } from "../middleware/auth-gates.js";
import { generateSocialCaption } from "../../../shared/social-caption.js";
import type { VideoPublishPlatform } from "../../../shared/social-platforms.js";
import { validateJson } from "./helpers/validate.js";

export const postingAgentRoutes = new Hono<AppEnv>();

const AgentSettingsSchema = z.object({
  mode: z.enum(["approve", "auto"]).optional(),
  cadence: z.enum(["light", "steady", "daily"]).optional(),
  postMinute: z.number().min(0).max(1439).optional(),
  destinations: z.array(z.string()).optional(),
  quietStartMinute: z.number().min(0).max(1439).optional(),
  quietEndMinute: z.number().min(0).max(1439).optional(),
  emailDigest: z.boolean().optional(),
});

const RewriteCaptionSchema = z.object({
  caption: z.string().min(1).max(5000).optional(),
});

const DraftVariantSchema = z.object({
  renderVariantId: UuidLikeSchema.optional(),
});

const AGENT_SETTINGS_DEFAULTS = {
  enabled: false,
  mode: "approve" as const,
  cadence: "steady" as const,
  postMinute: 720,
  destinations: ["feed"] as string[],
  quietStartMinute: 21 * 60,
  quietEndMinute: 8 * 60,
  emailDigest: true,
  pausedReason: null as string | null,
  nextPlanAt: null as Date | null,
};

/** GET /api/distribution/posting-agent/settings - get user's agent settings */
postingAgentRoutes.get("/posting-agent/settings", async (c) => {
  const userId = c.var.userId;
  const settings = await getSettings(userId);
  const globallyEnabled = (c.env as { POSTING_AGENT_ENABLED?: string }).POSTING_AGENT_ENABLED !== "false";
  return c.json(success({ ...(settings ?? AGENT_SETTINGS_DEFAULTS), globallyEnabled }));
});

/** POST /api/distribution/posting-agent/settings - update agent settings */
postingAgentRoutes.post("/posting-agent/settings", requirePro("AI Posting Agent"), validateJson(AgentSettingsSchema, () => error("VALIDATION_ERROR", "Invalid request"), { emptyBody: null }), async (c) => {
  const userId = c.var.userId;
  const body = c.req.valid("json");

  const settings = await upsertSettings(userId, body);
  return c.json(success(settings));
});

/** POST /api/distribution/posting-agent/start - enable the agent */
postingAgentRoutes.post("/posting-agent/start", requirePro("AI Posting Agent"), async (c) => {
  const userId = c.var.userId;
  const body = await c.req.json().catch(() => null);
  if (body && typeof body === "object") {
    const parsed = AgentSettingsSchema.safeParse(body);
    if (parsed.success) await upsertSettings(userId, parsed.data);
  }
  const settings = await enableAgent(userId);
  return c.json(success(settings));
});

/** POST /api/distribution/posting-agent/pause - disable the agent (user kill switch). */
postingAgentRoutes.post("/posting-agent/pause", async (c) => {
  const userId = c.var.userId;
  const settings = await pausePostingAgent(userId, "user");
  return c.json(success(settings));
});

/** GET /api/distribution/posting-agent/pause-link?token= — confirm page only (no state change). */
postingAgentRoutes.get("/posting-agent/pause-link", async (c) => {
  const token = c.req.query("token") ?? "";
  const locale = localeFromAcceptLanguage(c.req.header("Accept-Language"));
  const userId = verifyAgentPauseToken(token);
  if (!userId) return c.html(pauseInvalidPage(locale), 401);
  return c.html(pauseConfirmPage(token, locale));
});

/** POST /api/distribution/posting-agent/pause-link?token= — actually pause (from the confirm form). */
postingAgentRoutes.post("/posting-agent/pause-link", async (c) => {
  const token = c.req.query("token") ?? "";
  const locale = localeFromAcceptLanguage(c.req.header("Accept-Language"));
  const userId = verifyAgentPauseToken(token);
  if (!userId) return c.html(pauseInvalidPage(locale), 401);
  await pausePostingAgent(userId, "user");
  return c.html(pauseDonePage(locale));
});

/** GET /api/distribution/posting-agent/drafts - list agent drafts */
postingAgentRoutes.get("/posting-agent/drafts", async (c) => {
  const userId = c.var.userId;
  const drafts = await listAgentDrafts(userId);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const expiredCount = await countExpiredAgentDrafts(userId, since);
  return c.json(success({ drafts, expiredCount }));
});

/** POST /api/distribution/posting-agent/drafts/approve-all - before :id so "approve-all" is not captured. */
postingAgentRoutes.post("/posting-agent/drafts/approve-all", requirePro("AI Posting Agent"), async (c) => {
  const userId = c.var.userId;
  const drafts = await listAgentDrafts(userId);
  const now = new Date();
  let approved = 0;
  for (const draft of drafts) {
    if (draft.status !== "draft" || draft.needsClip) continue;
    const gate = await gateAgentDraftApprove(draft.id, userId, now);
    if (!gate.ok) continue;
    if (approved > 0) await new Promise((r) => setTimeout(r, 1000));
    if (await approveAgentDraft(draft.id, userId, now)) approved += 1;
  }
  return c.json(success({ approved }));
});

/** POST /api/distribution/posting-agent/drafts/:id/approve - approve a draft */
postingAgentRoutes.post("/posting-agent/drafts/:id/approve", requirePro("AI Posting Agent"), validateJson(DraftVariantSchema, () => error("VALIDATION_ERROR", "Invalid request")), async (c) => {
  const userId = c.var.userId;
  const draftId = c.req.param("id");

  if (!UuidLikeSchema.safeParse(draftId).success) {
    return c.json(error("VALIDATION_ERROR", "Invalid draft ID"), 400);
  }

  const now = new Date();
  const body = c.req.valid("json");
  const gate = await gateAgentDraftApprove(draftId, userId, now);
  if (gate.ok === false) {
    switch (gate.reason) {
      case "missing":
        return c.json(error("NOT_FOUND", "Draft not found or already processed"), 404);
      case "rescheduled":
        return c.json(success({ approved: false, rescheduled: true, runAt: gate.runAt.toISOString() }));
      case "expired":
        return c.json(success({ approved: false, expired: true }));
      case "capped":
        return c.json(error("RATE_LIMITED", "Daily limit reached for this destination"), 429);
      case "postYourself":
        return c.json(success({ approved: false, postYourself: true }));
    }
  }

  const draft = await getAgentDraft(draftId, userId);
  if (!draft || draft.status !== "draft") {
    return c.json(error("NOT_FOUND", "Draft not found or already processed"), 404);
  }
  const variantId = body.renderVariantId ?? draft.renderVariantId;
  if (
    agentJobNeedsPreparedClip({
      source: "agent",
      destination: draft.destination,
      renderVariantId: variantId,
      postYourself: draft.postYourself,
    })
  ) {
    return c.json(error("VALIDATION_ERROR", "Prepare the clip before approving"), 400);
  }
  if (body.renderVariantId) {
    await attachAgentJobVariant(draftId, userId, body.renderVariantId, now);
  }
  const ok = await approveAgentDraft(draftId, userId, now);
  if (!ok) return c.json(error("NOT_FOUND", "Draft not found or already processed"), 404);

  return c.json(success({ approved: true }));
});

/** POST /api/distribution/posting-agent/drafts/:id/prepare — attach a fitted cut. */
postingAgentRoutes.post("/posting-agent/drafts/:id/prepare", requirePro("AI Posting Agent"), async (c) => {
  const userId = c.var.userId;
  const draftId = c.req.param("id");
  if (!UuidLikeSchema.safeParse(draftId).success) {
    return c.json(error("VALIDATION_ERROR", "Invalid draft ID"), 400);
  }
  const body = await c.req.json().catch(() => ({}));
  const parsed = DraftVariantSchema.safeParse(body ?? {});
  if (!parsed.success || !parsed.data.renderVariantId) {
    return c.json(error("VALIDATION_ERROR", "renderVariantId is required"), 400);
  }
  const ok = await attachAgentJobVariant(draftId, userId, parsed.data.renderVariantId);
  if (!ok) return c.json(error("NOT_FOUND", "Draft not found"), 404);
  return c.json(success({ prepared: true, renderVariantId: parsed.data.renderVariantId }));
});

/** POST /api/distribution/posting-agent/drafts/:id/skip - skip a draft */
postingAgentRoutes.post("/posting-agent/drafts/:id/skip", requirePro("AI Posting Agent"), async (c) => {
  const userId = c.var.userId;
  const draftId = c.req.param("id");

  if (!UuidLikeSchema.safeParse(draftId).success) {
    return c.json(error("VALIDATION_ERROR", "Invalid draft ID"), 400);
  }

  const ok = await skipAgentDraft(draftId, userId, new Date());
  if (!ok) return c.json(error("NOT_FOUND", "Draft not found or already processed"), 404);

  return c.json(success({ skipped: true }));
});

/** POST /api/distribution/posting-agent/drafts/:id/rewrite - rewrite caption */
postingAgentRoutes.post("/posting-agent/drafts/:id/rewrite", requirePro("AI Posting Agent"), async (c) => {
  const userId = c.var.userId;
  const draftId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = RewriteCaptionSchema.safeParse(body ?? {});

  if (!parsed.success || !UuidLikeSchema.safeParse(draftId).success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request"), 400);
  }

  const draft = await getAgentDraft(draftId, userId);
  if (!draft) return c.json(error("NOT_FOUND", "Draft not found or already processed"), 404);
  const dest = draft.destination as DistributionDestination;
  let caption = parsed.data.caption;
  if (!caption) {
    const platform: VideoPublishPlatform = dest === "feed" || dest === "tiktok" ? "linkedin" : (dest as VideoPublishPlatform);
    const generated = await generateSocialCaption(
      { transcript: draft.caption, resumeText: draft.caption },
      { platforms: [platform], tone: "professional", maxLength: captionLimitFor(dest) },
      null,
    );
    caption = [generated.hook, generated.caption, generated.hashtags.map((h) => `#${h}`).join(" ")].filter(Boolean).join("\n\n");
  }
  caption = fitCaption(caption, captionLimitFor(dest));

  const ok = await updateAgentDraftCaption(draftId, userId, caption, new Date());
  if (!ok) return c.json(error("NOT_FOUND", "Draft not found or already processed"), 404);

  return c.json(success({ rewritten: true, caption }));
});

/** POST /api/distribution/posting-agent/drafts/:id/undo - revert approval within 10 min */
postingAgentRoutes.post("/posting-agent/drafts/:id/undo", requirePro("AI Posting Agent"), async (c) => {
  const userId = c.var.userId;
  const draftId = c.req.param("id");
  if (!UuidLikeSchema.safeParse(draftId).success) {
    return c.json(error("VALIDATION_ERROR", "Invalid draft ID"), 400);
  }
  const ok = await undoAgentDraft(draftId, userId, new Date());
  if (!ok) return c.json(error("NOT_FOUND", "Undo window closed or draft not found"), 404);
  return c.json(success({ undone: true }));
});
