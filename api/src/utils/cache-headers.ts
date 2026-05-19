import type { Context } from "hono";

/**
 * Cache-Control header helper. Centralises the policy choice so route
 * files don't hand-roll header strings and so we can sweep all callers
 * when the cache strategy changes.
 *
 * Two scopes:
 *   - `public`: CDN-cacheable (Cloudflare). Use ONLY for responses that
 *     are byte-identical for every viewer (OG images, public profiles,
 *     sitemap, talent feed). Sets both `max-age` and `s-maxage` so the
 *     browser AND Cloudflare's edge cache the response.
 *   - `private`: per-user. NEVER cached by Cloudflare. Sets `max-age` so
 *     the user's own browser short-circuits repeat requests within the
 *     window (back-button, tab switch with refetchOnWindowFocus off,
 *     React Query refetch on mount). Pair with a reasonable `staleTime`
 *     in React Query.
 *
 * `swr` (stale-while-revalidate) lets the cache serve a stale copy while
 * it kicks off a background refresh — recommended for public reads.
 */
export interface CacheHeaderOptions {
  scope: "public" | "private";
  /** Seconds the browser may serve from its own cache. */
  maxAge: number;
  /** Seconds the CDN (Cloudflare) may serve from its cache. `public` scope only. */
  sMaxAge?: number;
  /** Seconds the cache may serve a stale copy while revalidating. */
  swr?: number;
}

export function withCacheHeaders(c: Context, opts: CacheHeaderOptions): void {
  const parts: string[] = [opts.scope, `max-age=${opts.maxAge}`];
  if (opts.scope === "public" && opts.sMaxAge !== undefined) {
    parts.push(`s-maxage=${opts.sMaxAge}`);
  }
  if (opts.swr !== undefined) {
    parts.push(`stale-while-revalidate=${opts.swr}`);
  }
  c.header("Cache-Control", parts.join(", "));
  // Per-user responses must vary on the auth header so a CDN
  // misconfiguration can't ever serve one user's data to another.
  if (opts.scope === "private") {
    c.header("Vary", "Authorization, Cookie");
  }
}
