// /v/:videoId — public studio-project share URL (any mediaKind).
// Rewrites OG meta only for social crawlers (LinkedIn, X, Facebook,
// etc.) so the link preview shows the project's actual title +
// thumbnail + kind-aware copy. Real users get the SPA unmodified.
// The fetched payload from /api/og/v/<id>/meta (#1216) already
// carries kind-aware title + description for non-video kinds; the
// default below covers the network-failure path with kind-neutral
// copy rather than the legacy "Video Resume" string that misled
// share previews for Photoshop drawings / games / podcasts.

import { isSocialCrawler, rewriteMeta, getBaseHtml, htmlResponse, apiBase } from "../_lib/og-rewrite.js";

export async function onRequest({ request, env, params, next }) {
  if (!isSocialCrawler(request)) return next();

  const id = params.videoId;
  const base = apiBase(env);

  // Pull real per-content title + description so the LinkedIn/X/Facebook
  // preview card uses the project's actual metadata. The default copy
  // is kind-neutral ("project") so a fetch failure on a non-video
  // share doesn't out itself as video-only.
  const meta = {
    title: "On hired.video",
    description: "Check out this project on hired.video.",
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
