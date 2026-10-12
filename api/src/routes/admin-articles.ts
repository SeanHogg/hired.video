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
import { publicArticlePath } from "../../../shared/public-paths.js";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import { AdminArticlesRepository, type ArticleModerationUpdate } from "../repositories/adminArticlesRepository.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { scanContent } from "../services/moderation/contentScan.js";
import { bumpSearchVersion } from "../utils/search-cache.js";
import { NotificationService } from "../services/notifications/notificationService.js";

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

  const rows = await new AdminArticlesRepository(getDb()).listQueue(status, kind, limit);

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
  const repo = new AdminArticlesRepository(getDb());
  const actorId = c.var.user?.sub as string;

  const rows = await repo.findByIds(ids);
  if (rows.length === 0) {
    return c.json(success({ scanned: 0, results: [] as unknown[] }), 200);
  }

  // Scans stay per article (moderation service call); the persisted
  // results land in ONE batched UPDATE instead of one per article.
  const results: Array<{ id: string; score: number; severity: string; recommendation: string }> = [];
  const updates: ArticleModerationUpdate[] = [];
  for (const row of rows) {
    const scan = await scanContent(
      { title: row.title, bodyMd: row.bodyMd, kind: row.kind as any },
      c.var.user,
    );
    updates.push({ id: row.id, score: scan.score, findings: scan.findings });
    results.push({
      id: row.id,
      score: scan.score,
      severity: scan.findings.severity,
      recommendation: scan.recommendation,
    });
  }
  await repo.bulkSetModeration(updates, actorId, new Date());

  await repo.insertAudit({
    actorId,
    action: "articles.bulk_scan",
    targetType: "article",
    targetId: ids.join(","),
    metadata: { count: rows.length, results },
  });

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
  const repo = new AdminArticlesRepository(db);
  const actorId = c.var.user?.sub as string;

  // Only approve rows currently in submitted state — guards against
  // double-publish if a row was rejected mid-batch.
  const updatedRows = await repo.publishSubmitted(ids, actorId, new Date());
  if (updatedRows.length > 0) bumpSearchVersion();

  // Award the article AUTHOR (not the approving admin) publish points.
  // Role is resolved from the DB since the earner isn't the JWT actor.
  // Built once; fire-and-forget so an award glitch can't fail the approve.
  let game: import("../domains/gamification/index.js").GamificationService | null = null;
  let ACTIONS: typeof import("../domains/gamification/index.js").ACTIONS | null = null;
  if (updatedRows.length > 0) {
    try {
      const mod = await import("../domains/gamification/index.js");
      const { buildRepos } = await import("../repositories/index.js");
      game = new mod.GamificationService(buildRepos(db));
      ACTIONS = mod.ACTIONS;
    } catch {
      game = null;
    }
  }

  // Author name/slug/avatar for every approved article in ONE query
  // (was 2 selects per article).
  const authors = await repo.findAuthorCards(updatedRows.map((a) => a.userId));
  const authorSlugOf = (userId: string) => authors.get(userId)?.slug ?? userId;

  for (const a of updatedRows) {
    if (game && ACTIONS) {
      await game
        .awardWithRoleLookup(ACTIONS.ARTICLE_PUBLISHED, {
          userId: a.userId,
          refId: a.id,
          refType: "article",
        })
        .catch(() => undefined);
    }
  }

  // Emit one feed post per approved article (replaces the old per-article
  // emit that used to live in the creator-side publish route) — ONE
  // multi-row insert.
  await repo.insertFeedPosts(updatedRows.map((a) => {
    const author = authors.get(a.userId);
    const authorSlug = authorSlugOf(a.userId);
    return {
      userId: a.userId,
      content: `${kindEmoji(a.kind)} New ${a.kind}: ${a.title}${a.summary ? ` — ${a.summary}` : ""}`,
      linkUrl: publicArticlePath(authorSlug, a.slug),
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
        author: { name: author?.name ?? null, slug: authorSlug, avatarUrl: author?.avatarUrl ?? null },
      },
    };
  }));

  // Notify each author their submission was approved + published (#898).
  for (const a of updatedRows) {
    await NotificationService.notify({
      userId: a.userId,
      type: "review",
      title: `Your ${a.kind} was approved`,
      message: a.title,
      url: publicArticlePath(authorSlugOf(a.userId), a.slug),
      refType: "article",
      refId: a.id,
    });
  }

  await repo.insertAudit({
    actorId,
    action: "articles.bulk_approve",
    targetType: "article",
    targetId: ids.join(","),
    metadata: { count: updatedRows.length, approvedIds: updatedRows.map((r) => r.id) },
  });

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
  const repo = new AdminArticlesRepository(getDb());
  const actorId = c.var.user?.sub as string;

  const updatedRows = await repo.rejectSubmitted(ids, actorId, reason, new Date());

  // Notify each author their submission was not approved, with the reason (#898).
  for (const a of updatedRows) {
    await NotificationService.notify({
      userId: a.userId,
      type: "review",
      title: `Your ${a.kind} was not approved`,
      message: reason,
      url: `/services/creator/articles`,
      refType: "article",
      refId: a.id,
    });
  }

  await repo.insertAudit({
    actorId,
    action: "articles.bulk_reject",
    targetType: "article",
    targetId: ids.join(","),
    metadata: { count: updatedRows.length, reason, rejectedIds: updatedRows.map((r) => r.id) },
  });

  return c.json(success({ rejected: updatedRows.length, ids: updatedRows.map((r) => r.id) }), 200);
});

function kindEmoji(kind: string): string {
  if (kind === "faq") return "❓";
  if (kind === "guide") return "📘";
  return "📝";
}
