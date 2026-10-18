/**
 * Cache for `GET /api/studio/public/:videoId` (the `/v/:id` watch payload).
 *
 * Every public view used to hit Neon for the project/video reads, the
 * timeline CTA-hotzone extract, and `findProjectCampaignUtm`. The whole
 * payload is now cached, keyed by the request video id (project UUID /
 * slug / youtube id / videos.id). Writers bump every known alias of the
 * project so a save-draft, publish, NLE PATCH, visibility flip, render, or
 * campaign-membership edit drops the cached payload on the next read.
 *
 * Isolate-only (utils/isolate-cache.ts): one entry per alias (unbounded),
 * and save-draft / NLE PATCH bump on every autosave — a KV fill per miss
 * plus a KV version-token write per alias per save would burn the Workers
 * Free write quota the scheduler's work markers depend on. A bump clears
 * the writer's isolate at once; other isolates converge within the
 * (short) TTL. We do not know the project UUID until after the resolve,
 * so each alias is its own key and mutations bump all of them.
 */
import { getOrSetIsolateCached, invalidateIsolateKey } from "../../utils/isolate-cache.js";

/** Short: a bump clears the writer's isolate; this bounds the others (an
 *  unpublish must stop serving promptly everywhere). */
export const PUBLIC_WATCH_TTL_SECONDS = 60;

function namespace(videoId: string): string {
  return `studio:public-watch:${videoId}`;
}

/** The cached watch payload for a lookup id; `loader` runs on a miss.
 *  `shouldCache` false keeps an answer out of the cache (the "pending"
 *  placeholder: publishing flips it, and the owner's page may refetch
 *  straight after from another isolate). */
export function getPublicWatchCached<T>(
  videoId: string,
  loader: () => Promise<T>,
  shouldCache?: (value: T) => boolean,
): Promise<T> {
  return getOrSetIsolateCached({
    key: namespace(videoId),
    ttlSeconds: PUBLIC_WATCH_TTL_SECONDS,
    loader,
    shouldCache,
  });
}

/**
 * Drop cached watch payloads for these lookup ids (deduped; this
 * isolate; fire-and-forget). Pass every alias the public route might have been
 * hit with: project id, slug, linked `videos.id`, youtube id.
 */
export function bumpPublicWatchCache(...ids: Array<string | null | undefined>): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    invalidateIsolateKey(namespace(id));
  }
}
