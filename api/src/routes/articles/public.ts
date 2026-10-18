/**
 * Public article reads (no auth): the published list, an author's list,
 * the by-id public path (a studio linked-content card's link, #2312) and
 * the read-by-slug. `/public/id/:id` is registered BEFORE
 * `/public/:userId/:slug`, which would otherwise match it.
 */
import { Hono } from "hono";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { isCreatorVisible } from "../../services/creators/visibility.js";
import { ARTICLE_LIST_FIELDS, parseFields, projectRows } from "../../../../shared/projection.js";
import {
  findPublicArticleBySlug,
  listPublicArticles,
  listPublicArticlesByAuthor,
  publicArticlePath,
  resolvePublicAuthor,
} from "../../services/articles/public-reads.js";
import { withCacheHeaders } from "../../utils/cache-headers.js";
import { clampLimit } from "../../utils/pagination.js";
import { toPublicCard } from "./shared.js";

export const articlePublicRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Public endpoints — registered before /:id so literal `/public` paths don't
// match the param route.
// ---------------------------------------------------------------------------

articlePublicRoutes.get("/public", async (c) => {
  const limit = clampLimit(c.req.query("limit"), 20, 100);
  try {
    // Sector + audience filters from #1165. Both optional; legacy queries
    // without these params behave identically to before.
    const rows = await listPublicArticles({
      kind: c.req.query("kind") || undefined,
      sector: c.req.query("sector") || undefined,
      audience: c.req.query("audience") || undefined,
      limit,
    });
    const items = rows.map(toPublicCard);
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
  // The path segment is the public author ref — a UUID or a customUrlSlug
  // (see resolveUserRef + toPublicCard's `author.slug`). Resolve before
  // filtering so vanity-slug links don't silently return [].
  const userId = await resolvePublicAuthor(c.req.param("userId"));
  const limit = clampLimit(c.req.query("limit"), 50, 100);
  if (!userId || !(await isCreatorVisible(userId))) {
    return c.json(success([] as unknown[]), 200);
  }
  try {
    const rows = await listPublicArticlesByAuthor(userId, limit);
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
  const path = await publicArticlePath(id);
  if (!path) return c.json(error("NOT_FOUND", "Article not found"), 404);
  withCacheHeaders(c, { scope: "public", maxAge: 60, sMaxAge: 300, swr: 600 });
  return c.json(success({ path }), 200);
});

articlePublicRoutes.get("/public/:userId/:slug", async (c) => {
  // First segment is the public author ref — a UUID or a customUrlSlug (the
  // vanity slug the card link emits via `author.slug = customUrlSlug ?? id`).
  // Resolved to a userId before the lookup so custom-slug links don't 404.
  const row = await findPublicArticleBySlug(c.req.param("userId"), c.req.param("slug"));
  if (!row) return c.json(error("NOT_FOUND", "Article not found"), 404);

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
