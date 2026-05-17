// r2-delete.ts — small wrapper around the R2 binding for cascading deletes.
//
// Centralised so route handlers don't have to repeat the `globalThis.__ENV`
// dance, and so we get one place to swallow benign "missing object" cases
// without masking real failures.

function getR2Bucket(): R2Bucket | undefined {
  return (globalThis as any).__ENV?.VIDEO_BUCKET;
}

/**
 * Delete one or more keys from R2. Null/undefined entries are skipped (so
 * callers can pass DB column values straight through). Returns the count of
 * keys actually deleted.
 *
 * Logs but does not throw on per-key failure: a cascading delete should not
 * abort the parent DB mutation just because R2 is temporarily unhappy. The
 * admin orphan sweep will catch anything we leak.
 */
export async function deleteR2Keys(keys: ReadonlyArray<string | null | undefined>): Promise<number> {
  const bucket = getR2Bucket();
  if (!bucket) return 0;
  let deleted = 0;
  for (const k of keys) {
    if (!k) continue;
    try {
      await bucket.delete(k);
      deleted += 1;
    } catch (err) {
      console.warn(`[r2-delete] failed to delete ${k}:`, err);
    }
  }
  return deleted;
}
