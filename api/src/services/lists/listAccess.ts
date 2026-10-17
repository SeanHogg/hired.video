/**
 * List visibility + mutation rules — the ONE place that decides who can see
 * or change a polymorphic list.
 *
 *   • Personal lists (companyId = null) — visible only to the owner.
 *   • Team lists (companyId set, isPrivate = false) — visible to every
 *     active member of that company.
 *   • Owner-only lists scoped to a company (companyId set, isPrivate = true)
 *     — visible only to the owner.
 *
 * Mutations (rename / delete / add item / remove item): the owner always;
 * the company owner (`companyProfiles.ownerId`) for any list scoped to that
 * company; active members for team-shared lists.
 */
import { LIST_ITEM_ENTITY_TYPES, type ListItemEntityType } from "../../db/schema/lists.js";
import { DomainError } from "../../domains/errors.js";
import {
  findCompanyOwnerId,
  findListById,
  hasActiveCompanyMembership,
  type ListRow,
} from "../../repositories/listsRepository.js";

export { LIST_ITEM_ENTITY_TYPES, type ListItemEntityType };

type ListAccessShape = Pick<ListRow, "ownerUserId" | "companyId" | "isPrivate">;

export function isListItemEntityType(value: unknown): value is ListItemEntityType {
  return typeof value === "string" && (LIST_ITEM_ENTITY_TYPES as readonly string[]).includes(value);
}

/** Whether `userId` can see `list`, given the companies they actively belong to. */
export function isListVisibleTo(userId: string, list: ListAccessShape, companyIds: string[]): boolean {
  if (list.ownerUserId === userId) return true;
  return Boolean(list.companyId && !list.isPrivate && companyIds.includes(list.companyId));
}

/** The cheap `canMutate` hint shown on visible-list rows (no extra queries). */
export function canMutateHint(userId: string, list: ListAccessShape): boolean {
  return list.ownerUserId === userId || Boolean(list.companyId && !list.isPrivate);
}

/** Whether `userId` can MUTATE `list` (rename, delete, add/remove items). */
export async function canMutateList(userId: string, list: ListAccessShape): Promise<boolean> {
  if (list.ownerUserId === userId) return true;
  if (!list.companyId) return false; // personal — only owner can touch
  if ((await findCompanyOwnerId(list.companyId)) === userId) return true;
  // Company member check (only relevant for team-shared lists)
  if (list.isPrivate) return false;
  return hasActiveCompanyMembership(userId, list.companyId);
}

/**
 * Load a list the caller is about to mutate. Throws 404 when it doesn't
 * exist and 403 (with the action-specific `forbiddenMessage`) when the caller
 * can't change it.
 */
export async function loadMutableList(userId: string, listId: string, forbiddenMessage: string): Promise<ListRow> {
  const list = await findListById(listId);
  if (!list) throw new DomainError(404, "NOT_FOUND", "List not found");
  if (!(await canMutateList(userId, list))) throw new DomainError(403, "FORBIDDEN", forbiddenMessage);
  return list;
}
