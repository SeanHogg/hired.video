/**
 * Invalidation half of the inbox cache (inboxCache.ts), split out so
 * repositories can invalidate without importing the read side.
 *
 * The inbox cache is isolate-local (utils/isolate-cache.ts — no KV writes;
 * the account is on Workers Free), so invalidation clears this isolate's
 * copies; other isolates converge within INBOX_CACHE_TTL_SECONDS.
 */
import { invalidateIsolateKey } from "../../utils/isolate-cache.js";

export const inboxCacheKey = (userId: string) => `inbox:v1:${userId}`;
export const unreadCountCacheKey = (userId: string) => `notif-unread:v1:${userId}`;

/** Drop the cached inbox + unread count for these users. Never throws. */
export function bumpInboxFor(userIds: Iterable<string | null | undefined>): void {
  for (const id of new Set(userIds)) {
    if (!id) continue;
    invalidateIsolateKey(inboxCacheKey(id));
    invalidateIsolateKey(unreadCountCacheKey(id));
  }
}
