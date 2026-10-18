/** Host-scoped slot-grid cache version token (bookings). */

import type { BookingHostIdentity } from "../../repositories/bookingsRepository.js";
import { bumpCacheVersion, getCacheVersion } from "../../utils/edge-cache.js";

function versionNamespace(userId: string): string {
  return `bookings:${userId}`;
}

/** Single seam for host-side cache invalidation. Bumps the host's
 *  version token so every cached slot-grid key for that host becomes
 *  unreachable on the next read. Cheap (≤ one KV put per 30s — coalesced). */
export function invalidateHostCaches(host: BookingHostIdentity): void {
  bumpCacheVersion(versionNamespace(host.userId));
}

export function getHostCacheVersion(userId: string): Promise<string> {
  // Shared version-token primitive (KV, L1-cached ~30s): a write in this
  // isolate orphans its slot windows at once; other isolates within ~30s.
  return getCacheVersion(versionNamespace(userId));
}
