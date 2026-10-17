/**
 * /api/featured-creators — Featured-creator ranking surface (#180).
 *
 * Ranks creators with active enrollment rows on a weighted blend of:
 *   rating average × review volume × engagement depth × project count.
 *
 * The exact ranking weights are tunable constants and exposed via query
 * params for SuperAdmin tuning (e.g. `?wRating=0.5&wReviews=0.2`).
 *
 *   GET  /                      top-N creators ordered by score (public)
 *   GET  /by-category/:slug     same, filtered to a creator-program category
 */

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { clampLimit } from "../utils/pagination.js";
import {
  DEFAULT_FEATURED_CREATOR_WEIGHTS as D,
  getFeaturedCreators,
} from "../services/creators/featured-creators.js";

export const featuredCreatorsRoutes = new Hono<AppEnv>();

featuredCreatorsRoutes.get("/", async (c) => {
  const limit = clampLimit(c.req.query("limit"), 20, 100);
  const category = c.req.query("category") || null;
  const weights = {
    rating: parseFloat(c.req.query("wRating") ?? String(D.rating)) || D.rating,
    reviews: parseFloat(c.req.query("wReviews") ?? String(D.reviews)) || D.reviews,
    projects: parseFloat(c.req.query("wProjects") ?? String(D.projects)) || D.projects,
    earnings: parseFloat(c.req.query("wEarnings") ?? String(D.earnings)) || D.earnings,
  };
  const items = await getFeaturedCreators({ limit, category, weights });
  return c.json(success({ items, weights }), 200);
});

featuredCreatorsRoutes.get("/by-category/:slug", async (c) => {
  const category = c.req.param("slug");
  c.req.raw.url; // satisfy linter
  return featuredCreatorsRoutes.fetch(
    new Request(`${c.req.url.split("/by-category")[0]}?category=${encodeURIComponent(category)}`, {
      headers: c.req.raw.headers,
    }),
    c.env as any,
  );
});

featuredCreatorsRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Featured creators route not found" } }, 404),
);
