/**
 * Partner-domain registry — single source of truth for every domain
 * that legitimately points at the hired.video API.
 *
 * Why this exists: the API CORS allowlist used to be configured solely
 * via the `FRONTEND_URL` environment variable in wrangler.toml. Any
 * partner domain not in that comma-separated string got 403'd by the
 * Hono cors() middleware. The list silently drifted out of sync
 * whenever a new domain was added to DNS but not to the env var.
 *
 * Now: CORS reads from `expandPartnerOrigins()` AND merges in whatever
 * `FRONTEND_URL` provides (for env-specific staging / preview URLs).
 * Partner domains are committed to code; new partners get added here,
 * not via a wrangler-secrets dance.
 *
 * Both `https://X` and `https://www.X` variants are auto-expanded so
 * we don't have to remember to add both.
 */

export const PARTNER_DOMAINS: readonly string[] = [
  "hired.video",
  "connecttalent.today",
  "fixfasterllc.com",
  "freemiummedia.com",
  "hirefractionaltalent.com",
  "hireus.video",
  "incuprise.com",
  "mymetaresu.me",
  "mymetaresume.com",
  "myvideoresu.me",
  "reelresu.me",
] as const;

/**
 * Expand each domain into its canonical https origin AND the www
 * variant. Production never serves over http:// so we don't generate
 * those entries — that decision belongs to the dev-mode override in
 * the CORS handler, not here.
 */
export function expandPartnerOrigins(): string[] {
  const out: string[] = [];
  for (const d of PARTNER_DOMAINS) {
    out.push(`https://${d}`);
    out.push(`https://www.${d}`);
  }
  return out;
}
