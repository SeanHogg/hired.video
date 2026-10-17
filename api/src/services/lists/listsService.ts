/**
 * ListsService — reusable polymorphic Lists (people / jobs / résumés /
 * companies / pipeline entries / courses / voice clones). Lightweight
 * bookmarks distinct from the recruiter CRM lists.
 *
 * Use cases return plain data and throw DomainError; visibility/mutation
 * rules live in ./listAccess.ts, wishlist cache busting in ./wishlistCache.ts.
 */
import type { ListItemEntityType } from "../../db/schema/lists.js";
import { DomainError } from "../../domains/errors.js";
import { listEntityExists } from "../../repositories/listEntitiesRepository.js";
import {
  countItemsByList,
  deleteItemByEntity,
  deleteItemInList,
  deleteList as deleteListRow,
  findActiveCompanyIdsForUser,
  findCompanyNamesByIds,
  findCompanyOwnerId,
  findItemByEntity,
  findItemsInList,
  findListById,
  findVisibleLists,
  insertItem,
  insertList,
  touchList,
  updateList as updateListRow,
  type ListItemRow,
  type ListPatch,
  type ListRow,
} from "../../repositories/listsRepository.js";
import { canMutateHint, isListVisibleTo, loadMutableList } from "./listAccess.js";
import { invalidateWishlistCachesForList } from "./wishlistCache.js";

/** Throw 404 `<type> not found` unless the polymorphic target exists. */
export async function assertListEntityExists(entityType: ListItemEntityType, entityId: string): Promise<void> {
  if (!(await listEntityExists(entityType, entityId))) {
    throw new DomainError(404, "NOT_FOUND", `${entityType} not found`);
  }
}

/**
 * Lists the caller can see (own + team lists of their companies), annotated
 * with item counts (optionally for one entity type) and a `canMutate` hint,
 * plus the companies they can scope NEW lists to (always returned so the
 * create dialog can render its visibility selector; empty for job seekers).
 */
export async function getVisibleListsOverview(userId: string, entityType: ListItemEntityType | null) {
  const companyIds = await findActiveCompanyIdsForUser(userId);
  const visible = await findVisibleLists(userId, companyIds);
  const companies = await findCompanyNamesByIds(companyIds);

  if (visible.length === 0) return { lists: [], companies };

  const countByList = await countItemsByList(
    visible.map((l) => l.id),
    entityType,
  );
  const lists = visible.map((l) => ({
    ...l,
    itemCount: countByList.get(l.id) ?? 0,
    canMutate: canMutateHint(userId, l),
  }));
  return { lists, companies };
}

export async function createList(
  userId: string,
  input: { title: string; isPrivate: boolean; companyId?: string | null },
): Promise<ListRow> {
  const companyId = input.companyId ?? null;
  if (companyId) {
    const companyIds = await findActiveCompanyIdsForUser(userId);
    const isOwner = (await findCompanyOwnerId(companyId)) === userId;
    if (!isOwner && !companyIds.includes(companyId)) {
      throw new DomainError(403, "FORBIDDEN", "You don't belong to that company");
    }
  }
  return insertList({
    ownerUserId: userId,
    companyId,
    title: input.title.trim(),
    // Personal lists are always private (no team to share with).
    isPrivate: companyId ? input.isPrivate : true,
  });
}

export async function updateList(
  userId: string,
  listId: string,
  input: { title?: string; isPrivate?: boolean },
): Promise<ListRow> {
  const list = await loadMutableList(userId, listId, "You can't edit this list");
  const patch: ListPatch = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title.trim();
  // Personal lists can't be made non-private (no team to share with).
  if (input.isPrivate !== undefined) patch.isPrivate = list.companyId ? input.isPrivate : true;
  return updateListRow(list.id, patch);
}

export async function deleteList(userId: string, listId: string): Promise<{ deleted: true }> {
  const list = await loadMutableList(userId, listId, "You can't delete this list");
  await deleteListRow(list.id);
  invalidateWishlistCachesForList(list);
  return { deleted: true };
}

/** Items in a visible list, optionally scoped to one entity type. */
export async function getListItems(
  userId: string,
  listId: string,
  entityType: ListItemEntityType | null,
): Promise<{ list: ListRow; items: ListItemRow[] }> {
  const companyIds = await findActiveCompanyIdsForUser(userId);
  const list = await findListById(listId);
  if (!list || !isListVisibleTo(userId, list, companyIds)) {
    throw new DomainError(404, "NOT_FOUND", "List not found");
  }
  const items = await findItemsInList(list.id, entityType);
  return { list, items };
}

/**
 * Idempotent add — returns the existing row (`alreadyPresent: true`) instead
 * of erroring when the entity is already in the list.
 */
export async function addListItem(
  userId: string,
  listId: string,
  input: { entityType: ListItemEntityType; entityId: string; notes?: string },
): Promise<{ item: ListItemRow; alreadyPresent: boolean }> {
  const list = await loadMutableList(userId, listId, "You can't add to this list");
  await assertListEntityExists(input.entityType, input.entityId);

  const existing = await findItemByEntity(list.id, input.entityType, input.entityId);
  if (existing) return { item: existing, alreadyPresent: true };

  const item = await insertItem({
    listId: list.id,
    entityType: input.entityType,
    entityId: input.entityId,
    addedByUserId: userId,
    notes: input.notes ?? null,
  });
  // Touch the list so it sorts to the top of the user's nav.
  await touchList(list.id);
  invalidateWishlistCachesForList(list, input.entityType);
  return { item, alreadyPresent: false };
}

/** Remove by `list_items.id`. */
export async function removeListItem(userId: string, listId: string, itemId: string): Promise<{ deleted: true }> {
  const list = await loadMutableList(userId, listId, "You can't modify this list");
  await deleteItemInList(list.id, itemId);
  invalidateWishlistCachesForList(list);
  return { deleted: true };
}

/** Remove by (entityType, entityId) — the UI knows the entity, not the row id. */
export async function removeListEntity(
  userId: string,
  listId: string,
  entityType: ListItemEntityType,
  entityId: string,
): Promise<{ deleted: true }> {
  const list = await loadMutableList(userId, listId, "You can't modify this list");
  await deleteItemByEntity(list.id, entityType, entityId);
  invalidateWishlistCachesForList(list, entityType);
  return { deleted: true };
}
