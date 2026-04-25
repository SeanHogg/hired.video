// /v/:videoId — public video resume share URL.
// Rewrites OG meta only for social crawlers (LinkedIn, X, Facebook, etc.) so
// the link preview shows the candidate's video title + thumbnail instead of
// the generic site logo. Real users get the SPA unmodified.

import { isSocialCrawler, rewriteMeta, getBaseHtml, htmlResponse, apiBase } from "../_lib/og-rewrite.js";

export async function onRequest({ request, env, params, next }) {
  if (!isSocialCrawler(request)) return next();

  const id = params.videoId;
  const base = apiBase(env);

  let meta = { title: "Video Resume — hired.video", description: "Watch this AI-generated video resume on hired.video." };
  try {
    const r = await fetch(`${base}/api/studio/projects/${id}/public`);
    if (r.ok) {
      const json = await r.json();
      const p = json?.data ?? json;
      if (p?.title) meta.title = `${p.title} — Video Resume`;
      if (p?.description) meta.description = p.description;
      if (p?.thumbnailUrl) meta.image = p.thumbnailUrl;
    }
  } catch {}
  if (!meta.image) meta.image = `${base}/api/og/v/${id}`;
  meta.url = new URL(request.url).toString();

  const { html, headers } = await getBaseHtml(next);
  return htmlResponse(rewriteMeta(html, meta), headers);
}
