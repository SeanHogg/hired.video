/**
 * PaidMediaAccountsRepository — table access for `paid_media_accounts`
 * (the ad accounts discovered under an ads provider connection).
 *
 * Ownership is workspace-shaped: personal rows are (userId, companyId NULL),
 * company rows carry companyId. `ownedBy()` is the ONE predicate for "rows a
 * set of personal owners + companies may see", reused by the insights read.
 */

import { and, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";

const { paidMediaAccounts } = schema;

export type DbLike = any;
export type PaidMediaAccountRow = typeof paidMediaAccounts.$inferSelect;

export interface PaidMediaAccountOwner {
  id: string;
  userId: string;
  companyId: string | null;
}

/** Personal rows of `userIds` plus every row of `companyIds`. */
export function paidMediaAccountsOwnedBy(userIds: string[], companyIds: string[]): SQL | undefined {
  return or(
    and(inArray(paidMediaAccounts.userId, userIds), isNull(paidMediaAccounts.companyId)),
    companyIds.length ? inArray(paidMediaAccounts.companyId, companyIds) : undefined,
  );
}

export interface IPaidMediaAccountsRepository {
  listOwnedBy(userIds: string[], companyIds: string[]): Promise<PaidMediaAccountRow[]>;
  findOwner(id: string): Promise<PaidMediaAccountOwner | null>;
}

export class PaidMediaAccountsRepository implements IPaidMediaAccountsRepository {
  constructor(private readonly db: DbLike) {}

  async listOwnedBy(userIds: string[], companyIds: string[]): Promise<PaidMediaAccountRow[]> {
    return this.db.select().from(paidMediaAccounts).where(paidMediaAccountsOwnedBy(userIds, companyIds));
  }

  async findOwner(id: string): Promise<PaidMediaAccountOwner | null> {
    const [row] = await this.db
      .select({ id: paidMediaAccounts.id, userId: paidMediaAccounts.userId, companyId: paidMediaAccounts.companyId })
      .from(paidMediaAccounts)
      .where(eq(paidMediaAccounts.id, id))
      .limit(1);
    return row ?? null;
  }
}
