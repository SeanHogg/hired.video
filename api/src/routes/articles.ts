/**
 * Articles — creator-authored long-form content (#196). Storage backs three
 * kinds: article / faq / guide. SA review is required before anything goes
 * public; submit-for-review runs the moderation scan inline.
 *
 * Routes:
 *   POST   /api/articles                       — create draft
 *   GET    /api/articles/me                    — list my articles (any status)
 *   GET    /api/articles/:id                   — get my article (owner-only)
 *   PATCH  /api/articles/:id                   — update my article (draft / rejected only)
 *   POST   /api/articles/:id/submit-for-review — submit; runs scan; status=submitted
 *   POST   /api/articles/:id/withdraw          — pull from review; status=draft
 *   POST   /api/articles/:id/unpublish         — back to draft
 *   DELETE /api/articles/:id                   — hard delete by owner
 *
 *   GET    /api/articles/public                — list published (paginated)
 *   GET    /api/articles/public/by-user/:uid   — published-by-user
 *   GET    /api/articles/public/:userId/:slug  — public read-by-slug
 *
 * Engagement tracking + Partner Program payouts remain deferred (#171–#175).
 */
import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { filterVisibleCreators, isCreatorVisible } from "../services/creators/visibility.js";
import { scanContent } from "../services/moderation/contentScan.js";
import { slugify } from "../../../shared/slugify.js";
import { ARTICLE_LIST_FIELDS, parseFields, projectRows } from "../../../shared/projection.js";
import { withCacheHeaders } from "../utils/cache-headers.js";
import { ARTICLE_KINDS } from "../db/schema/articles.js";

const {
  articles,
  articleVersions,
  articleEngagement,
  articleClaps,
  articleShares,
  partnerProgramOptIns,
  partnerProgramBalances,
  legalDocumentAcceptances,
  users,
  userProfiles,
  creatorProfiles,
} = schema;
import { createLLMClient } from "../services/adapters/llm-client.js";
import {
  classifyArticle,
  gateForSeverity,
  toFindings,
} from "../services/articles/moderation-classifier.js";

export const articleRoutes = new Hono<AppEnv>();

async function getArticlesEnrollment(db: ReturnType<typeof getDb>, userId: string) {
  const [row] = await db.select()
    .from(creatorProfiles)
    .where(and(
      eq(creatorProfiles.userId, userId),
      sql`${creatorProfiles.endedAt} IS NULL`,
      eq(creatorProfiles.articlesActive, true),
    ))
    .limit(1);
  return row ?? null;
}

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

function readMinutes(bodyMd: string): number {
  const words = bodyMd.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 225));
}

const KindSchema = z.enum(ARTICLE_KINDS);

const CreateArticleSchema = z.object({
  title: z.string().min(1).max(255),
  bodyMd: z.string().default(""),
  summary: z.string().max(1000).optional(),
  coverImageUrl: z.string().url().optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  kind: KindSchema.default("article").optional(),
  sector: z.string().max(64).optional(),
  audience: z.string().max(32).optional(),
});

const UpdateArticleSchema = CreateArticleSchema.partial().extend({
  slug: z.string().regex(/^[a-z0-9-]+$/).max(80).optional(),
});

// ---------------------------------------------------------------------------
// Public endpoints — registered before /:id so literal `/public` paths don't
// match the param route.
// ---------------------------------------------------------------------------

articleRoutes.get("/public", async (c) => {
  const db = getDb();
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10) || 20, 100);
  const kindFilter = c.req.query("kind");
  // Sector + audience filters from #1165. Both optional; legacy queries
  // without these params behave identically to before.
  const sectorFilter = c.req.query("sector");
  const audienceFilter = c.req.query("audience");
  try {
    const where = and(
      eq(articles.status, "published"),
      eq(users.emailVerified, true),
      kindFilter ? eq(articles.kind, kindFilter) : undefined,
      sectorFilter ? eq(articles.sector, sectorFilter) : undefined,
      audienceFilter ? eq(articles.audience, audienceFilter) : undefined,
    );
    const rows = await db
      .select({
        article: articles,
        author: { id: users.id, name: users.name },
        authorProfile: { avatarUrl: userProfiles.avatarUrl, customUrlSlug: userProfiles.customUrlSlug },
      })
      .from(articles)
      .innerJoin(users, eq(articles.userId, users.id))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(where)
      .orderBy(desc(articles.publishedAt))
      .limit(limit);

    const visible = await filterVisibleCreators(rows.map((r) => r.author.id));
    const items = rows.filter((r) => visible.has(r.author.id)).map(toPublicCard);
    withCacheHeaders(c, { scope: "public", maxAge: 60, sMaxAge: 300, swr: 600 });
    // `?fields=` projection (gap #1370 / #1446) — list view rarely needs
    // the full article body or tags blob; trimming here saves the heavy
    // markdown payload on every grid render.
    const fields = parseFields(c.req.query("fields"), ARTICLE_LIST_FIELDS);
    return c.json(success(projectRows(items as Array<Record<string, unknown>>, fields)), 200);
  } catch {
    return c.json(success([] as unknown[]), 200);
  }
});

