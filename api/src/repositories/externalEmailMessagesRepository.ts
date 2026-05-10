/**
 * ExternalEmailMessagesRepository — synced inbox messages from connected mailboxes.
 *
 * The inbox aggregator (services/messaging/inboxService.ts) reads recent
 * non-archived messages here for its fourth source. The dedicated repo joins
 * `external_email_accounts` so each row carries the user-chosen `accountLabel`
 * and provider for badge rendering without an extra round-trip.
 */

import { and, desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const { externalEmailMessages, externalEmailAccounts } = schema;

export type DbLike = any;

export type ExternalEmailMessageRow = typeof externalEmailMessages.$inferSelect;
export type ExternalEmailMessageInsert = typeof externalEmailMessages.$inferInsert;

/** Read-side projection used by the inbox aggregator. The plain message row
 *  doesn't carry the human-readable account label, so this view joins it in. */
export interface ExternalEmailInboxRow extends ExternalEmailMessageRow {
  accountLabel: string | null;
  accountEmail: string;
}

export interface IExternalEmailMessagesRepository {
  findRecentForUser(userId: string, limit?: number): Promise<ExternalEmailInboxRow[]>;
  markRead(id: string, userId: string): Promise<void>;
  markAllReadForUser(userId: string): Promise<void>;
  setArchived(id: string, userId: string, archived: boolean): Promise<void>;
}

export class ExternalEmailMessagesRepository implements IExternalEmailMessagesRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findRecentForUser(
    userId: string,
    limit = 50,
  ): Promise<ExternalEmailInboxRow[]> {
    const rows = (await this.db
      .select({
        message: externalEmailMessages,
        accountLabel: externalEmailAccounts.accountLabel,
        accountEmail: externalEmailAccounts.accountEmail,
      })
      .from(externalEmailMessages)
      .innerJoin(
        externalEmailAccounts,
        eq(externalEmailAccounts.id, externalEmailMessages.accountId),
      )
      .where(
        and(
          eq(externalEmailMessages.userId, userId),
          eq(externalEmailMessages.isArchived, false),
        ),
      )
      .orderBy(desc(externalEmailMessages.receivedAt))
      .limit(Math.min(200, Math.max(1, limit)))) as Array<{
      message: ExternalEmailMessageRow;
      accountLabel: string | null;
      accountEmail: string;
    }>;

    return rows.map((r) => ({
      ...r.message,
      accountLabel: r.accountLabel,
      accountEmail: r.accountEmail,
    }));
  }

  async markRead(id: string, userId: string): Promise<void> {
    await this.db
      .update(externalEmailMessages)
      .set({ isRead: true, updatedAt: this.now() } as any)
      .where(
        and(eq(externalEmailMessages.id, id), eq(externalEmailMessages.userId, userId)),
      );
  }

  async markAllReadForUser(userId: string): Promise<void> {
    await this.db
      .update(externalEmailMessages)
      .set({ isRead: true, updatedAt: this.now() } as any)
      .where(eq(externalEmailMessages.userId, userId));
  }

  async setArchived(id: string, userId: string, archived: boolean): Promise<void> {
    await this.db
      .update(externalEmailMessages)
      .set({ isArchived: archived, updatedAt: this.now() } as any)
      .where(
        and(eq(externalEmailMessages.id, id), eq(externalEmailMessages.userId, userId)),
      );
  }
}
