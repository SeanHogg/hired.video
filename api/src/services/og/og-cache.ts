import { getOrSetIsolateCached } from "../../utils/isolate-cache.js";

/** Crawler/social-preview lookups are hot (every share scrape + every
 *  crawler page view) and slow-changing, so each entity lookup / meta
 *  payload is cached for 5 minutes (TTL-only — a stale share card for
 *  ≤5 min is acceptable). The keyspace is one key per entity (unbounded),
 *  so it lives in the ISOLATE cache: a KV write per miss would burn the
 *  Workers Free write quota. A null (crawler 404 on an unknown id) is
 *  cached too, so repeat 404s don't each hit Neon. Values MUST stay
 *  JSON-safe (no Date objects): meta endpoints cache their final JSON
 *  body, image endpoints cache the Date-free DB row they render from. */
const OG_CACHE_TTL_SECONDS = 300;

export function ogCached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  return getOrSetIsolateCached({ key: `og:v1:${key}`, ttlSeconds: OG_CACHE_TTL_SECONDS, loader });
}