articleRoutes.get("/public/by-user/:userId", async (c) => {
  const db = getDb();
  const userId = c.req.param("userId");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 100);
  if (!(await isCreatorVisible(userId))) {
    return c.json(success([] as unknown[]), 200);
  }
  try {
    const rows = await db
      .select({
        article: articles,
        author: { id: users.id, name: users.name },
        authorProfile: { avatarUrl: userProfiles.avatarUrl, customUrlSlug: userProfiles.customUrlSlug },
      })
      .from(articles)
      .innerJoin(users, eq(articles.userId, users.id))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(
        eq(articles.userId, userId),
        eq(articles.status, "published"),
        eq(users.emailVerified, true),
      ))
      .orderBy(desc(articles.publishedAt))
      .limit(limit);
    const fields = parseFields(c.req.query("fields"), ARTICLE_LIST_FIELDS);
    return c.json(success(projectRows(rows.map(toPublicCard) as Array<Record<string, unknown>>, fields)), 200);
  } catch {
    return c.json(success([] as unknown[]), 200);
  }
});

articleRoutes.get("/public/:userId/:slug", async (c) => {
  const db = getDb();
  const [row] = await db
    .select({
      article: articles,
      author: { id: users.id, name: users.name },
      authorProfile: { avatarUrl: userProfiles.avatarUrl, customUrlSlug: userProfiles.customUrlSlug },
    })
    .from(articles)
    .innerJoin(users, eq(articles.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(
      eq(articles.userId, c.req.param("userId")),
      eq(articles.slug, c.req.param("slug")),
      eq(articles.status, "published"),
      eq(users.emailVerified, true),
    ))
    .limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Article not found"), 404);
  if (!(await isCreatorVisible(row.author.id))) {
    return c.json(error("NOT_FOUND", "Article not found"), 404);
  }

  db.update(articles)
    .set({ viewCount: sql`${articles.viewCount} + 1` } as any)
    .where(eq(articles.id, row.article.id))
    .catch(() => undefined);

  return c.json(success({
    id: row.article.id,
    kind: row.article.kind,
    title: row.article.title,
    slug: row.article.slug,
    bodyMd: row.article.bodyMd,
    summary: row.article.summary,
    coverImageUrl: row.article.coverImageUrl,
    category: row.article.category,
    tags: row.article.tags,
    sector: row.article.sector,
    audience: row.article.audience,
    readMinutes: row.article.readMinutes,
    viewCount: row.article.viewCount + 1,
    publishedAt: row.article.publishedAt,
    author: {
      id: row.author.id,
      name: row.author.name,
      avatarUrl: row.authorProfile?.avatarUrl ?? null,
      slug: row.authorProfile?.customUrlSlug ?? row.author.id,
    },
  }), 200);
});

// ---------------------------------------------------------------------------
// Owner endpoints
// ---------------------------------------------------------------------------

articleRoutes.post("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = CreateArticleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  const enrollment = await getArticlesEnrollment(db, userId);
  if (!enrollment) {
    return c.json(
      error(
        "PROGRAM_NOT_ENROLLED",
        "Articles publishing requires enrollment in the Articles Creator Program. Visit /services to enroll.",
      ),
      403,
    );
  }

  let baseSlug = slugify(parsed.data.title, { fallback: () => `article-${Date.now()}` });
  let slug = baseSlug;
  let n = 1;
  while (true) {
    const [exists] = await db.select({ id: articles.id })
      .from(articles)
      .where(and(eq(articles.userId, userId), eq(articles.slug, slug)))
      .limit(1);
    if (!exists) break;
    n += 1;
    slug = `${baseSlug}-${n}`;
    if (n > 50) { slug = `${baseSlug}-${Date.now()}`; break; }
  }

  const [created] = await db.insert(articles).values({
    userId,
    slug,
    title: parsed.data.title,
    bodyMd: parsed.data.bodyMd ?? "",
    summary: parsed.data.summary ?? null,
    coverImageUrl: parsed.data.coverImageUrl ?? null,
    category: parsed.data.category ?? null,
    tags: parsed.data.tags ?? [],
    sector: parsed.data.sector ?? null,
    audience: parsed.data.audience ?? null,
    kind: parsed.data.kind ?? "article",
    status: "draft",
    readMinutes: readMinutes(parsed.data.bodyMd ?? ""),
  }).returning();
  return c.json(success(created), 201);
});

