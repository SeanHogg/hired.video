/**
 * ExternalEmailAccountsRepository — connected mailboxes (Gmail, Outlook).
 *
 * Encryption is service-layer concern: the repo stores whatever's in
 * `oauthRefreshTokenEnc` verbatim. Callers (oauth.ts, sync.ts) handle
 * the encrypt/decrypt step.
 */

import { and, eq, isNotNull } from "drizzle-orm";
import { schema } from "../db/index.js";

const { externalEmailAccounts } = schema;

export type DbLike = any;

export type ExternalEmailAccountRow = typeof externalEmailAccounts.$inferSelect;
export type ExternalEmailAccountInsert = typeof externalEmailAccounts.$inferInsert;
export type ExternalEmailAccountPatch = Partial<ExternalEmailAccountInsert>;

export interface IExternalEmailAccountsRepository {
  findActiveForUser(userId: string): Promise<ExternalEmailAccountRow[]>;
  findAllForUser(userId: string): Promise<ExternalEmailAccountRow[]>;
  findById(id: string, userId: string): Promise<ExternalEmailAccountRow | null>;
  findByProviderEmail(
    userId: string,
    provider: string,
    email: string,
  ): Promise<ExternalEmailAccountRow | null>;
  upsert(input: ExternalEmailAccountInsert): Promise<ExternalEmailAccountRow>;
  patch(id: string, userId: string, patch: ExternalEmailAccountPatch): Promise<void>;
  remove(id: string, userId: string): Promise<void>;
  /** Used by the sync worker to find accounts that have been quiet for
   *  longer than the requested cadence. */
  findDueForSync(maxLastSyncedAt: Date): Promise<ExternalEmailAccountRow[]>;
}

export class ExternalEmailAccountsRepository implements IExternalEmailAccountsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findActiveForUser(userId: string): Promise<ExternalEmailAccountRow[]> {
    return (await this.db
      .select()
      .from(externalEmailAccounts)
      .where(and(eq(externalEmailAccounts.userId, userId), eq(externalEmailAccounts.status, "active")))) as ExternalEmailAccountRow[];
  }

  async findAllForUser(userId: string): Promise<ExternalEmailAccountRow[]> {
    return (await this.db
      .select()
      .from(externalEmailAccounts)
      .where(eq(externalEmailAccounts.userId, userId))) as ExternalEmailAccountRow[];
  }

  async findById(id: string, userId: string): Promise<ExternalEmailAccountRow | null> {
    const rows = (await this.db
      .select()
      .from(externalEmailAccounts)
      .where(and(eq(externalEmailAccounts.id, id), eq(externalEmailAccounts.userId, userId)))
      .limit(1)) as ExternalEmailAccountRow[];
    return rows[0] ?? null;
  }

  async findByProviderEmail(
    userId: string,
    provider: string,
    email: string,
  ): Promise<ExternalEmailAccountRow | null> {
    const rows = (await this.db
      .select()
      .from(externalEmailAccounts)
      .where(
        and(
          eq(externalEmailAccounts.userId, userId),
          eq(externalEmailAccounts.provider, provider),
          eq(externalEmailAccounts.accountEmail, email),
        ),
      )
      .limit(1)) as ExternalEmailAccountRow[];
    return rows[0] ?? null;
  }

  async upsert(input: ExternalEmailAccountInsert): Promise<ExternalEmailAccountRow> {
    // Look up first — drizzle's onConflictDoUpdate on the unique
    // (user_id, provider, account_email) is fine but the surrounding
    // service wants the row back regardless of insert vs update.
    const existing = input.userId && input.provider && input.accountEmail
      ? await this.findByProviderEmail(input.userId, input.provider, input.accountEmail)
      : null;
    if (existing) {
      await this.db
        .update(externalEmailAccounts)
        .set({ ...input, updatedAt: this.now() } as any)
        .where(eq(externalEmailAccounts.id, existing.id));
      return { ...existing, ...(input as any), updatedAt: this.now() };
    }
    const [row] = await this.db.insert(externalEmailAccounts).values(input as any).returning();
    return row as ExternalEmailAccountRow;
  }

  async patch(id: string, userId: string, patch: ExternalEmailAccountPatch): Promise<void> {
    await this.db
      .update(externalEmailAccounts)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(and(eq(externalEmailAccounts.id, id), eq(externalEmailAccounts.userId, userId)));
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.db
      .delete(externalEmailAccounts)
      .where(and(eq(externalEmailAccounts.id, id), eq(externalEmailAccounts.userId, userId)));
  }

  async findDueForSync(maxLastSyncedAt: Date): Promise<ExternalEmailAccountRow[]> {
    const rows = (await this.db
      .select()
      .from(externalEmailAccounts)
      .where(
        and(
          eq(externalEmailAccounts.status, "active"),
          isNotNull(externalEmailAccounts.oauthRefreshTokenEnc),
        ),
      )) as ExternalEmailAccountRow[];
    // Filter in JS because the OR-style "null lastSyncedAt OR < threshold"
    // is awkward in drizzle and the row count is bounded by user count.
    return rows.filter((r) => !r.lastSyncedAt || r.lastSyncedAt < maxLastSyncedAt);
  }
}
