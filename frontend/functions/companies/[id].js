// /companies/:id — public company profile (UUID or slug). Injects
// Organization JSON-LD (+ aggregateRating) + OG meta for crawlers via
// /api/og/company/:idOrSlug/meta. No `defaults`: non-company paths (e.g.
// /companies/create) resolve to null fields so the SPA meta is left intact.

import { makeCrawlerOgHandler } from "../_lib/og-rewrite.js";

export const onRequest = makeCrawlerOgHandler({
  metaUrl: ({ base, params }) => `${base}/api/og/company/${encodeURIComponent(params.id)}/meta`,
});