articleRoutes.get("/me", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db.select().from(articles)
    .where(eq(articles.userId, userId))
    .orderBy(desc(articles.updatedAt));
  return c.json(success(rows), 200);
});

articleRoutes.get("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [row] = await db.select().from(articles)
    .where(and(eq(articles.id, c.req.param("id")), eq(articles.userId, userId)))
    .limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Article not found"), 404);
  return c.json(success(row), 200);
});

articleRoutes.patch("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = UpdateArticleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  const [existing] = await db.select().from(articles)
    .where(and(eq(articles.id, c.req.param("id")), eq(articles.userId, userId)))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Article not found"), 404);
  // Editing is blocked while a submission is in the SA queue — creator must
  // withdraw first. Published articles can still be edited (changes don't go
  // live until a new submit-for-review + SA approval cycle).
  if (existing.status === "submitted") {
    return c.json(
      error("LOCKED_FOR_REVIEW", "Withdraw from review before editing."),
      409,
    );
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.bodyMd !== undefined) {
    patch.bodyMd = parsed.data.bodyMd;
    patch.readMinutes = readMinutes(parsed.data.bodyMd);
  }
  if (parsed.data.summary !== undefined) patch.summary = parsed.data.summary;
  if (parsed.data.coverImageUrl !== undefined) patch.coverImageUrl = parsed.data.coverImageUrl;
  if (parsed.data.category !== undefined) patch.category = parsed.data.category;
  if (parsed.data.tags !== undefined) patch.tags = parsed.data.tags;
  if (parsed.data.slug !== undefined) patch.slug = parsed.data.slug;
  if (parsed.data.kind !== undefined) patch.kind = parsed.data.kind;
  if (parsed.data.sector !== undefined) patch.sector = parsed.data.sector || null;
  if (parsed.data.audience !== undefined) patch.audience = parsed.data.audience || null;

  // A rejected article being edited bumps back to draft so the creator
  // re-submits cleanly. Published edits leave status alone (they're a fresh
  // revision of an already-live article until the next submit cycle).
  if (existing.status === "rejected") {
    patch.status = "draft";
    patch.rejectionReason = null;
    patch.rejectedAt = null;
    patch.rejectedBy = null;
  }

  const [updated] = await db.update(articles).set(patch as any)
    .where(eq(articles.id, existing.id)).returning();
  return c.json(success(updated), 200);
});

articleRoutes.post("/:id/submit-for-review", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const enrollment = await getArticlesEnrollment(db, userId);
  if (!enrollment) {
    return c.json(
      error(
        "PROGRAM_NOT_ENROLLED",
        "Re-enable the Articles Creator Program at /services to submit.",
      ),
      403,
    );
  }

  const [existing] = await db.select().from(articles)
    .where(and(eq(articles.id, c.req.param("id")), eq(articles.userId, userId)))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Article not found"), 404);
  if (!existing.title.trim() || !existing.bodyMd.trim()) {
    return c.json(error("VALIDATION_ERROR", "Title and body are required to submit"), 400);
  }
  if (existing.status === "submitted") {
    return c.json(error("ALREADY_SUBMITTED", "Already in the review queue."), 409);
  }

  // Inline scan — gives the creator immediate signal on hard-block content
  // before it ever enters the SA queue. The same scan output is shown to the
  // SA so they don't burn an LLM call on already-scanned rows.
  const scan = await scanContent(
    { title: existing.title, bodyMd: existing.bodyMd, kind: existing.kind as any },
    c.var.user,
  );

  // Hard-block path: severity === 'block' (racial slurs detected by either
  // floor or LLM) rejects automatically. Creator can edit and re-submit.
  if (scan.findings.severity === "block") {
    const [rejected] = await db.update(articles).set({
      status: "rejected",
      rejectionReason:
        "Automatic rejection: prohibited content detected. " +
        (scan.findings.rationale ?? "Please revise and re-submit."),
      rejectedAt: new Date(),
      moderationScore: scan.score,
      moderationFindings: scan.findings,
      moderationScannedAt: new Date(),
      updatedAt: new Date(),
    } as any).where(eq(articles.id, existing.id)).returning();
    return c.json(success(rejected), 200);
  }

  const [updated] = await db.update(articles).set({
    status: "submitted",
    submittedForReviewAt: new Date(),
    moderationScore: scan.score,
    moderationFindings: scan.findings,
    moderationScannedAt: new Date(),
    updatedAt: new Date(),
  } as any).where(eq(articles.id, existing.id)).returning();

  return c.json(success(updated), 200);
});

