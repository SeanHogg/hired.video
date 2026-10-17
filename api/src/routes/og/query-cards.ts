/**
 * Query-param-driven OG images (no DB): `/page`, `/blog`, `/articles`,
 * `/courses`, `/lesson-diagram`. Stable per query string, so day-long cache.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { getCourseDiagram } from "../../../../shared/course-diagrams.js";
import {
  buildArticlesCardSvg,
  buildBlogCardSvg,
  buildCourseCoverSvg,
  buildPageCardSvg,
} from "../../services/og/query-cards.js";
import { svgResponse } from "./svg-response.js";

export const ogQueryCardRoutes = new Hono<AppEnv>();

// Generic branded social card for any marketing / app route, so the
// build-time prerender (frontend/scripts/prerender.mjs) can give EVERY
// indexable route its own share image without this worker knowing routes.
ogQueryCardRoutes.get("/page", (c) =>
  svgResponse(
    buildPageCardSvg({
      title: c.req.query("title"),
      eyebrow: c.req.query("eyebrow"),
      subtitle: c.req.query("subtitle"),
    }),
    true,
  ));

// Blog posts live in the front-end registry (frontend/data/blog-posts.ts).
ogQueryCardRoutes.get("/blog", async (c) =>
  svgResponse(
    buildBlogCardSvg({
      title: c.req.query("title"),
      category: c.req.query("category"),
      date: c.req.query("date"),
      author: c.req.query("author"),
    }),
    true,
  ));

// Fallback cover for articles without a cover_image_url (seo-ugc adapter +
// ArticleView hero both point here).
ogQueryCardRoutes.get("/articles", async (c) =>
  svgResponse(
    buildArticlesCardSvg({
      title: c.req.query("title"),
      category: c.req.query("category"),
      date: c.req.query("date"),
      author: c.req.query("author"),
    }),
    true,
  ));

// Deterministic course cover (migration 0190 backfills cover_image_url here).
ogQueryCardRoutes.get("/courses", async (c) =>
  svgResponse(
    buildCourseCoverSvg({
      title: c.req.query("title"),
      category: c.req.query("category"),
      difficulty: c.req.query("difficulty"),
    }),
    true,
  ));

// Schematic lesson diagram embedded in seeded lesson bodies (migration 0190).
// Unknown keys 404 so a typo surfaces in the lesson body immediately.
ogQueryCardRoutes.get("/lesson-diagram", async (c) => {
  const diagram = getCourseDiagram(c.req.query("d") || "");
  if (!diagram) {
    return c.json({ error: "unknown_diagram" }, 404);
  }
  return svgResponse(diagram.svg, true);
});
