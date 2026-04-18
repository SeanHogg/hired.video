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
  const base =
    (globalThis as any).__ENV?.CDN_BASE_URL ||
    process?.env?.CDN_BASE_URL ||
    "https://cdn.hired.video";
  // Strip trailing slash from base, leading slash from key
  const cleanBase = base.replace(/\/+$/, "");
  const cleanKey = key.replace(/^\/+/, "");
  return `${cleanBase}/${cleanKey}`;
}
