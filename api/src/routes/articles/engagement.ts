/**
 * Reader engagement (view beacon, read progress, claps, shares, the
 * owner's engagement summary) and the author-triggered AI classify (#175).
 */
import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { buildAIErrorEnvelope } from "../../services/adapters/llm-error.js";
import { getDb, schema } from "../../db/index.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";
import { toFindings } from "../../services/articles/moderation-classifier.js";
import { uid, runArticleClassifier } from "./shared.js";

const { articles, articleEngagement, articleClaps, articleShares, users } = schema;

export const articleEngagementRoutes = new Hono<AppEnv>();

// POST /:id/view — lightweight view-count beacon (#858). Split out of the
// public slug read so that route can be edge-cached. Fire-and-forget from the
// client on article mount; bumps the denormalised `articles.view_count`.
articleEngagementRoutes.post("/:id/view", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const [art] = await db.select({ id: articles.id, status: articles.status })
    .from(articles).where(eq(articles.id, id)).limit(1);
  if (!art || art.status !== "published") {
    return c.json(error("NOT_FOUND", "Article not found"), 404);
  }
  await db.update(articles)
    .set({ viewCount: sql`${articles.viewCount} + 1` } as any)
    .where(eq(articles.id, id));
  return c.json(success({ recorded: true }), 200);
});

export const ReadProgressSchema = z.object({
  seconds: z.number().min(1).max(600), // beacon every ~30s; cap protects against tampering
  // Engagement source (#1577). `scroll` = visual reading (default), `narrator`
  // = read-aloud listening — both are real "consuming the content" signals and
  // accrue identically; the field is kept for per-source analytics.
  source: z.enum(["scroll", "narrator"]).default("scroll"),
});

articleEngagementRoutes.post("/:id/read-progress", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = ReadProgressSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid payload"), 400);

  const db = getDb();
  const [art] = await db.select({ id: articles.id, status: articles.status })
    .from(articles).where(eq(articles.id, id)).limit(1);
  if (!art || art.status !== "published") {
    return c.json(error("NOT_FOUND", "Article not found"), 404);
  }
  const today = new Date().toISOString().slice(0, 10);
  const seconds = parsed.data.seconds;
  // Verified-account-only payout counting (#1757). Only an authenticated AND
  // email-verified reader's seconds accrue to `read_seconds` (the column the
  // partner pool pays on); unverified-authenticated + anonymous traffic falls
  // to `anonymous_read_seconds`, which is excluded from the pool. This blocks
  // throwaway-signup farming of read-minutes.
  const userId = uid(c);
  let verified = false;
  if (userId) {
    const [u] = await db
      .select({ emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    verified = !!u?.emailVerified;
  }
  await db.insert(articleEngagement).values({
    articleId: id,
    day: today,
    readSeconds: verified ? seconds : 0,
    anonymousReadSeconds: verified ? 0 : seconds,
    uniqueReaders: 0,
  }).onConflictDoUpdate({
    target: [articleEngagement.articleId, articleEngagement.day],
    set: {
      readSeconds: verified
        ? sql`${articleEngagement.readSeconds} + ${seconds}`
        : articleEngagement.readSeconds,
      anonymousReadSeconds: verified
        ? articleEngagement.anonymousReadSeconds
        : sql`${articleEngagement.anonymousReadSeconds} + ${seconds}`,
      updatedAt: new Date(),
    },
  });
  return c.json(success({ counted: verified }), 200);
});

export const ClapSchema = z.object({
  delta: z.number().int().min(1).max(50),
});

articleEngagementRoutes.post("/:id/clap", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required for claps"), 401);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = ClapSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid clap payload"), 400);

  const db = getDb();
  const [art] = await db.select({ status: articles.status })
    .from(articles).where(eq(articles.id, id)).limit(1);
  if (!art || art.status !== "published") {
    return c.json(error("NOT_FOUND", "Article not found"), 404);
  }

  const CLAP_CAP = 50;
  const [existing] = await db.select({ count: articleClaps.count })
    .from(articleClaps)
    .where(and(eq(articleClaps.articleId, id), eq(articleClaps.userId, userId)))
    .limit(1);
  const current = existing?.count ?? 0;
  const newTotal = Math.min(CLAP_CAP, current + parsed.data.delta);
  const actualDelta = newTotal - current;
  if (actualDelta <= 0) {
    return c.json(success({ total: current, addedThisCall: 0 }), 200);
  }

  await db.insert(articleClaps)
    .values({ articleId: id, userId, count: newTotal })
    .onConflictDoUpdate({
      target: [articleClaps.userId, articleClaps.articleId],
      set: { count: newTotal, updatedAt: new Date() },
    });

  const today = new Date().toISOString().slice(0, 10);
  await db.insert(articleEngagement).values({
    articleId: id, day: today, clapCount: actualDelta,
  }).onConflictDoUpdate({
    target: [articleEngagement.articleId, articleEngagement.day],
    set: {
      clapCount: sql`${articleEngagement.clapCount} + ${actualDelta}`,
      updatedAt: new Date(),
    },
  });
  return c.json(success({ total: newTotal, addedThisCall: actualDelta }), 200);
});

