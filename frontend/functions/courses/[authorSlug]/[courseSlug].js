// /courses/:authorSlug/:courseSlug — public course detail. Injects Course
// JSON-LD + OG meta for crawlers via /api/og/course/:userRef/:slug/meta.
// No `defaults`: unresolved/unpublished courses return null fields so the
// page's own (incl. prerendered) meta is preserved.

import { makeCrawlerOgHandler } from "../../_lib/og-rewrite.js";

export const onRequest = makeCrawlerOgHandler({
  metaUrl: ({ base, params }) =>
    `${base}/api/og/course/${encodeURIComponent(params.authorSlug)}/${encodeURIComponent(params.courseSlug)}/meta`,
});
