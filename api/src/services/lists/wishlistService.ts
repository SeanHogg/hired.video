/**
 * WishlistService — the one canonical per-user heart list.
 *
 * A wishlist is just a `lists` row with kind = 'wishlist'; this is a thin
 * facade over the generic list-items machinery so cards/detail pages get a
 * one-tap heart toggle without knowing the list id. The partial unique index
 * (migration 0198) guarantees one per owner, so get-or-create is race-safe
 * (the loser's INSERT trips the index → re-select).
 *
 * Reads are isolate-cached per (user, type) — see ./wishlistCache.ts.
 */
import type { ListItemEntityType } from "../../db/schema/lists.js";
import {
  findCourseItemsWithAuthors,
  findVoiceCloneItems,
} from "../../repositories/listEntitiesRepository.js";
import {
  deleteItemById,
  findEntityIdsInList,
  findItemByEntity,
  findWishlistByOwner,
  insertItemIgnoringConflict,
  insertList,
  touchList,
  type ListRow,
} from "../../repositories/listsRepository.js";
import { getOrSetIsolateCached } from "../../utils/isolate-cache.js";
import { assertListEntityExists } from "./listsService.js";
import {
  invalidateWishlistCaches,
  WISHLIST_CACHE_TTL_SECONDS,
  wishlistEnrichedCacheKey,
  wishlistIdsCacheKey,
} from "./wishlistCache.js";

// Entity types that have a server-side enricher (→ a marketplace card). The
// `/wishlist/enriched` endpoint refuses others so the page never renders a
// half-hydrated tab. Adding a type = add a case in `enrichWishlist`.
export const WISHLIST_ENRICHABLE_TYPES = ["course", "voice_clone"] as const;
export type WishlistEnrichableType = (typeof WISHLIST_ENRICHABLE_TYPES)[number];

export function isWishlistEnrichableType(value: unknown): value is WishlistEnrichableType {
  return typeof value === "string" && (WISHLIST_ENRICHABLE_TYPES as readonly string[]).includes(value);
}

async function getOrCreateWishlist(userId: string): Promise<ListRow> {
  const existing = await findWishlistByOwner(userId);
  if (existing) return existing;
  try {
    return await insertList({
      ownerUserId: userId,
      companyId: null,
      title: "Wishlist",
      isPrivate: true,
      kind: "wishlist",
    });
  } catch {
    // Lost a create race — the unique index rejected us. Re-read the winner.
    const row = await findWishlistByOwner(userId);
    if (!row) throw new Error("Failed to create wishlist");
    return row;
  }
}

/** Add/remove an entity from the caller's wishlist; returns the new state. */
export async function toggleWishlist(
  userId: string,
  entityType: ListItemEntityType,
  entityId: string,
): Promise<{ wishlisted: boolean }> {
  await assertListEntityExists(entityType, entityId);
  const wishlist = await getOrCreateWishlist(userId);

  const present = await findItemByEntity(wishlist.id, entityType, entityId);
  let wishlisted: boolean;
  if (present) {
    await deleteItemById(present.id);
    wishlisted = false;
  } else {
    await insertItemIgnoringConflict({ listId: wishlist.id, entityType, entityId, addedByUserId: userId });
    wishlisted = true;
  }
  await touchList(wishlist.id);

  invalidateWishlistCaches(userId, entityType);
  return { wishlisted };
}

/** Wishlisted entity ids for one type (cached read-through). */
export function getWishlistIds(userId: string, entityType: ListItemEntityType): Promise<string[]> {
  return getOrSetIsolateCached<string[]>({
    key: wishlistIdsCacheKey(userId, entityType),
    ttlSeconds: WISHLIST_CACHE_TTL_SECONDS,
    loader: async () => {
      const wishlist = await findWishlistByOwner(userId);
      if (!wishlist) return [];
      return findEntityIdsInList(wishlist.id, entityType);
    },
  });
}

/** Wishlisted items of one type enriched into marketplace-card shape (cached). */
export function getEnrichedWishlist(userId: string, entityType: WishlistEnrichableType): Promise<unknown[]> {
  return getOrSetIsolateCached<unknown[]>({
    key: wishlistEnrichedCacheKey(userId, entityType),
    ttlSeconds: WISHLIST_CACHE_TTL_SECONDS,
    loader: async () => {
      const wishlist = await findWishlistByOwner(userId);
      if (!wishlist) return [];
      return enrichWishlist(wishlist.id, entityType);
    },
  });
}

async function enrichWishlist(listId: string, entityType: WishlistEnrichableType): Promise<unknown[]> {
  if (entityType === "course") {
    const rows = await findCourseItemsWithAuthors(listId);
    return rows.map((r) => ({
      id: r.course.id,
      type: "course" as const,
      title: r.course.title,
      slug: r.course.slug,
      summary: r.course.summary,
      coverImageUrl: r.course.coverImageUrl,
      category: r.course.category,
      tags: r.course.tags,
      difficulty: r.course.difficulty,
      estimatedMinutes: r.course.estimatedMinutes,
      priceCents: r.course.priceVisible ? r.course.priceCents : null,
      issuesCertificate: r.course.issuesCertificate,
      enrollmentCount: r.course.enrollmentCount,
      averageRating: r.course.averageRating,
      ratingCount: r.course.ratingCount,
      publishedAt: r.course.publishedAt,
      author: {
        id: r.author.id,
        name: r.author.name,
        avatarUrl: r.authorProfile?.avatarUrl ?? null,
        slug: r.authorProfile?.customUrlSlug ?? r.author.id,
      },
    }));
  }
  // voice_clone → VoiceMarketplaceCardItem shape.
  const rows = await findVoiceCloneItems(listId);
  return rows.map((r) => ({
    id: r.clone.id,
    voiceCloneId: r.clone.id,
    name: r.clone.name,
    summary: r.clone.description ?? undefined,
    previewAudioUrl: r.clone.previewAudioUrl,
    priceCents: r.clone.priceCents,
    currency: r.clone.currency,
    language: r.clone.language,
    gender: r.clone.gender,
    accent: r.clone.accent,
    creatorId: r.clone.userId,
    purchaseCount: r.clone.purchaseCount,
  }));
}
