// /jobs/:id — public job posting. Injects JobPosting JSON-LD (Google for
// Jobs) + OG meta for crawlers via /api/og/job/:id/meta. No `defaults`: the
// meta endpoint returns null fields for non-job paths (e.g. /jobs/create) and
// inactive/closed roles, so rewriteMeta is a no-op and those keep SPA meta.

import { makeCrawlerOgHandler } from "../_lib/og-rewrite.js";

export const onRequest = makeCrawlerOgHandler({
  metaUrl: ({ base, params }) => `${base}/api/og/job/${encodeURIComponent(params.id)}/meta`,
});
