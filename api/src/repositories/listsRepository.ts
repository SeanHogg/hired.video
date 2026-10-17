/**
 * ListsRepository — the polymorphic `lists` / `list_items` aggregate plus the
 * company-membership lookups its visibility rules need.
 *
 * Pure data access: no visibility/permission decisions live here (those are
 * in services/lists/listAccess.ts). Every function returns plain rows.
 */
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type { List, ListItem, NewList, NewListItem } from "../db/schema/lists.js";

const { lists, listItems, userCompanyRoleAssociations, companyProfiles } = schema;

export type ListRow = List;
export type ListItemRow = ListItem;
export type ListPatch = Partial<Pick<NewList, "title" | "isPrivate" | "updatedAt">>;

// ─── Company membership ─────────────────────────────────────────────────────

/** Company ids the user is an ACTIVE member of. */
export async function findActiveCompanyIdsForUser(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ companyId: userCompanyRoleAssociations.companyId })
    .from(userCompanyRoleAssociations)
    .where(and(eq(userCompanyRoleAssociations.userId, userId), eq(userCompanyRoleAssociations.isActive, true)));
  return rows.map((r) => r.companyId).filter((id): id is string => Boolean(id));
}

export async function hasActiveCompanyMembership(userId: string, companyId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: userCompanyRoleAssociations.id })
    .from(userCompanyRoleAssociations)
    .where(
      and(
        eq(userCompanyRoleAssociations.userId, userId),
        eq(userCompanyRoleAssociations.companyId, companyId),
        eq(userCompanyRoleAssociations.isActive, true),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** `companyProfiles.ownerId` for one company, or null when absent. */
export async function findCompanyOwnerId(companyId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ ownerId: companyProfiles.ownerId })
    .from(companyProfiles)
    .where(eq(companyProfiles.id, companyId))
    .limit(1);
  return row?.ownerId ?? null;
}

export async function findCompanyNamesByIds(companyIds: string[]): Promise<Array<{ id: string; name: string }>> {
  if (companyIds.length === 0) return [];
  return getDb()
    .select({ id: companyProfiles.id, name: companyProfiles.name })
    .from(companyProfiles)
    .where(inArray(companyProfiles.id, companyIds));
}

// ─── Lists ──────────────────────────────────────────────────────────────────

/** Own lists + team-shared lists of any of `companyIds`, newest first. */
export async function findVisibleLists(userId: string, companyIds: string[]): Promise<ListRow[]> {
  const own = eq(lists.ownerUserId, userId);
  const team =
    companyIds.length > 0 ? and(inArray(lists.companyId, companyIds), eq(lists.isPrivate, false)) : undefined;
  return getDb()
    .select()
    .from(lists)
    .where(team ? or(own, team) : own)
    .orderBy(desc(lists.updatedAt));
}

export async function findListById(listId: string): Promise<ListRow | null> {
  const [row] = await getDb().select().from(lists).where(eq(lists.id, listId)).limit(1);
  return row ?? null;
}

/** The caller's single `kind = 'wishlist'` list, if any. */
export async function findWishlistByOwner(userId: string): Promise<ListRow | null> {
  const [row] = await getDb()
    .select()
    .from(lists)
    .where(and(eq(lists.ownerUserId, userId), eq(lists.kind, "wishlist")))
    .limit(1);
  return row ?? null;
}

export async function insertList(values: NewList): Promise<ListRow> {
  const [row] = await getDb().insert(lists).values(values).returning();
  return row;
}

export async function updateList(listId: string, patch: ListPatch): Promise<ListRow> {
  const [row] = await getDb().update(lists).set(patch).where(eq(lists.id, listId)).returning();
  return row;
}

/** Bump `updatedAt` so the list sorts to the top of the owner's nav. */
export async function touchList(listId: string): Promise<void> {
  await getDb().update(lists).set({ updatedAt: new Date() }).where(eq(lists.id, listId));
}

export async function deleteList(listId: string): Promise<void> {
  await getDb().delete(lists).where(eq(lists.id, listId));
}

// ─── List items ─────────────────────────────────────────────────────────────

/** Per-list item counts (optionally for one entity type). One GROUP BY. */
export async function countItemsByList(listIds: string[], entityType: string | null): Promise<Map<string, number>> {
  const where = entityType
    ? and(inArray(listItems.listId, listIds), eq(listItems.entityType, entityType))
    : inArray(listItems.listId, listIds);
  const rows = await getDb()
    .select({ listId: listItems.listId, count: sql<number>`count(*)::int` })
    .from(listItems)
    .where(where)
    .groupBy(listItems.listId);
  return new Map(rows.map((row) => [row.listId, Number(row.count)]));
}

export async function findItemsInList(listId: string, entityType: string | null): Promise<ListItemRow[]> {
  const base = eq(listItems.listId, listId);
  return getDb()
    .select()
    .from(listItems)
    .where(entityType ? and(base, eq(listItems.entityType, entityType)) : base)
    .orderBy(desc(listItems.addedAt));
}

export async function findEntityIdsInList(listId: string, entityType: string): Promise<string[]> {
  const rows = await getDb()
    .select({ entityId: listItems.entityId })
    .from(listItems)
    .where(and(eq(listItems.listId, listId), eq(listItems.entityType, entityType)));
  return rows.map((r) => r.entityId);
}

export async function findItemByEntity(listId: string, entityType: string, entityId: string): Promise<ListItemRow | null> {
  const [row] = await getDb()
    .select()
    .from(listItems)
    .where(and(eq(listItems.listId, listId), eq(listItems.entityType, entityType), eq(listItems.entityId, entityId)))
    .limit(1);
  return row ?? null;
}

export async function insertItem(values: NewListItem): Promise<ListItemRow> {
  const [row] = await getDb().insert(listItems).values(values).returning();
  return row;
}

/** Insert relying on the (list, type, entity) unique index to swallow races. */
export async function insertItemIgnoringConflict(values: NewListItem): Promise<void> {
  await getDb().insert(listItems).values(values).onConflictDoNothing();
}

export async function deleteItemById(itemId: string): Promise<void> {
  await getDb().delete(listItems).where(eq(listItems.id, itemId));
}

/** Delete by `list_items.id`, scoped to its list (no-op when it isn't there). */
export async function deleteItemInList(listId: string, itemId: string): Promise<void> {
  await getDb().delete(listItems).where(and(eq(listItems.id, itemId), eq(listItems.listId, listId)));
}

export async function deleteItemByEntity(listId: string, entityType: string, entityId: string): Promise<void> {
  await getDb()
    .delete(listItems)
    .where(and(eq(listItems.listId, listId), eq(listItems.entityType, entityType), eq(listItems.entityId, entityId)));
}
