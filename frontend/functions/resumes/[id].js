// /resumes/:id — when a candidate shares their resume URL, social crawlers
// receive an OG card built from the resume's title + owner. Humans hit the
// SPA path with no latency change.

import { makeCrawlerOgHandler } from "../_lib/og-rewrite.js";

export const onRequest = makeCrawlerOgHandler({
  metaUrl: ({ base, params }) => `${base}/api/og/r/${params.id}/meta`,
  defaults: {
    title: "Resume — hired.video",
    description: "View this resume on hired.video.",
    image: ({ base, params }) => `${base}/api/og/r/${params.id}`,
  },
});
