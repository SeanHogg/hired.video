import { getEnv } from "./env.js";

/**
 * Constructs a public CDN URL for an R2 object key.
 *
 * Reads CDN_BASE_URL from env (set via wrangler.toml or `wrangler secret`).
 * Falls back to https://cdn.hired.video if unset.
 *
 * To configure: add `CDN_BASE_URL = "https://your-r2-public-domain.com"` to
 * [vars] in wrangler.toml, or run `wrangler secret put CDN_BASE_URL`.
 */
export function cdnUrl(key: string): string {
  // Already an absolute URL — return as-is to avoid doubling the base
  if (key.startsWith("http://") || key.startsWith("https://")) {
    return key;
  }
  const base = getEnv("CDN_BASE_URL") || "https://cdn.hired.video";
  // Strip trailing slash from base, leading slash from key
  const cleanBase = base.replace(/\/+$/, "");
  const cleanKey = key.replace(/^\/+/, "");
  return `${cleanBase}/${cleanKey}`;
}

/**
 * Inverse of cdnUrl — strips the CDN base from a URL so the bare R2 key
 * can be passed to deleteR2Keys() during cascading deletes. Returns null
 * if the input is empty or doesn't look like an R2-backed CDN URL on a
 * domain we recognise; the caller skips R2 deletion in that case.
 *
 * Recognises both the configured CDN base and the production fallback
 * (cdn.hired.video) so dev/staging callers still work when CDN_BASE_URL
 * is unset.
 */
export function r2KeyFromCdnUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    // Already a key — return as-is.
    return url.replace(/^\/+/, "") || null;
  }
  const candidates = [getEnv("CDN_BASE_URL"), "https://cdn.hired.video"].filter(Boolean);
  for (const base of candidates) {
    const cleanBase = base.replace(/\/+$/, "");
    if (url.startsWith(cleanBase + "/")) {
      return url.slice(cleanBase.length + 1) || null;
    }
  }
  return null;
}
