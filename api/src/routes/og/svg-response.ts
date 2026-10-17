/** HTTP mapping for OG SVG bodies: `longCache` = day-long edge cache (stable
 *  per-URL cards), otherwise 10 min browser / 1 h edge. */
export function svgResponse(svg: string, longCache = false): Response {
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": longCache
        ? "public, max-age=3600, s-maxage=86400"
        : "public, max-age=600, s-maxage=3600",
    },
  });
}
