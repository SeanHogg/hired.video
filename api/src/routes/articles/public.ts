/**
 * Public article reads (no auth): the published list, an author's list,
 * the by-id public path (a studio linked-content card's link, #2312) and
 * the read-by-slug. `/public/id/:id` is registered BEFORE
 * `/public/:userId/:slug`, which would otherwise match it.
 */
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";
import { filterVisibleCreators, isCreatorVisible } from "../../services/creators/visibility.js";
import { ARTICLE_LIST_FIELDS, parseFields, projectRows } from "../../../../shared/projection.js";
import { resolveUserRef } from "../../services/user/resolveUserRef.js";
import { publicArticlePathById } from "../../services/articles/public-article-path.js";
import { withCacheHeaders } from "../../utils/cache-headers.js";
import { toPublicCard } from "./shared.js";

const { articles, users, userProfiles } = schema;

export const articlePublicRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Public endpoints — registered before /:id so literal `/public` paths don't
// match the param route.
// ---------------------------------------------------------------------------

articlePublicRoutes.get("/public", async (c) => {
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
        author: { id: users.id, name: users.name, isSystem: users.isSystem },
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

articlePublicRoutes.get("/public/by-user/:userId", async (c) => {
  const db = getDb();
  // The path segment is the public author ref — a UUID or a customUrlSlug
  // (see resolveUserRef + toPublicCard's `author.slug`). Resolve before
  // filtering so vanity-slug links don't silently return [].
  const userId = await resolveUserRef(db, c.req.param("userId"));
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 100);
  if (!userId || !(await isCreatorVisible(userId))) {
    return c.json(success([] as unknown[]), 200);
  }
  try {
    const rows = await db
      .select({
        article: articles,
        author: { id: users.id, name: users.name, isSystem: users.isSystem },
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

// Registered BEFORE `/public/:userId/:slug`, which `/public/id/<id>` would
// otherwise match. A studio linked-content card knows only the article id;
// the frontend's by-id resolver redirects to the path returned here (#2312).
articlePublicRoutes.get("/public/id/:id", async (c) => {
  const id = c.req.param("id");
  if (!UuidLikeSchema.safeParse(id).success) return c.json(error("NOT_FOUND", "Article not found"), 404);
  const path = await publicArticlePathById(getDb(), id);
  if (!path) return c.json(error("NOT_FOUND", "Article not found"), 404);
  withCacheHeaders(c, { scope: "public", maxAge: 60, sMaxAge: 300, swr: 600 });
  return c.json(success({ path }), 200);
});

articlePublicRoutes.get("/public/:userId/:slug", async (c) => {
  const db = getDb();
  // First segment is the public author ref — a UUID or a customUrlSlug (the
  // vanity slug the card link emits via `author.slug = customUrlSlug ?? id`).
  // Resolve to a userId before the lookup so custom-slug links don't 404.
  const authorUserId = await resolveUserRef(db, c.req.param("userId"));
  if (!authorUserId) return c.json(error("NOT_FOUND", "Article not found"), 404);
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
      eq(articles.userId, authorUserId),
      eq(articles.slug, c.req.param("slug")),
      eq(articles.status, "published"),
      eq(users.emailVerified, true),
    ))
    .limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Article not found"), 404);
  if (!(await isCreatorVisible(row.author.id))) {
    return c.json(error("NOT_FOUND", "Article not found"), 404);
  }

  // CDN-cacheable read (#858). The view-count bump is a write side-effect that
  // would be skipped whenever Cloudflare serves a cached body, so it no longer
  // lives here — the client beacons `POST /:id/view` on mount instead. With the
  // bump gone the response is pure-read and safe to edge-cache.
  withCacheHeaders(c, { scope: "public", maxAge: 60, sMaxAge: 300, swr: 600 });

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
    viewCount: row.article.viewCount,
    publishedAt: row.article.publishedAt,
    author: {
      id: row.author.id,
      name: row.author.name,
      avatarUrl: row.authorProfile?.avatarUrl ?? null,
      slug: row.authorProfile?.customUrlSlug ?? row.author.id,
    },
  }), 200);
});
