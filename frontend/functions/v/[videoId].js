// /v/:videoId — public video resume share URL.
// Rewrites OG meta only for social crawlers (LinkedIn, X, Facebook, etc.) so
// the link preview shows the candidate's video title + thumbnail instead of
// the generic site logo. Real users get the SPA unmodified.

import { isSocialCrawler, rewriteMeta, getBaseHtml, htmlResponse, apiBase } from "../_lib/og-rewrite.js";

export async function onRequest({ request, env, params, next }) {
  if (!isSocialCrawler(request)) return next();

  const id = params.videoId;
  const base = apiBase(env);

  // Pull real per-content title + description so the LinkedIn/X/Facebook
  // preview card uses the candidate's actual video metadata.
  const meta = {
    title: "Video Resume — hired.video",
    description: "Watch this AI-generated video resume on hired.video.",
    image: `${base}/api/og/v/${id}`,
    url: new URL(request.url).toString(),
  };
  try {
    const r = await fetch(`${base}/api/og/v/${id}/meta`);
    if (r.ok) {
      const m = await r.json();
      if (m?.title) meta.title = m.title;
      if (m?.description) meta.description = m.description;
      if (m?.image) meta.image = m.image;
    }
  } catch { /* fall back to defaults */ }

  const { html, headers } = await getBaseHtml(next);
  return htmlResponse(rewriteMeta(html, meta), headers);
}
