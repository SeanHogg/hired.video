/**
 * Articles — creator-authored long-form content (#170 foundation).
 *
 * Routes:
 *   POST   /api/articles                       — create draft
 *   GET    /api/articles/me                    — list my articles (any status)
 *   GET    /api/articles/:id                   — get my article (any status, owner-only)
 *   PATCH  /api/articles/:id                   — update my article fields
 *   POST   /api/articles/:id/publish           — publish (runs AI quality classifier)
 *   POST   /api/articles/:id/unpublish         — back to draft / unlisted
 *   DELETE /api/articles/:id                   — soft-removal (status='flagged' until #152 admin triage)
 *
 *   GET    /api/articles/public                — list published articles (paginated)
 *   GET    /api/articles/public/:userId/:slug  — public read-by-slug; bumps view_count
 *
 * Engagement tracking (#171), claps, Partner Program payouts (#172–#175) are
 * NOT in scope here. The static editorial blog at frontend/data/blog-posts.ts
 * is unaffected — this is a separate user-authored surface.
 */
import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";

const { articles, users, userProfiles, creatorProfiles, feedPosts } = schema;

export const articleRoutes = new Hono<{ Variables: Variables }>();

// Articles publishing is gated on enrollment in the Articles sub-program of
// the Creator Program (#190). Returns the active enrollment row if the user
// is enrolled in articles, null otherwise.
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

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `article-${Date.now()}`;
}

function readMinutes(bodyMd: string): number {
  // ~225 words/min average reader. Round up.
  const words = bodyMd.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 225));
}

const CreateArticleSchema = z.object({
  title: z.string().min(1).max(255),
  bodyMd: z.string().default(""),
  summary: z.string().max(1000).optional(),
  coverImageUrl: z.string().url().optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
});

const UpdateArticleSchema = CreateArticleSchema.partial().extend({
  slug: z.string().regex(/^[a-z0-9-]+$/).max(80).optional(),
});

const QualityResponseSchema = z.object({
  score: z.number().min(0).max(1),
  rationale: z.string().max(600),
  isAcceptable: z.boolean(),
});

// ---------------------------------------------------------------------------
// Public endpoints — MUST be registered before /:id so the literal `/public`
// path doesn't get captured by the param route. Hono's router otherwise
// matches `/api/articles/public` against `/:id` (id="public") and routes it
// to the auth-required handler, which returns 401 ("Authentication required")
// to anonymous callers and breaks /search rendering.
// ---------------------------------------------------------------------------

articleRoutes.get("/public", async (c) => {
  const db = getDb();
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10) || 20, 100);
  // Defensive: degrades to empty if migration 0038 isn't applied yet.
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
      .where(and(eq(articles.status, "published"), eq(users.emailVerified, true)))
      .orderBy(desc(articles.publishedAt))
      .limit(limit);

    const items = rows.map((r) => ({
      id: r.article.id,
      type: "article" as const,
      title: r.article.title,
      slug: r.article.slug,
      summary: r.article.summary,
      coverImageUrl: r.article.coverImageUrl,
      category: r.article.category,
      tags: r.article.tags,
      readMinutes: r.article.readMinutes,
      viewCount: r.article.viewCount,
      publishedAt: r.article.publishedAt,
      author: {
        id: r.author.id,
        name: r.author.name,
        avatarUrl: r.authorProfile?.avatarUrl ?? null,
        slug: r.authorProfile?.customUrlSlug ?? r.author.id,
      },
    }));
    return c.json(success(items), 200);
  } catch (e) {
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

  // Best-effort view count bump — fire-and-forget.
  db.update(articles)
    .set({ viewCount: sql`${articles.viewCount} + 1` } as any)
    .where(eq(articles.id, row.article.id))
    .catch(() => undefined);

  return c.json(success({
    id: row.article.id,
    title: row.article.title,
    slug: row.article.slug,
    bodyMd: row.article.bodyMd,
    summary: row.article.summary,
    coverImageUrl: row.article.coverImageUrl,
    category: row.article.category,
    tags: row.article.tags,
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

  // Gate: must be enrolled in the Articles sub-program of the Creator Program.
  // Frontend should send the user through the enrollment wizard at /services
  // before letting them hit this endpoint.
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

  // Ensure unique slug per author by appending a counter on collision.
  let baseSlug = slugify(parsed.data.title);
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
    status: "draft",
    readMinutes: readMinutes(parsed.data.bodyMd ?? ""),
  } as any).returning();
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

  const [updated] = await db.update(articles).set(patch as any)
    .where(eq(articles.id, existing.id)).returning();
  return c.json(success(updated), 200);
});

