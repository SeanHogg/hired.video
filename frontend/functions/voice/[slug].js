// /voice/:slug — public voice-clone marketplace listing share URL.

import { isSocialCrawler, rewriteMeta, getBaseHtml, htmlResponse, apiBase } from "../_lib/og-rewrite.js";

export async function onRequest({ request, env, params, next }) {
  if (!isSocialCrawler(request)) return next();

  const slug = params.slug;
  const base = apiBase(env);

  const meta = {
    title: "Voice Clone on hired.video",
    description: "License this AI voice clone for your videos and projects.",
    image: `${base}/api/og/voice/${slug}`,
    url: new URL(request.url).toString(),
  };
  try {
    const r = await fetch(`${base}/api/og/voice/${slug}/meta`);
    if (r.ok) {
      const m = await r.json();
      if (m?.title) meta.title = m.title;
      if (m?.description) meta.description = m.description;
    }
  } catch { /* fall back to defaults */ }

  const { html, headers } = await getBaseHtml(next);
  return htmlResponse(rewriteMeta(html, meta), headers);
}
