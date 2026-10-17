/**
 * /api/feed discovery — content search, trending hashtags / posts (shared
 * 300s read-through cache), and the composer's link-preview unfurl.
 */

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { searchFeedPosts } from "../../services/feed/feedPostsService.js";
import { getTrendingPosts, getTrendingTags } from "../../services/feed/feedTrendingService.js";
import { getLinkPreview } from "../../services/feed/linkPreviewService.js";
import { clampLimit, parsePagination } from "../../utils/pagination.js";
import { FEED_PAGE_OPTS } from "./pagination.js";
import { readBody, viewerOf } from "./http.js";

export const feedDiscoveryRoutes = new Hono<AppEnv>();

/** GET /api/feed/search */
feedDiscoveryRoutes.get("/search", async (c) => {
  const searchTerm = c.req.query("searchTerm") ?? "";
  const { page: pageNumber, limit: pageSize } = parsePagination(c, FEED_PAGE_OPTS);
  const dtos = await searchFeedPosts(viewerOf(c), { searchTerm, pageNumber, pageSize });
  return c.json(success({ posts: dtos, totalCount: dtos.length, pageNumber, pageSize }), 200);
});

/** GET /api/feed/trending-tags — top hashtags by post frequency (last 30 days).
 *  Public, non-community posts only (anonymous-visible). */
feedDiscoveryRoutes.get("/trending-tags", async (c) => {
  const tags = await getTrendingTags(clampLimit(c.req.query("limit"), 20, 50));
  return c.json(success(tags), 200);
});

/** GET /api/feed/trending-posts — public posts ranked by recent engagement
 *  over the last 21 days. Powers the "Trending" sidebar; clicking a row
 *  deep-links to /feed/:id. */
feedDiscoveryRoutes.get("/trending-posts", async (c) => {
  const trending = await getTrendingPosts(clampLimit(c.req.query("limit"), 5, 20));
  return c.json(success(trending), 200);
});

/** POST /api/feed/link-preview — OpenGraph unfurl for the composer's
 *  link card (#1968). Scrape + SSRF guard + cache live in the service. */
feedDiscoveryRoutes.post("/link-preview", async (c) => {
  const body = await readBody(c);
  const url = typeof body.url === "string" ? body.url : "";
  const result = await getLinkPreview(url);
  if (!result.ok) return c.json(error("INVALID_URL", "URL must be a public http(s) address"), 400);
  return c.json(success(result.preview), 200);
});
