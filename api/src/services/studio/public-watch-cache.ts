/**
 * Cache for `GET /api/studio/public/:videoId` (the `/v/:id` watch payload).
 *
 * Every public view used to hit Neon for the project/video reads, the
 * timeline CTA-hotzone extract, and `findProjectCampaignUtm`. The whole
 * payload now goes through the two-layer edge cache, keyed by the request
 * video id (project UUID / slug / youtube id / videos.id) plus a version
 * token. Writers bump every known alias of the project so a save-draft,
 * publish, NLE PATCH, visibility flip, render, or campaign-membership
 * edit orphans the cached payload on the next read.
 *
 * The version namespace is the lookup id itself: we do not know the
 * project UUID until after the (now-cached) resolve, so each alias carries
 * its own token and mutations bump all of them. TTL is a backstop for a
 * writer that misses the bump.
 */
import { bumpCacheVersion, getCacheVersion, getOrSetCached } from "../../utils/edge-cache.js";

/** L2 TTL — short; invalidation is the primary freshness mechanism. */
export const PUBLIC_WATCH_TTL_SECONDS = 120;

function namespace(videoId: string): string {
  return `studio:public-watch:${videoId}`;
}

/** The cached watch payload for a lookup id; `loader` runs on a miss.
 *  `shouldCache` false keeps an answer out of the cache (the "pending"
 *  placeholder: publishing flips it, and a bump's KV write may not have
 *  landed when the owner's page refetches straight after). */
export async function getPublicWatchCached<T>(
  videoId: string,
  loader: () => Promise<T>,
  shouldCache?: (value: T) => boolean,
): Promise<T> {
  const version = await getCacheVersion(namespace(videoId));
  return getOrSetCached({
    key: `${namespace(videoId)}:v${version}`,
    ttlSeconds: PUBLIC_WATCH_TTL_SECONDS,
    loader,
    shouldCache,
  });
}

/**
 * Orphan cached watch payloads for these lookup ids (deduped;
 * fire-and-forget). Pass every alias the public route might have been
 * hit with: project id, slug, linked `videos.id`, youtube id.
 */
export function bumpPublicWatchCache(...ids: Array<string | null | undefined>): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    bumpCacheVersion(namespace(id));
  }
}