export const ShareSchema = z.object({
  channel: z.enum(["twitter", "linkedin", "email", "copy_link", "rss"]),
});

articleEngagementRoutes.post("/:id/share", async (c) => {
  const id = c.req.param("id");
  const userId = uid(c);
  const body = await c.req.json().catch(() => ({}));
  const parsed = ShareSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid share payload"), 400);
  const db = getDb();
  await db.insert(articleShares).values({
    articleId: id,
    userId,
    channel: parsed.data.channel,
    userAgent: c.req.header("user-agent") ?? null,
  });
  const today = new Date().toISOString().slice(0, 10);
  await db.insert(articleEngagement).values({
    articleId: id, day: today, shareCount: 1,
  }).onConflictDoUpdate({
    target: [articleEngagement.articleId, articleEngagement.day],
    set: {
      shareCount: sql`${articleEngagement.shareCount} + 1`,
      updatedAt: new Date(),
    },
  });
  return c.json(success({ recorded: true }), 200);
});

articleEngagementRoutes.get("/:id/engagement", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const id = c.req.param("id");
  const db = getDb();
  const [parent] = await db.select({ userId: articles.userId })
    .from(articles).where(eq(articles.id, id)).limit(1);
  if (!parent) return c.json(error("NOT_FOUND", "Article not found"), 404);
  if (parent.userId !== userId) return c.json(error("FORBIDDEN", "Not your article"), 403);
  const rollups = await db.select().from(articleEngagement)
    .where(eq(articleEngagement.articleId, id))
    .orderBy(desc(articleEngagement.day))
    .limit(60);
  return c.json(success({ rollups }), 200);
});

// ===========================================================================
// #175 — On-demand AI moderation classify. Author-triggered preview or
// publish-time gate. Writes quality_score + moderation_findings on the
// row, flips status / partner_program_eligible per severity.
// ===========================================================================

articleEngagementRoutes.post("/:id/classify", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const id = c.req.param("id");
  const db = getDb();
  const [art] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  if (!art) return c.json(error("NOT_FOUND", "Article not found"), 404);
  if (art.userId !== userId) return c.json(error("FORBIDDEN", "Not your article"), 403);

  try {
    const { result, gate } = await runArticleClassifier(c, art);
    const now = new Date();
    const update: Record<string, unknown> = {
      qualityScore: result.qualityScore,
      qualityRationale: result.qualityRationale,
      qualityCheckedAt: now,
      moderationScore: result.qualityScore,
      moderationFindings: toFindings(result),
      moderationScannedAt: now,
      moderationScannedBy: userId,
      partnerProgramEligible: gate.partnerProgramEligible,
      updatedAt: now,
    };
    if (gate.status) update.status = gate.status;
    const [updated] = await db.update(articles)
      .set(update as any)
      .where(eq(articles.id, id))
      .returning();
    // Moderation gate can flip status → published, adding the article to search.
    bumpSearchVersion();
    return c.json(success({ article: updated, findings: result }), 200);
  } catch (e) {
    // #529: exhausted AI plan → upgrade banner; else specific classifier fault.
    const envelope = buildAIErrorEnvelope(e);
    if (envelope) return c.json(error(envelope.code, envelope.message, envelope.payload), envelope.status);
    return c.json(error("CLASSIFIER_FAILED", e instanceof Error ? e.message : String(e)), 500);
  }
});
