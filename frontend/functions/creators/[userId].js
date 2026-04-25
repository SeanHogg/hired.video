// /creators/:userId — public creator profile share URL.

import { isSocialCrawler, rewriteMeta, getBaseHtml, htmlResponse, apiBase } from "../_lib/og-rewrite.js";

export async function onRequest({ request, env, params, next }) {
  if (!isSocialCrawler(request)) return next();

  const userId = params.userId;
  const base = apiBase(env);

  const meta = {
    title: "Creator on hired.video",
    description: "Hire this creator to make a promo video for your role or company.",
    image: `${base}/api/og/creator/${userId}`,
    url: new URL(request.url).toString(),
  };
  try {
    const r = await fetch(`${base}/api/og/creator/${userId}/meta`);
    if (r.ok) {
      const m = await r.json();
      if (m?.title) meta.title = m.title;
      if (m?.description) meta.description = m.description;
    }
  } catch { /* fall back to defaults */ }

  const { html, headers } = await getBaseHtml(next);
  return htmlResponse(rewriteMeta(html, meta), headers);
}
