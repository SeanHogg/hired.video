// /v/:videoId — permanent redirect to the canonical /m/:videoId watch URL.
// Query string is preserved. Social crawlers follow the 301 to
// functions/m/[videoId].js, which rewrites OG meta. Do not keep the OG
// rewrite on this path.

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const id = context.params.videoId;
  url.pathname = `/m/${id}`;
  return Response.redirect(url.toString(), 301);
}
