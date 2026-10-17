import { getOrSetCached } from "../../utils/edge-cache.js";

/** Crawler/social-preview lookups are hot (every share scrape + every
 *  crawler page view) and slow-changing, so each entity lookup / meta
 *  payload is edge-cached for 5 minutes (TTL-only — a stale share card
 *  for ≤5 min is acceptable). Values MUST be JSON-safe (no Date objects):
 *  meta endpoints cache their final JSON body, image endpoints cache the
 *  Date-free DB row they render from. */
const OG_CACHE_TTL_SECONDS = 300;

export function ogCached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  return getOrSetCached({ key: `og:v1:${key}`, ttlSeconds: OG_CACHE_TTL_SECONDS, loader });
}
