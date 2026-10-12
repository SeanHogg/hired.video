// /articles/:authorSlug/:slug — public DB-backed article detail page.
// Rewrites OG meta AND injects the Article JSON-LD (with a guaranteed cover
// image) for social + search crawlers so the article is eligible for the
// "Article" rich result and never reported as "missing thumbnail" — without
// the crawler having to execute the SPA. Real users get the unmodified SPA.
// Metadata + JSON-LD are built server-side by
// GET /api/og/article/:userRef/:slug/meta.

import { makeCrawlerOgHandler } from "../../_lib/og-rewrite.js";

export const onRequest = makeCrawlerOgHandler({
  metaUrl: ({ base, params }) =>
    `${base}/api/og/article/${encodeURIComponent(params.authorSlug)}/${encodeURIComponent(params.slug)}/meta`,
});
