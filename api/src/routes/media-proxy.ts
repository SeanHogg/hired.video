/**
 * GET /api/media/image?url=<http(s) image> — a signed-in owner's remote
 * image, re-served from the API origin (the app-wide CORS echo applies), so
 * the browser can draw it into a canvas without tainting it. The kit's
 * document downloads rasterize free elements this way when an image's own
 * host sends no CORS headers.
 *
 * Rules (utils/image-proxy.ts): http(s) public hosts only, image/* only (no
 * SVG), at most 15 MB, redirects followed by hand (≤ 3 hops, each re-checked).
 * At most 120 requests a minute per signed-in user. Responses are cached at
 * the edge (Cache API) by URL for a day, so a repeated download never
 * refetches.
 */
import { Hono, type Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { fail } from "../utils/response.js";
import { createIpRateLimiter, getClientIp } from "../middleware/rateLimiter.js";
import {
  MAX_PROXY_IMAGE_BYTES,
  fetchPublicUrl,
  isImageContentType,
  parseProxyTarget,
  readCapped,
} from "../utils/image-proxy.js";

const CACHE_SECONDS = 86_400;
const FETCH_TIMEOUT_MS = 10_000;

/** Per user (IP when signed out — those get a 401 anyway). */
const RATE_LIMIT_PER_MINUTE = 120;
const mediaProxyRateLimiter = createIpRateLimiter({
  windowMs: 60_000,
  maxAttempts: RATE_LIMIT_PER_MINUTE,
  message: "Too many image requests. Please try again in a minute.",
  keyOf: (c) => {
    const user = (c as Context<AppEnv>).var.user;
    return user?.sub ? `user:${user.sub}` : `ip:${getClientIp(c)}`;
  },
});

export const mediaProxyRoutes = new Hono<AppEnv>();

function edgeCache(): Cache | null {
  const store = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches;
  return store?.default ?? null;
}

mediaProxyRoutes.get("/image", mediaProxyRateLimiter, async (c) => {
  if (!c.var.user) return c.json(fail("UNAUTHORIZED", "Sign in to load images"), 401);
  const target = parseProxyTarget(c.req.query("url"));
  if (!target) return c.json(fail("VALIDATION_ERROR", "Not a public http(s) image URL"), 400);

  const cache = edgeCache();
  const cacheKey = new Request(`https://media-proxy.cache/${encodeURIComponent(target.toString())}`);
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit) {
    const bytes = await hit.arrayBuffer();
    return c.body(bytes, 200, {
      "Content-Type": hit.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": `private, max-age=${CACHE_SECONDS}`,
      "X-Content-Type-Options": "nosniff",
    });
  }

  let upstream: Response | null;
  try {
    // Redirects are followed by hand so no hop can reach a refused host.
    upstream = await fetchPublicUrl(target, {
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return c.json(fail("UPSTREAM_ERROR", "Could not fetch the image"), 502);
  }
  if (!upstream) return c.json(fail("VALIDATION_ERROR", "Redirected off a public host"), 400);
  if (!upstream.ok) return c.json(fail("UPSTREAM_ERROR", `Image host answered ${upstream.status}`), 502);
  const type = upstream.headers.get("content-type");
  if (!isImageContentType(type)) return c.json(fail("UNSUPPORTED_MEDIA_TYPE", "Not an image"), 415);
  const body = await readCapped(upstream, MAX_PROXY_IMAGE_BYTES);
  if (!body) return c.json(fail("PAYLOAD_TOO_LARGE", "Image too large"), 413);

  const headers = {
    "Content-Type": type ?? "application/octet-stream",
    "Cache-Control": `private, max-age=${CACHE_SECONDS}`,
    "X-Content-Type-Options": "nosniff",
  };
  const cached = new Response(body, { headers: { ...headers, "Cache-Control": `public, max-age=${CACHE_SECONDS}` } });
  await cache?.put(cacheKey, cached).catch(() => undefined);
  // c.body keeps the app-wide CORS headers on the response.
  return c.body(body, 200, headers);
});