articleRoutes.post("/:id/withdraw", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [updated] = await db.update(articles)
    .set({
      status: "draft",
      submittedForReviewAt: null,
      updatedAt: new Date(),
    } as any)
    .where(and(
      eq(articles.id, c.req.param("id")),
      eq(articles.userId, userId),
      eq(articles.status, "submitted"),
    ))
    .returning();
  if (!updated) return c.json(error("NOT_FOUND", "Article not found or not in review"), 404);
  return c.json(success(updated), 200);
});

articleRoutes.post("/:id/unpublish", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [updated] = await db.update(articles)
    .set({ status: "draft", publishedAt: null, updatedAt: new Date() } as any)
    .where(and(eq(articles.id, c.req.param("id")), eq(articles.userId, userId)))
    .returning();
  if (!updated) return c.json(error("NOT_FOUND", "Article not found"), 404);
  return c.json(success(updated), 200);
});

articleRoutes.delete("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [deleted] = await db.delete(articles)
    .where(and(eq(articles.id, c.req.param("id")), eq(articles.userId, userId)))
    .returning({ id: articles.id });
  if (!deleted) return c.json(error("NOT_FOUND", "Article not found"), 404);
  return c.json(success({ deleted: deleted.id }), 200);
});

// ===========================================================================
// #170 / #155 — Article version history. Mirrors resumes + studio.
// ===========================================================================

const ARTICLE_AUTOSAVE_CAP = 50;
const ARTICLE_AUTOSAVE_RETENTION_DAYS = 30;

articleRoutes.get("/:id/versions", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [parent] = await db.select({ userId: articles.userId })
    .from(articles).where(eq(articles.id, c.req.param("id"))).limit(1);
  if (!parent) return c.json(error("NOT_FOUND", "Article not found"), 404);
  if (parent.userId !== userId) return c.json(error("FORBIDDEN", "Not your article"), 403);
  const versions = await db.select({
    id: articleVersions.id,
    versionNumber: articleVersions.versionNumber,
    label: articleVersions.label,
    isAutosave: articleVersions.isAutosave,
    createdAt: articleVersions.createdAt,
  }).from(articleVersions)
    .where(eq(articleVersions.articleId, c.req.param("id")))
    .orderBy(desc(articleVersions.versionNumber))
    .limit(200);
  return c.json(success({ versions }), 200);
});

const CreateArticleVersionSchema = z.object({
  label: z.string().trim().max(120).optional(),
  isAutosave: z.boolean().optional(),
});