articleRoutes.post("/:id/publish", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  // Gate: enrolment must still be active at publish time. Existing drafts
  // remain editable when a user disables the program, but they can't push
  // anything new out to the feed until they re-enable.
  const enrollment = await getArticlesEnrollment(db, userId);
  if (!enrollment) {
    return c.json(
      error(
        "PROGRAM_NOT_ENROLLED",
        "Re-enable the Articles Creator Program at /services to publish.",
      ),
      403,
    );
  }

  const [existing] = await db.select().from(articles)
    .where(and(eq(articles.id, c.req.param("id")), eq(articles.userId, userId)))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Article not found"), 404);
  if (!existing.title.trim() || !existing.bodyMd.trim()) {
    return c.json(error("VALIDATION_ERROR", "Title and body are required to publish"), 400);
  }

  // AI quality classifier (#175). Best-effort — if no API key or model fails,
  // we publish anyway and leave the score null. Rationale string is captured
  // for admin review.
  let qualityScore: number | null = null;
  let qualityRationale: string | null = null;
  let isAcceptable = true;
  const env = { BUILDERFORCE_API_KEY: process.env.BUILDERFORCE_API_KEY };
  if (hasAnyLLMProviderKey(env)) {
    try {
      const llm = createLLMClient(env, c.var.user);
      const { data } = await llm.callJson("article_quality", {
        useCase: "reviews",
        systemPrompt:
          "You are a content moderator scoring articles on quality, originality, and absence of spam/profanity. Respond with JSON only.",
        userMessage: `Score this article. Return JSON: { "score": 0..1, "rationale": "<one sentence>", "isAcceptable": boolean }.\n\nTitle: ${existing.title}\n\nBody:\n${existing.bodyMd.slice(0, 6000)}`,
      }, QualityResponseSchema);
      qualityScore = data.score;
      qualityRationale = data.rationale;
      isAcceptable = data.isAcceptable;
    } catch { /* keep null/true defaults */ }
  }

  const [updated] = await db.update(articles).set({
    status: isAcceptable ? "published" : "flagged",
    publishedAt: new Date(),
    qualityScore,
    qualityRationale,
    qualityCheckedAt: qualityScore !== null ? new Date() : null,
    updatedAt: new Date(),
  } as any).where(eq(articles.id, existing.id)).returning();

  // Surface the article in the social feed (#90 polymorphic subjects).
  // Only published — flagged articles stay quarantined until reviewed.
  if (updated.status === "published") {
    const author = (await db.select({ name: users.name })
      .from(users).where(eq(users.id, userId)).limit(1))[0];
    const profile = (await db.select({ slug: userProfiles.customUrlSlug, avatarUrl: userProfiles.avatarUrl })
      .from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1))[0];
    const authorSlug = profile?.slug ?? userId;
    await db.insert(feedPosts).values({
      userId,
      content: `📝 New article: ${updated.title}${updated.summary ? ` — ${updated.summary}` : ""}`,
      linkUrl: `/articles/${authorSlug}/${updated.slug}`,
      linkTitle: updated.title,
      linkDescription: updated.summary ?? null,
      linkImageUrl: updated.coverImageUrl ?? null,
      privacy: "Public",
      subjectType: "article",
      subjectId: updated.id,
      embedPayload: {
        title: updated.title,
        slug: updated.slug,
        summary: updated.summary,
        coverImageUrl: updated.coverImageUrl,
        readMinutes: updated.readMinutes,
        category: updated.category,
        tags: updated.tags,
        author: { name: author?.name ?? null, slug: authorSlug, avatarUrl: profile?.avatarUrl ?? null },
      },
    } as any).catch(() => undefined);
  }

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

// (Public endpoints above the owner block — registering /public after /:id
// would let Hono's router match /api/articles/public against /:id with
// id="public" and route it to the auth-required handler.)
