// /resumes/:id — when a candidate shares their resume URL, social crawlers
// receive an OG card built from the resume's title + owner. Humans hit the
// SPA path with no latency change.

import { isSocialCrawler, rewriteMeta, getBaseHtml, htmlResponse, apiBase } from "../_lib/og-rewrite.js";

export async function onRequest({ request, env, params, next }) {
  if (!isSocialCrawler(request)) return next();

  const id = params.id;
  const base = apiBase(env);

  let meta = { title: "Resume — hired.video", description: "View this resume on hired.video." };
  try {
    const r = await fetch(`${base}/api/resume/public/${id}`);
    if (r.ok) {
      const json = await r.json();
      const data = json?.data ?? json?.resume ?? json;
      if (data?.title) meta.title = `${data.title} — Resume on hired.video`;
      const owner = data?.ownerName || data?.user?.name;
      if (owner) meta.description = `${owner}'s resume on hired.video — watch their video, see their skills, get in touch.`;
    }
  } catch {}
  meta.image = `${base}/api/og/r/${id}`;
  meta.url = new URL(request.url).toString();

  const { html, headers } = await getBaseHtml(next);
  return htmlResponse(rewriteMeta(html, meta), headers);
}
