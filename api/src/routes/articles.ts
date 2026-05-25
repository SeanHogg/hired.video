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
import { withCacheHeaders } from "../utils/cache-headers.js";
import { ARTICLE_KINDS } from "../db/schema/articles.js";

const { articles, users, userProfiles, creatorProfiles } = schema;

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
    return c.json(success(items), 200);
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
    return c.json(success(rows.map(toPublicCard)), 200);
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
