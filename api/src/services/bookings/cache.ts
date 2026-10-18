/** Host-scoped slot-grid cache version token (bookings). */

import type { BookingHostIdentity } from "../../repositories/bookingsRepository.js";
import { bumpCacheVersion, getCacheVersion } from "../../utils/edge-cache.js";

function versionNamespace(userId: string): string {
  return `bookings:${userId}`;
}

/** Single seam for host-side cache invalidation. Bumps the host's
 *  version token so every cached slot-grid key for that host becomes
 *  unreachable on the next read. Cheap (one KV delete). */
export function invalidateHostCaches(host: BookingHostIdentity): void {
  bumpCacheVersion(versionNamespace(host.userId));
}

export function getHostCacheVersion(userId: string): Promise<string> {
  // Shared version-token primitive: read from KV (never L1) so a write in
  // one isolate orphans cached slot windows in every isolate immediately.
  return getCacheVersion(versionNamespace(userId));
}
