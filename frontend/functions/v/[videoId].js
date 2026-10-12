// /v/:videoId — public studio-project share URL (any mediaKind).
// Rewrites OG meta + injects the VideoObject JSON-LD (with the required
// thumbnailUrl) for social + search crawlers so the project is index-eligible
// without running the SPA — fixes the Search Console "videos can't be indexed
// — missing thumbnail" report. Real users get the SPA unmodified. The
// kind-aware title/description/thumbnail + JSON-LD come from
// GET /api/og/v/:id/meta (#1216).

import { makeCrawlerOgHandler } from "../_lib/og-rewrite.js";

export const onRequest = makeCrawlerOgHandler({
  metaUrl: ({ base, params }) => `${base}/api/og/v/${params.videoId}/meta`,
  defaults: {
    // Kind-neutral so a fetch failure on a non-video share doesn't out itself
    // as video-only.
    title: "On hired.video",
    description: "Check out this project on hired.video.",
    image: ({ base, params }) => `${base}/api/og/v/${params.videoId}`,
  },
});
