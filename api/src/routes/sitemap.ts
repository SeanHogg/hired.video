// sitemap.ts — Dynamic XML sitemap (#SEO), served raw at GET /sitemap.xml
// (public, no auth). The document is built + cached in services/seo/sitemap.ts.

import { Hono } from "hono";
import { getSitemapXml } from "../services/seo/sitemap.js";

export const sitemapRoutes = new Hono();

sitemapRoutes.get("/sitemap.xml", async (c) => {
  // The worker serves both this sitemap and /api/og/* — use its own origin
  // for OG/thumbnail URLs (the SPA host doesn't proxy /api).
  const xml = await getSitemapXml(new URL(c.req.url).origin);
  c.header("Content-Type", "application/xml");
  c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  return c.body(xml, 200);
});
