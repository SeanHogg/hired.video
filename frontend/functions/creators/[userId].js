// /creators/:userId — public creator profile share URL.

import { isSocialCrawler, rewriteMeta, getBaseHtml, htmlResponse, apiBase } from "../_lib/og-rewrite.js";

export async function onRequest({ request, env, params, next }) {
  if (!isSocialCrawler(request)) return next();

  const userId = params.userId;
  const base = apiBase(env);

  let meta = { title: "Creator on hired.video", description: "Hire this creator to make a promo video for your role or company." };
  try {
    const r = await fetch(`${base}/api/creators/public/${userId}`);
    if (r.ok) {
      const json = await r.json();
      const data = json?.data ?? json;
      const c = data?.creator;
      const ownerName = c?.displayName || data?.profile?.displayName;
      if (ownerName) meta.title = `${ownerName} — Creator on hired.video`;
      if (c?.tagline) meta.description = c.tagline;
    }
  } catch {}
  meta.image = `${base}/api/og/creator/${userId}`;
  meta.url = new URL(request.url).toString();

  const { html, headers } = await getBaseHtml(next);
  return htmlResponse(rewriteMeta(html, meta), headers);
}
