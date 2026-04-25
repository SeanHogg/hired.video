// /voice/:slug — public voice-clone marketplace listing share URL.

import { isSocialCrawler, rewriteMeta, getBaseHtml, htmlResponse, apiBase } from "../_lib/og-rewrite.js";

export async function onRequest({ request, env, params, next }) {
  if (!isSocialCrawler(request)) return next();

  const slug = params.slug;
  const base = apiBase(env);

  let meta = { title: "Voice Clone on hired.video", description: "Buy this AI voice clone — license a real person's voice for your videos." };
  try {
    const r = await fetch(`${base}/api/studio/voice-clones/public/${slug}`);
    if (r.ok) {
      const json = await r.json();
      const v = json?.data ?? json;
      if (v?.name) meta.title = `${v.name} — AI Voice on hired.video`;
      if (v?.description) meta.description = v.description;
    }
  } catch {}
  meta.image = `${base}/api/og/voice/${slug}`;
  meta.url = new URL(request.url).toString();

  const { html, headers } = await getBaseHtml(next);
  return htmlResponse(rewriteMeta(html, meta), headers);
}
