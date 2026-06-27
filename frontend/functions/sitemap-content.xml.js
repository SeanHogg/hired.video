// /sitemap-content.xml — proxies the worker's dynamic sitemap (jobs,
// companies, public profiles, salary leaves, marketplace templates, public
// studio VIDEOS as <video:video> entries, and published ARTICLES) onto the
// hired.video host so it can be referenced in robots.txt and actually crawled.
//
// Why this exists (#2260): the dynamic generator lives at api/src/routes/
// sitemap.ts and is only reachable at api.hired.video/sitemap.xml — which
// robots.txt does NOT advertise (it lists the static Pages sitemaps on
// hired.video). Without this proxy, none of the dynamic inventory — including
// the new video/article entries that carry the thumbnails Google needs to
// index them (#2262) — is ever crawled. Pointing the worker origin's sitemap
// through a hired.video URL closes that loop with zero changes to the working
// static sitemaps.

export async function onRequest({ env }) {
  // The worker (api.hired.video) owns /sitemap.xml + /api/og/*. apiBase's
  // generic default is the SPA host, so default explicitly to the worker.
  const base = env.PUBLIC_API_BASE || env.API_BASE || "https://api.hired.video";
  const headers = {
    "content-type": "application/xml; charset=utf-8",
    "cache-control": "public, max-age=3600, s-maxage=3600",
  };
  try {
    const res = await fetch(`${base}/sitemap.xml`, {
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    const xml = await res.text();
    return new Response(xml, { status: res.ok ? 200 : 502, headers });
  } catch {
    // Empty-but-valid urlset rather than a 5xx so a transient worker blip
    // doesn't make Search Console flag the whole sitemap as unreadable.
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>',
      { status: 200, headers },
    );
  }
}
