// /articles/:authorSlug/:slug — public DB-backed article detail page.
// Rewrites OG meta AND injects the Article JSON-LD (with a guaranteed cover
// image) for social + search crawlers so the article is eligible for the
// "Article" rich result and never reported as "missing thumbnail" — without
// the crawler having to execute the SPA. Real users get the unmodified SPA.
// Mirrors the /v/:videoId function; the article metadata + JSON-LD are built
// server-side by GET /api/og/article/:userRef/:slug/meta.

import { isSocialCrawler, rewriteMeta, getBaseHtml, htmlResponse, apiBase } from "../../_lib/og-rewrite.js";

export async function onRequest({ request, env, params, next }) {
  if (!isSocialCrawler(request)) return next();

  const { authorSlug, slug } = params;
  const base = apiBase(env);

  const meta = {
    title: undefined,
    description: undefined,
    image: undefined,
    url: new URL(request.url).toString(),
    jsonLd: undefined,
  };
  try {
    const r = await fetch(`${base}/api/og/article/${encodeURIComponent(authorSlug)}/${encodeURIComponent(slug)}/meta`);
    if (r.ok) {
      const m = await r.json();
      if (m?.title) meta.title = m.title;
      if (m?.description) meta.description = m.description;
      if (m?.image) meta.image = m.image;
      if (Array.isArray(m?.jsonLd) && m.jsonLd.length) meta.jsonLd = m.jsonLd;
    }
  } catch { /* fall back to the SPA's default meta */ }

  const { html, headers } = await getBaseHtml(next);
  return htmlResponse(rewriteMeta(html, meta), headers);
}