articleRoutes.post("/:id/versions", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateArticleVersionSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid version payload"), 400);
  const db = getDb();
  const [parent] = await db.select({
    userId: articles.userId,
    title: articles.title,
    bodyMd: articles.bodyMd,
    bodyJson: articles.bodyJson,
  }).from(articles).where(eq(articles.id, id)).limit(1);
  if (!parent) return c.json(error("NOT_FOUND", "Article not found"), 404);
  if (parent.userId !== userId) return c.json(error("FORBIDDEN", "Not your article"), 403);

  const [{ maxVersion }] = await db.select({
    maxVersion: sql<number>`COALESCE(MAX(${articleVersions.versionNumber}), 0)`,
  }).from(articleVersions).where(eq(articleVersions.articleId, id));

  const [created] = await db.insert(articleVersions).values({
    articleId: id,
    userId,
    versionNumber: (maxVersion ?? 0) + 1,
    label: parsed.data.label,
    title: parent.title,
    bodyMd: parent.bodyMd,
    bodyJson: parent.bodyJson as any,
    isAutosave: parsed.data.isAutosave ?? false,
  }).returning();

  if (created.isAutosave) {
    const cutoff = new Date(Date.now() - ARTICLE_AUTOSAVE_RETENTION_DAYS * 86_400_000);
    await db.delete(articleVersions).where(and(
      eq(articleVersions.articleId, id),
      eq(articleVersions.isAutosave, true),
      sql`${articleVersions.createdAt} < ${cutoff}`,
    ));
    const autosaves = await db.select({ id: articleVersions.id })
      .from(articleVersions)
      .where(and(
        eq(articleVersions.articleId, id),
        eq(articleVersions.isAutosave, true),
      ))
      .orderBy(desc(articleVersions.createdAt));
    if (autosaves.length > ARTICLE_AUTOSAVE_CAP) {
      const toDrop = autosaves.slice(ARTICLE_AUTOSAVE_CAP).map((r) => r.id);
      for (const dropId of toDrop) {
        await db.delete(articleVersions).where(eq(articleVersions.id, dropId));
      }
    }
  }
  return c.json(success({ version: created }), 201);
});

articleRoutes.post("/:id/versions/:vid/restore", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const id = c.req.param("id");
  const vid = c.req.param("vid");
  const db = getDb();
  const [parent] = await db.select({ userId: articles.userId })
    .from(articles).where(eq(articles.id, id)).limit(1);
  if (!parent) return c.json(error("NOT_FOUND", "Article not found"), 404);
  if (parent.userId !== userId) return c.json(error("FORBIDDEN", "Not your article"), 403);
  const [version] = await db.select().from(articleVersions)
    .where(and(eq(articleVersions.id, vid), eq(articleVersions.articleId, id)))
    .limit(1);
  if (!version) return c.json(error("NOT_FOUND", "Version not found"), 404);
  const [updated] = await db.update(articles)
    .set({
      title: version.title,
      bodyMd: version.bodyMd ?? "",
      bodyJson: version.bodyJson as any,
      updatedAt: new Date(),
    } as any)
    .where(eq(articles.id, id))
    .returning();
  return c.json(success({ restoredVersion: version, article: updated }), 200);
});

// ===========================================================================
// #171 — Engagement tracking. Three event paths upsert into
// article_engagement (per-day rollup). Only authenticated reads count
// toward the partner pool; the anonymous_read_seconds counter holds
// unauthenticated traffic for analytics.
// ===========================================================================

const ReadProgressSchema = z.object({
  seconds: z.number().min(1).max(600), // beacon every ~30s; cap protects against tampering
});

articleRoutes.post("/:id/read-progress", async (c) => {
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
  const userId = uid(c);
  const colToBump = userId ? articleEngagement.readSeconds : articleEngagement.anonymousReadSeconds;
  await db.insert(articleEngagement).values({
    articleId: id,
    day: today,
    readSeconds: userId ? seconds : 0,
    anonymousReadSeconds: userId ? 0 : seconds,
    uniqueReaders: 0,
  }).onConflictDoUpdate({
    target: [articleEngagement.articleId, articleEngagement.day],
    set: {
      readSeconds: userId
        ? sql`${articleEngagement.readSeconds} + ${seconds}`
        : articleEngagement.readSeconds,
      anonymousReadSeconds: userId
        ? articleEngagement.anonymousReadSeconds
        : sql`${articleEngagement.anonymousReadSeconds} + ${seconds}`,
      updatedAt: new Date(),
    },
  });
  return c.json(success({ counted: !!userId }), 200);
});

const ClapSchema = z.object({
  delta: z.number().int().min(1).max(50),
});

