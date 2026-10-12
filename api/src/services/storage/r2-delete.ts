// r2-delete.ts — small wrapper around the R2 binding for cascading deletes.
//
// Centralised so route handlers don't have to repeat the `globalThis.__ENV`
// dance, and so we get one place to swallow benign "missing object" cases
// without masking real failures. Also the ONE place that purges the CDN
// edge-cache copy (worker.ts caches cdn.hired.video responses per colo), so
// a deleted object stops being served from this colo immediately; other
// colos expire their copy within the edge TTL (CDN_EDGE_TTL_SECONDS).

import { cdnUrl } from "../../utils/cdn.js";
import { getVideoBucket } from "./object-store.js";

/** R2 accepts up to 1000 keys per delete call. */
const R2_DELETE_BATCH = 1000;

async function purgeEdgeCopies(keys: string[]): Promise<void> {
  const edgeCache: Cache | undefined = (globalThis as any).caches?.default;
  if (!edgeCache) return;
  await Promise.all(keys.map((k) => edgeCache.delete(cdnUrl(k)).catch(() => false)));
}

/**
 * Delete one or more keys from R2. Null/undefined entries are skipped (so
 * callers can pass DB column values straight through). Returns the count of
 * keys actually deleted.
 *
 * Logs but does not throw on failure: a cascading delete should not abort
 * the parent DB mutation just because R2 is temporarily unhappy. The admin
 * orphan sweep will catch anything we leak.
 */
export async function deleteR2Keys(keys: ReadonlyArray<string | null | undefined>): Promise<number> {
  const bucket = getVideoBucket();
  if (!bucket) return 0;
  const present = keys.filter((k): k is string => !!k);
  let deleted = 0;
  for (let i = 0; i < present.length; i += R2_DELETE_BATCH) {
    const batch = present.slice(i, i + R2_DELETE_BATCH);
    try {
      await bucket.delete(batch);
      deleted += batch.length;
    } catch (err) {
      console.warn(`[r2-delete] failed to delete ${batch.length} key(s):`, err);
    }
  }
  await purgeEdgeCopies(present);
  return deleted;
}
