/**
 * Reader engagement (view beacon, read progress, claps, shares, the
 * owner's engagement summary) and the author-triggered AI classify (#175).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { buildAIErrorEnvelope } from "../../services/adapters/llm-error.js";
import {
  clapArticle,
  classifyOwnArticle,
  getArticleEngagement,
  loadOwnArticle,
  recordArticleReadProgress,
  recordArticleShare,
  recordArticleView,
} from "../../services/articles/engagement.js";
import { runArticleClassifier } from "./shared.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";

export const articleEngagementRoutes = new Hono<AppEnv>();

// POST /:id/view — lightweight view-count beacon (#858). Split out of the
// public slug read so that route can be edge-cached. Fire-and-forget from the
// client on article mount; bumps the denormalised `articles.view_count`.
articleEngagementRoutes.post("/:id/view", async (c) => {
  await recordArticleView(c.req.param("id"));
  return c.json(success({ recorded: true }), 200);
});

export const ReadProgressSchema = z.object({
  seconds: z.number().min(1).max(600), // beacon every ~30s; cap protects against tampering
  // Engagement source (#1577). `scroll` = visual reading (default), `narrator`
  // = read-aloud listening — both are real "consuming the content" signals and
  // accrue identically; the field is kept for per-source analytics.
  source: z.enum(["scroll", "narrator"]).default("scroll"),
});

// Verified-account-only payout counting (#1757): only an authenticated AND
// email-verified reader's seconds accrue to the partner-pool column.
articleEngagementRoutes.post("/:id/read-progress", validateJson(ReadProgressSchema, () => error("VALIDATION_ERROR", "Invalid payload")), async (c) => {
  const body = c.req.valid("json");
  const counted = await recordArticleReadProgress(c.req.param("id"), c.var.userId, body.seconds);
  return c.json(success({ counted }), 200);
});

export const ClapSchema = z.object({
  delta: z.number().int().min(1).max(50),
});

articleEngagementRoutes.post("/:id/clap", validateJson(ClapSchema, () => error("VALIDATION_ERROR", "Invalid clap payload")), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return c.json(success(await clapArticle(c.req.param("id"), userId, body.delta)), 200);
});

export const ShareSchema = z.object({
  channel: z.enum(["twitter", "linkedin", "email", "copy_link", "rss"]),
});

articleEngagementRoutes.post("/:id/share", validateJson(ShareSchema, () => error("VALIDATION_ERROR", "Invalid share payload")), async (c) => {
  const body = c.req.valid("json");
  await recordArticleShare({
    articleId: c.req.param("id"),
    userId: c.var.userId,
    channel: body.channel,
    userAgent: c.req.header("user-agent") ?? null,
  });
  return c.json(success({ recorded: true }), 200);
});

articleEngagementRoutes.get("/:id/engagement", async (c) => {
  const userId = requireUser(c);
  const rollups = await getArticleEngagement(c.req.param("id"), userId);
  return c.json(success({ rollups }), 200);
});

// ===========================================================================
// #175 — On-demand AI moderation classify. Author-triggered preview or
// publish-time gate. Writes quality_score + moderation_findings on the
// row, flips status / partner_program_eligible per severity.
// ===========================================================================

articleEngagementRoutes.post("/:id/classify", async (c) => {
  const userId = requireUser(c);
  const art = await loadOwnArticle(c.req.param("id"), userId);

  try {
    const result = await classifyOwnArticle(art, userId, (a) => runArticleClassifier(c, a));
    return c.json(success(result), 200);
  } catch (e) {
    // #529: exhausted AI plan → upgrade banner; else specific classifier fault.
    const envelope = buildAIErrorEnvelope(e);
    if (envelope) return c.json(error(envelope.code, envelope.message, envelope.payload), envelope.status);
    return c.json(error("CLASSIFIER_FAILED", e instanceof Error ? e.message : String(e)), 500);
  }
});
