/**
 * Wishlist read caches (in-isolate, 120s read-through per user × entity type —
 * per-user keys stay off KV on Workers Free)
 * and their invalidation. Every write to a list's items — through the generic
 * list endpoints or the wishlist toggle — busts these via this module.
 */
import { LIST_ITEM_ENTITY_TYPES } from "../../db/schema/lists.js";
import { invalidateIsolateKey } from "../../utils/isolate-cache.js";

export const WISHLIST_CACHE_TTL_SECONDS = 120;

export function wishlistIdsCacheKey(userId: string, entityType: string): string {
  return `wishlist:ids:${userId}:${entityType}`;
}

export function wishlistEnrichedCacheKey(userId: string, entityType: string): string {
  return `wishlist:enriched:${userId}:${entityType}`;
}

/** Bust both wishlist caches for one (user, entity type). */
export function invalidateWishlistCaches(userId: string, entityType: string): void {
  invalidateIsolateKey(wishlistIdsCacheKey(userId, entityType));
  invalidateIsolateKey(wishlistEnrichedCacheKey(userId, entityType));
}

/** Bust the wishlist read caches after ANY write to a list's items (or the
 *  list itself). No-op unless `list` is a wishlist. Pass `entityType` when
 *  the write touched one known type; omit it (e.g. delete-by-item-id, list
 *  delete) to bust every type. */
export function invalidateWishlistCachesForList(
  list: { kind: string | null; ownerUserId: string | null },
  entityType?: string,
): void {
  if (list.kind !== "wishlist" || !list.ownerUserId) return;
  const types = entityType ? [entityType] : (LIST_ITEM_ENTITY_TYPES as readonly string[]);
  for (const t of types) invalidateWishlistCaches(list.ownerUserId, t);
}
