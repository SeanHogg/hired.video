// /events/:idOrSlug — public networking event. Injects Event JSON-LD + OG
// meta for crawlers via /api/og/event/:idOrSlug/meta. Only PUBLIC events
// resolve. No `defaults`: non-public / non-event paths (e.g. /events/new)
// return null fields so the SPA meta is left intact.

import { makeCrawlerOgHandler } from "../_lib/og-rewrite.js";

export const onRequest = makeCrawlerOgHandler({
  metaUrl: ({ base, params }) => `${base}/api/og/event/${encodeURIComponent(params.idOrSlug)}/meta`,
});
