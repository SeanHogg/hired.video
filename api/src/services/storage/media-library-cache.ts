// media-library-cache.ts — the per-user version token behind the cached
// media library (#950). Split out so the R2 write path (object-store.ts) can
// invalidate without importing the library read (which imports the bucket).

import { bumpCacheVersion, getCacheVersion } from "../../utils/edge-cache.js";

export function mediaLibraryNamespace(userId: string): string {
  return `media-library:${userId}`;
}

/** Orphan every cached library page for this user. Fire-and-forget. */
export function invalidateMediaLibrary(userId: string): void {
  bumpCacheVersion(mediaLibraryNamespace(userId));
}

export function mediaLibraryVersion(userId: string): Promise<string> {
  return getCacheVersion(mediaLibraryNamespace(userId));
}
