/**
 * SuperAdmin article review queue.
 *
 * Mounted at /api/admin/articles. All routes pass `superAdminMiddleware`
 * (block emulation tokens + non-SA callers). Approvals + rejections are
 * audit-logged to admin_audit_log; the moderation scan is the same shared
 * service the creator-side submit path uses.
 *
 * Routes:
 *   GET    /api/admin/articles/queue                   — submitted articles + author + scan summary
 *   POST   /api/admin/articles/scan                    — bulk-scan { ids: string[] }
 *   POST   /api/admin/articles/approve                 — bulk-approve { ids: string[] }
 *   POST   /api/admin/articles/reject                  — bulk-reject { ids: string[], reason: string }
 */
import { Hono } from "hono";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { scanContent } from "../services/moderation/contentScan.js";

const { articles, users, userProfiles, adminAuditLog, feedPosts } = schema;

export const adminArticleRoutes = new Hono<AppEnv>();

adminArticleRoutes.use("*", superAdminMiddleware);

const IdsSchema = z.object({
  ids: z.array(UuidLikeSchema).min(1).max(100),
});

const RejectSchema = IdsSchema.extend({
  reason: z.string().min(1).max(2000),
});

const QueueQuerySchema = z.object({
  status: z.enum(["submitted", "rejected", "published"]).default("submitted"),
  kind: z.enum(["article", "faq", "guide"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ---------------------------------------------------------------------------
// GET /queue — admin queue listing with author chip + cached scan summary
// ---------------------------------------------------------------------------
adminArticleRoutes.get("/queue", async (c) => {
  const parsed = QueueQuerySchema.safeParse({
    status: c.req.query("status"),
    kind: c.req.query("kind"),
    limit: c.req.query("limit"),
  });
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid query"), 400);
  }
  const { status, kind, limit } = parsed.data;

  const db = getDb();
  const rows = await db
    .select({
      article: articles,
      author: { id: users.id, name: users.name, email: users.email },
      authorProfile: { avatarUrl: userProfiles.avatarUrl, customUrlSlug: userProfiles.customUrlSlug },
    })
    .from(articles)
    .innerJoin(users, eq(articles.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(
      eq(articles.status, status),
      kind ? eq(articles.kind, kind) : undefined,
    ))
    .orderBy(desc(articles.submittedForReviewAt))
    .limit(limit);

  return c.json(success(rows.map((r) => ({
    article: r.article,
    author: {
      id: r.author.id,
      name: r.author.name,
      email: r.author.email,
      avatarUrl: r.authorProfile?.avatarUrl ?? null,
      slug: r.authorProfile?.customUrlSlug ?? r.author.id,
    },
  }))), 200);
});

// ---------------------------------------------------------------------------
// POST /scan — bulk-scan (re-run moderation) for the queue rows
// ---------------------------------------------------------------------------
adminArticleRoutes.post("/scan", async (c) => {
  const parsed = IdsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const { ids } = parsed.data;
  const db = getDb();
  const actorId = c.var.user?.sub as string;

  const rows = await db.select().from(articles).where(inArray(articles.id, ids));
  if (rows.length === 0) {
    return c.json(success({ scanned: 0, results: [] as unknown[] }), 200);
  }

  const results: Array<{ id: string; score: number; severity: string; recommendation: string }> = [];
  for (const row of rows) {
    const scan = await scanContent(
      { title: row.title, bodyMd: row.bodyMd, kind: row.kind as any },
      c.var.user,
    );
    await db.update(articles).set({
      moderationScore: scan.score,
      moderationFindings: scan.findings,
      moderationScannedAt: new Date(),
      moderationScannedBy: actorId,
      updatedAt: new Date(),
    } as any).where(eq(articles.id, row.id));
    results.push({
      id: row.id,
      score: scan.score,
      severity: scan.findings.severity,
      recommendation: scan.recommendation,
    });
  }

  await db.insert(adminAuditLog).values({
    actorId,
    action: "articles.bulk_scan",
    targetType: "article",
    targetId: ids.join(","),
    metadata: { count: rows.length, results },
  } as any).catch(() => undefined);

  return c.json(success({ scanned: rows.length, results }), 200);
});

// ---------------------------------------------------------------------------
// POST /approve — bulk-approve (status -> published) + emit feed post
// ---------------------------------------------------------------------------
adminArticleRoutes.post("/approve", async (c) => {
  const parsed = IdsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const { ids } = parsed.data;
  const db = getDb();
  const actorId = c.var.user?.sub as string;

  // Only approve rows currently in submitted state — guards against
  // double-publish if a row was rejected mid-batch.
  const updatedRows = await db.update(articles).set({
    status: "published",
    publishedAt: new Date(),
    approvedBy: actorId,
    approvedAt: new Date(),
    rejectionReason: null,
    rejectedAt: null,
    rejectedBy: null,
    updatedAt: new Date(),
  } as any).where(and(
    inArray(articles.id, ids),
    eq(articles.status, "submitted"),
  )).returning();

  // Emit one feed post per approved article (replaces the old per-article
  // emit that used to live in the creator-side publish route).
  for (const a of updatedRows) {
    const [author] = await db.select({ name: users.name })
      .from(users).where(eq(users.id, a.userId)).limit(1);
    const [profile] = await db.select({ slug: userProfiles.customUrlSlug, avatarUrl: userProfiles.avatarUrl })
      .from(userProfiles).where(eq(userProfiles.userId, a.userId)).limit(1);
    const authorSlug = profile?.slug ?? a.userId;
    await db.insert(feedPosts).values({
      userId: a.userId,
      content: `${kindEmoji(a.kind)} New ${a.kind}: ${a.title}${a.summary ? ` — ${a.summary}` : ""}`,
      linkUrl: `/articles/${authorSlug}/${a.slug}`,
      linkTitle: a.title,
      linkDescription: a.summary ?? null,
      linkImageUrl: a.coverImageUrl ?? null,
      privacy: "Public",
      subjectType: "article",
      subjectId: a.id,
      embedPayload: {
        kind: a.kind,
        title: a.title,
        slug: a.slug,
        summary: a.summary,
        coverImageUrl: a.coverImageUrl,
        readMinutes: a.readMinutes,
        category: a.category,
        tags: a.tags,
        author: { name: author?.name ?? null, slug: authorSlug, avatarUrl: profile?.avatarUrl ?? null },
      },
    } as any).catch(() => undefined);
  }

  await db.insert(adminAuditLog).values({
    actorId,
    action: "articles.bulk_approve",
    targetType: "article",
    targetId: ids.join(","),
    metadata: { count: updatedRows.length, approvedIds: updatedRows.map((r) => r.id) },
  } as any).catch(() => undefined);

  return c.json(success({ approved: updatedRows.length, ids: updatedRows.map((r) => r.id) }), 200);
});

// ---------------------------------------------------------------------------
// POST /reject — bulk-reject with reason
// ---------------------------------------------------------------------------
adminArticleRoutes.post("/reject", async (c) => {
  const parsed = RejectSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const { ids, reason } = parsed.data;
  const db = getDb();
  const actorId = c.var.user?.sub as string;

  const updatedRows = await db.update(articles).set({
    status: "rejected",
    rejectedBy: actorId,
    rejectedAt: new Date(),
    rejectionReason: reason,
    updatedAt: new Date(),
  } as any).where(and(
    inArray(articles.id, ids),
    eq(articles.status, "submitted"),
  )).returning();

  await db.insert(adminAuditLog).values({
    actorId,
    action: "articles.bulk_reject",
    targetType: "article",
    targetId: ids.join(","),
    metadata: { count: updatedRows.length, reason, rejectedIds: updatedRows.map((r) => r.id) },
  } as any).catch(() => undefined);

  return c.json(success({ rejected: updatedRows.length, ids: updatedRows.map((r) => r.id) }), 200);
});

function kindEmoji(kind: string): string {
  if (kind === "faq") return "❓";
  if (kind === "guide") return "📘";
  return "📝";
}
