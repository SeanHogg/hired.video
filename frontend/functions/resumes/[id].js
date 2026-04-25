// /resumes/:id — when a candidate shares their resume URL, social crawlers
// receive an OG card built from the resume's title + owner. Humans hit the
// SPA path with no latency change.

import { isSocialCrawler, rewriteMeta, getBaseHtml, htmlResponse, apiBase } from "../_lib/og-rewrite.js";

export async function onRequest({ request, env, params, next }) {
  if (!isSocialCrawler(request)) return next();

  const id = params.id;
  const base = apiBase(env);

  const meta = {
    title: "Resume — hired.video",
    description: "View this resume on hired.video.",
    image: `${base}/api/og/r/${id}`,
    url: new URL(request.url).toString(),
  };
  try {
    const r = await fetch(`${base}/api/og/r/${id}/meta`);
    if (r.ok) {
      const m = await r.json();
      if (m?.title) meta.title = m.title;
      if (m?.description) meta.description = m.description;
    }
  } catch { /* fall back to defaults */ }

  const { html, headers } = await getBaseHtml(next);
  return htmlResponse(rewriteMeta(html, meta), headers);
}
