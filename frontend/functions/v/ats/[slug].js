// /v/ats/:slug — permanent redirect to the canonical /m/ats/:slug ATS
// landing URL. Query string is preserved. Social crawlers follow the 301
// to functions/m/... (or the SPA). Do not keep an OG rewrite on this path.

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const slug = context.params.slug;
  url.pathname = `/m/ats/${slug}`;
  return Response.redirect(url.toString(), 301);
}
