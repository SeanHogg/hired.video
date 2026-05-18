/**
 * ExternalEmailMessagesRepository — synced inbox messages from connected mailboxes.
 *
 * The inbox aggregator (services/messaging/inboxService.ts) reads recent
 * non-archived messages here for its fourth source. The dedicated repo joins
 * `external_email_accounts` so each row carries the user-chosen `accountLabel`
 * and provider for badge rendering without an extra round-trip.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
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

/** Job-related categories — single source of truth for inbox visibility.
 *  Anything outside this set (newsletter / spam / personal / other) is
 *  kept in the table but hidden from the inbox feed. Mirrors the same
 *  set the sync orchestrator uses to decide whether to run dedup +
 *  auto-create. */
export const JOB_INBOX_CATEGORIES = [
  "job_opportunity",
  "application_status",
  "recruiter_outreach",
  "interview_invite",
  "offer",
  "rejection",
] as const;

/** Hard floor below which messages never reach the inbox regardless of
 *  per-account minJobScore — a safety net against a user dialing their
 *  threshold to 0 and getting flooded by LLM "low confidence" passes.
 *  Kept in lockstep with `classifyEmail()`'s 0.2 fallback. */
export const JOB_INBOX_HARD_FLOOR = "0.250";

export interface FindInboxOptions {
  limit?: number;
  /** When set, restrict to messages from these accountIds (user-scoped). */
  accountIds?: string[];
  /** When true, only unread messages. */
  unreadOnly?: boolean;
  /** When true, include archived/dismissed messages. Defaults false. */
  includeArchived?: boolean;
  /** When true, show ONLY messages classified as spam by a user "Mark
   *  as Junk" rule. Overrides the default job-only filter; junk emails
   *  are archived on insert so they would otherwise be invisible. The
   *  view exists so users can audit / restore false positives. */
  junkOnly?: boolean;
}

export interface IExternalEmailMessagesRepository {
  findRecentForUser(userId: string, limit?: number): Promise<ExternalEmailInboxRow[]>;
  findInboxForUser(userId: string, opts?: FindInboxOptions): Promise<ExternalEmailInboxRow[]>;
  findById(id: string, userId: string): Promise<ExternalEmailMessageRow | null>;
  findByIdWithAccount(id: string, userId: string): Promise<ExternalEmailInboxRow | null>;
  findByAccount(accountId: string): Promise<ExternalEmailMessageRow[]>;
  insert(input: ExternalEmailMessageInsert): Promise<ExternalEmailMessageRow>;
  patch(id: string, patch: Partial<ExternalEmailMessageInsert>): Promise<void>;
  markRead(id: string, userId: string): Promise<void>;
  markUnread(id: string, userId: string): Promise<void>;
  markAllReadForUser(userId: string): Promise<void>;
  setArchived(id: string, userId: string, archived: boolean): Promise<void>;
  setArchivedBulk(ids: string[], userId: string, archived: boolean): Promise<void>;
}

