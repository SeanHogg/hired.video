// reclaim-video-r2.ts — best-effort R2 blob reclamation for `videos` rows.
//
// Why this exists: `videos.userId references users(id) on delete cascade`, so a
// hard user-delete (admin spammer purge) drops the row and leaks the R2 blob.
// The same leak applies to any explicit per-video delete. Centralise the
// "which keys does a video own" decision here so both call sites stay in sync
// with the schema.
//
// Only `r2Key` is an R2-owned object today: `thumbnailUrl` is a full URL handed
// straight to clients (never run through cdnUrl), and youtube ids/urls point at
// off-platform storage. If the schema later gains a poster/thumbnail R2 *key*
// column, add it to `videoR2Keys` and the orphan registry in r2-keys.ts.

import { deleteR2Keys } from "./r2-delete.js";

/** A video row's R2-owned keys (the columns this app physically stores in R2). */
export interface VideoR2Owner {
  r2Key?: string | null;
}

/** The subset of `videos` columns whose values are R2 object keys. */
export function videoR2Keys(video: VideoR2Owner): Array<string | null | undefined> {
  return [video.r2Key];
}

/**
 * Reclaim the R2 blobs owned by one or more video rows. Idempotent and
 * best-effort: missing objects and per-key failures are swallowed by
 * `deleteR2Keys` so this can run before (or after) the DB mutation without
 * aborting it. Returns the count of keys actually deleted.
 */
export async function reclaimVideoR2(
  videos: ReadonlyArray<VideoR2Owner>,
): Promise<number> {
  const keys = videos.flatMap(videoR2Keys);
  if (keys.length === 0) return 0;
  return deleteR2Keys(keys);
}
