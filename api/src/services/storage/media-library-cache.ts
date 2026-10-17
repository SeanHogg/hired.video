// media-library-cache.ts — the per-user key prefix behind the cached media
// library (#950). Split out so the R2 write path (object-store.ts) can
// invalidate without importing the library read (which imports the bucket).
//
// Isolate-local (utils/isolate-cache.ts): a per-user cache must never cost a
// KV write on Workers Free. Other warm isolates converge within the TTL.

import { invalidateIsolatePrefix } from "../../utils/isolate-cache.js";

/** Every cached library page for this user starts with this prefix. */
export function mediaLibraryKeyPrefix(userId: string): string {
  return `media-library:${userId}:`;
}

/** Drop every cached library page for this user (this isolate). */
export function invalidateMediaLibrary(userId: string): void {
  invalidateIsolatePrefix(mediaLibraryKeyPrefix(userId));
}
