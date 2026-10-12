// /voice/:slug — public voice-clone marketplace listing share URL.

import { makeCrawlerOgHandler } from "../_lib/og-rewrite.js";

export const onRequest = makeCrawlerOgHandler({
  metaUrl: ({ base, params }) => `${base}/api/og/voice/${params.slug}/meta`,
  defaults: {
    title: "Voice Clone — hired.video",
    description: "License this AI voice clone for your videos and projects.",
    image: ({ base, params }) => `${base}/api/og/voice/${params.slug}`,
  },
});