articleRoutes.post("/:id/clap", async (c) => {
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

const ShareSchema = z.object({
  channel: z.enum(["twitter", "linkedin", "email", "copy_link", "rss"]),
});

articleRoutes.post("/:id/share", async (c) => {
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

articleRoutes.get("/:id/engagement", async (c) => {
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

articleRoutes.post("/:id/classify", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const id = c.req.param("id");
  const db = getDb();
  const [art] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  if (!art) return c.json(error("NOT_FOUND", "Article not found"), 404);
  if (art.userId !== userId) return c.json(error("FORBIDDEN", "Not your article"), 403);

  const env = (c.env as any) ?? {};
  const llm = createLLMClient(env, c.var.user ?? null);
  try {
    const result = await classifyArticle({
      llm,
      title: art.title,
      body: (art.bodyMd ?? "") || JSON.stringify(art.bodyJson ?? {}),
    });
    const gate = gateForSeverity(result.findings.severity);
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
    return c.json(success({ article: updated, findings: result }), 200);
  } catch (e) {
    return c.json(error("CLASSIFIER_FAILED", e instanceof Error ? e.message : String(e)), 500);
  }
});

// ===========================================================================
// #173 — Writer Partner Program opt-in. Mirrors voice-clone consent.
// ===========================================================================

const OptInSchema = z.object({
  legalDocsAccepted: z.array(z.string().uuid()).default([]),
  /** Optional explicit Pro subscription id; default behaviour pulls it
   *  from the user's active sub at opt-in time. */
  proSubscriptionId: z.string().uuid().optional(),
});

articleRoutes.post("/partner-program/opt-in", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const parsed = OptInSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid opt-in payload"), 400);
  const db = getDb();

  // Deactivate any existing active row before inserting the new one
  // (unique partial index guards a second active row at the DB level).
  await db.update(partnerProgramOptIns)
    .set({ isActive: false, deactivatedAt: new Date(), deactivatedReason: "superseded" })
    .where(and(
      eq(partnerProgramOptIns.userId, userId),
      eq(partnerProgramOptIns.isActive, true),
    ));

  const [inserted] = await db.insert(partnerProgramOptIns).values({
    userId,
    legalDocsAccepted: parsed.data.legalDocsAccepted as any,
    consentIp: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null,
    consentUa: c.req.header("user-agent") ?? null,
    proSubscriptionId: parsed.data.proSubscriptionId,
    isActive: true,
  } as any).returning();

  // Write a legal_document_acceptances row for every doc id in the
  // payload so the audit trail mirrors the gift-card / voice-clone
  // consent flow. Soft-fails on a missing doc — the opt-in row is the
  // primary record.
  for (const docId of parsed.data.legalDocsAccepted) {
    try {
      await db.insert(legalDocumentAcceptances).values({
        userId,
        documentId: docId,
        kind: "partner_program_terms",
        version: "snapshot",
        ip: c.req.header("cf-connecting-ip") ?? null,
        userAgent: c.req.header("user-agent") ?? null,
        context: "partner_program_opt_in",
      } as any);
    } catch (e) {
      console.warn("[articles] partner-program opt-in legal-doc acceptance failed:", e);
    }
  }

  return c.json(success({ optIn: inserted }), 201);
});

articleRoutes.post("/partner-program/opt-out", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  await db.update(partnerProgramOptIns)
    .set({ isActive: false, deactivatedAt: new Date(), deactivatedReason: "user_opted_out" })
    .where(and(
      eq(partnerProgramOptIns.userId, userId),
      eq(partnerProgramOptIns.isActive, true),
    ));
  return c.json(success({ deactivated: true }), 200);
});

articleRoutes.get("/partner-program/status", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [optIn] = await db.select().from(partnerProgramOptIns)
    .where(and(
      eq(partnerProgramOptIns.userId, userId),
      eq(partnerProgramOptIns.isActive, true),
    ))
    .limit(1);
  const [balance] = await db.select().from(partnerProgramBalances)
    .where(eq(partnerProgramBalances.userId, userId))
    .limit(1);
  return c.json(success({ optIn: optIn ?? null, balance: balance ?? null }), 200);
});

// ---------------------------------------------------------------------------
// Shared row → public card mapper (used by /public + /public/by-user).
// ---------------------------------------------------------------------------
function toPublicCard(r: {
  article: typeof articles.$inferSelect;
  author: { id: string; name: string | null };
  authorProfile: { avatarUrl: string | null; customUrlSlug: string | null } | null;
}) {
  return {
    id: r.article.id,
    type: "article" as const,
    kind: r.article.kind,
    title: r.article.title,
    slug: r.article.slug,
    summary: r.article.summary,
    coverImageUrl: r.article.coverImageUrl,
    category: r.article.category,
    tags: r.article.tags,
    sector: r.article.sector,
    audience: r.article.audience,
    readMinutes: r.article.readMinutes,
    viewCount: r.article.viewCount,
    publishedAt: r.article.publishedAt,
    author: {
      id: r.author.id,
      name: r.author.name,
      avatarUrl: r.authorProfile?.avatarUrl ?? null,
      slug: r.authorProfile?.customUrlSlug ?? r.author.id,
    },
  };
}
