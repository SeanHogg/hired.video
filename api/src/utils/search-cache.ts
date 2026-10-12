/**
 * Versioned read-through cache for the public unified-search surface
 * (`GET /api/search/public`).
 *
 * The search endpoint fans out ~10 parallel Neon-over-HTTP queries and
 * merges them in memory, so it is by far the most expensive public read
 * in the API. Every result it returns is anonymous + shared (no per-user
 * variation), which makes it an ideal cache target.
 *
 * WHY A VERSION TOKEN (and not plain key-purge):
 *   Search has effectively unbounded key cardinality — free-text query +
 *   geo + audience + employment/experience/salary filters. We can never
 *   enumerate every cached key to delete on write. Instead the cache key
 *   embeds a single global `searchVersion`. Any mutation to searchable
 *   content calls `bumpSearchVersion()`, which rewrites the token; every
 *   previously-cached key is instantly orphaned and the next request
 *   recomputes + re-caches under the new version. Orphaned entries fall
 *   out of KV on their own TTL. This is the "keep cached until new data
 *   is created, then re-cache on the next request" contract.
 *
 * Two cache layers come from the canonical `getOrSetCached` helper
 * (L1 in-isolate Map + L2 Cloudflare KV). The version token itself is
 * read straight from KV (no L1) so a cross-isolate bump is honoured on
 * the very next request rather than waiting out an isolate-local TTL.
 *
 * KV is eventually consistent across colos (~60s), so a bump in one
 * region can take up to ~60s to be observed globally; the payload TTL is
 * the backstop that bounds staleness even if a write path forgets to
 * bump.
 */

import { bumpCacheVersion, getCacheVersion, getOrSetCached } from "./edge-cache.js";

/** Payload TTL backstop (seconds). Explicit version bumps make new
 *  content appear immediately on write; this only bounds staleness for
 *  any mutation path that is not (yet) wired to `bumpSearchVersion`. */
export const SEARCH_CACHE_TTL_SECONDS = 120;

const SEARCH_NAMESPACE = "search";

/** Current global search-index version (shared version-token primitive). */
function getSearchVersion(): Promise<string> {
  return getCacheVersion(SEARCH_NAMESPACE);
}

/**
 * Invalidate the entire public search index.
 *
 * Call this from every mutation that could change what `/api/search/public`
 * returns — i.e. any create / update / publish / unpublish / delete of a
 * searchable entity (jobs, companies, public profiles, public resumes,
 * voice clones, studio templates, public videos, published articles,
 * public events, published courses). Fire-and-forget; never blocks or
 * throws into the caller's request path.
 */
export function bumpSearchVersion(): void {
  bumpCacheVersion(SEARCH_NAMESPACE);
}

/**
 * Read-through cache for a single search result set. `paramKey` must be a
 * stable, collision-free encoding of every query parameter that affects
 * the dataset (everything EXCEPT pagination — `page`/`limit` slice the
 * cached list and so must stay out of the key to keep one entry per
 * query serving all pages).
 */
export async function getCachedSearch<T>(
  paramKey: string,
  loader: () => Promise<T>,
): Promise<T> {
  const version = await getSearchVersion();
  return getOrSetCached({
    key: `search:v${version}:${paramKey}`,
    ttlSeconds: SEARCH_CACHE_TTL_SECONDS,
    loader,
  });
}
