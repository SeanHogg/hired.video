// /creators/:userId — public creator profile share URL.

import { makeCrawlerOgHandler } from "../_lib/og-rewrite.js";

export const onRequest = makeCrawlerOgHandler({
  metaUrl: ({ base, params }) => `${base}/api/og/creator/${params.userId}/meta`,
  defaults: {
    title: "Creator — hired.video",
    description: "Hire this creator to make a promo video for your role or company.",
    image: ({ base, params }) => `${base}/api/og/creator/${params.userId}`,
  },
});