export class ExternalEmailMessagesRepository implements IExternalEmailMessagesRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findRecentForUser(
    userId: string,
    limit = 50,
  ): Promise<ExternalEmailInboxRow[]> {
    return this.findInboxForUser(userId, { limit });
  }

  async findInboxForUser(
    userId: string,
    opts: FindInboxOptions = {},
  ): Promise<ExternalEmailInboxRow[]> {
    const limit = opts.limit ?? 50;
    const conditions = [eq(externalEmailMessages.userId, userId)];
    if (opts.junkOnly) {
      // Junk view — bypass the job-only + score-floor gates so the
      // user can see what their Mark-as-Junk rules captured (and
      // restore false positives via the bulk-archive route with
      // archived:false).
      conditions.push(eq(externalEmailMessages.category, "spam"));
    } else {
      conditions.push(
        // Job-only filter — the inbox surface is for job-related mail.
        // Newsletters / spam / personal / "other" emails stay in the
        // table (so the classifier can revise later) but never reach the
        // inbox feed. Unclassified rows (still pending or LLM failure
        // fallback) are excluded too: there is no useful preview yet.
        inArray(externalEmailMessages.category, JOB_INBOX_CATEGORIES as unknown as string[]),
        // Per-account confidence floor. Joining on accounts means each
        // mailbox sets its own threshold (Inbox settings → "Minimum job
        // score"); the hard floor below catches a misconfigured 0.
        sql`${externalEmailMessages.score} >= ${externalEmailAccounts.minJobScore}`,
        sql`${externalEmailMessages.score} >= ${JOB_INBOX_HARD_FLOOR}::numeric`,
      );
    }
    if (!opts.includeArchived && !opts.junkOnly) {
      // Junk rows are archived on insert; forcing isArchived=false
      // would hide every junk match. The junk view shows both
      // archived + non-archived spam rows so users can audit.
      conditions.push(eq(externalEmailMessages.isArchived, false));
    }
    if (opts.unreadOnly) {
      conditions.push(eq(externalEmailMessages.isRead, false));
    }
    if (opts.accountIds && opts.accountIds.length > 0) {
      conditions.push(inArray(externalEmailMessages.accountId, opts.accountIds));
    }

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
      .where(and(...conditions))
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

  async findById(id: string, userId: string): Promise<ExternalEmailMessageRow | null> {
    const rows = (await this.db
      .select()
      .from(externalEmailMessages)
      .where(
        and(eq(externalEmailMessages.id, id), eq(externalEmailMessages.userId, userId)),
      )
      .limit(1)) as ExternalEmailMessageRow[];
    return rows[0] ?? null;
  }

  async findByIdWithAccount(
    id: string,
    userId: string,
  ): Promise<ExternalEmailInboxRow | null> {
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
        and(eq(externalEmailMessages.id, id), eq(externalEmailMessages.userId, userId)),
      )
      .limit(1)) as Array<{
      message: ExternalEmailMessageRow;
      accountLabel: string | null;
      accountEmail: string;
    }>;
    const row = rows[0];
    if (!row) return null;
    return { ...row.message, accountLabel: row.accountLabel, accountEmail: row.accountEmail };
  }

  async findByAccount(accountId: string): Promise<ExternalEmailMessageRow[]> {
    return (await this.db
      .select()
      .from(externalEmailMessages)
      .where(eq(externalEmailMessages.accountId, accountId))) as ExternalEmailMessageRow[];
  }

  async insert(input: ExternalEmailMessageInsert): Promise<ExternalEmailMessageRow> {
    const [row] = await this.db
      .insert(externalEmailMessages)
      .values(input as any)
      .onConflictDoNothing({
        target: [externalEmailMessages.accountId, externalEmailMessages.providerMessageId],
      })
      .returning();
    if (row) return row as ExternalEmailMessageRow;
    // Conflict — fetch the existing row so callers always get something back.
    const existing = (await this.db
      .select()
      .from(externalEmailMessages)
      .where(
        and(
          eq(externalEmailMessages.accountId, input.accountId as string),
          eq(externalEmailMessages.providerMessageId, input.providerMessageId as string),
        ),
      )
      .limit(1)) as ExternalEmailMessageRow[];
    return existing[0]!;
  }

  async patch(id: string, patch: Partial<ExternalEmailMessageInsert>): Promise<void> {
    await this.db
      .update(externalEmailMessages)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(externalEmailMessages.id, id));
  }

  async markRead(id: string, userId: string): Promise<void> {
    await this.db
      .update(externalEmailMessages)
      .set({ isRead: true, updatedAt: this.now() } as any)
      .where(
        and(eq(externalEmailMessages.id, id), eq(externalEmailMessages.userId, userId)),
      );
  }

  async markUnread(id: string, userId: string): Promise<void> {
    await this.db
      .update(externalEmailMessages)
      .set({ isRead: false, updatedAt: this.now() } as any)
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

  async setArchivedBulk(
    ids: string[],
    userId: string,
    archived: boolean,
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(externalEmailMessages)
      .set({ isArchived: archived, updatedAt: this.now() } as any)
      .where(
        and(
          inArray(externalEmailMessages.id, ids),
          eq(externalEmailMessages.userId, userId),
        ),
      );
  }
}
