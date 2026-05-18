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
import { JOB_INBOX_CATEGORIES } from "../../../shared/email-classification/index.js";

const { externalEmailMessages, externalEmailAccounts } = schema;

export { JOB_INBOX_CATEGORIES };

export type DbLike = any;

export type ExternalEmailMessageRow = typeof externalEmailMessages.$inferSelect;
export type ExternalEmailMessageInsert = typeof externalEmailMessages.$inferInsert;

/** Read-side projection used by the inbox aggregator. The plain message row
 *  doesn't carry the human-readable account label, so this view joins it in. */
export interface ExternalEmailInboxRow extends ExternalEmailMessageRow {
  accountLabel: string | null;
  accountEmail: string;
}

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
  /** Page cursor — fetch rows strictly older than this anchor. Tuple
   *  comparison on `(received_at, id)` so two rows with identical
   *  receivedAt are still ordered deterministically (uuid v7 is
   *  monotonic enough for our case). Null/omit = first page. */
  cursor?: InboxCursor;
}

/** Page cursor anchor — the last row of the previous page. The repo
 *  emits `(received_at, id)` tuples in DESC order, so the next page
 *  satisfies `(received_at, id) < (cursor.receivedAt, cursor.id)`. */
export interface InboxCursor {
  receivedAt: string;
  id: string;
}

export interface IExternalEmailMessagesRepository {
  findRecentForUser(userId: string, limit?: number): Promise<ExternalEmailInboxRow[]>;
  findInboxForUser(userId: string, opts?: FindInboxOptions): Promise<ExternalEmailInboxRow[]>;
  findById(id: string, userId: string): Promise<ExternalEmailMessageRow | null>;
  findByIdWithAccount(id: string, userId: string): Promise<ExternalEmailInboxRow | null>;
  findByAccount(accountId: string): Promise<ExternalEmailMessageRow[]>;
  insert(input: ExternalEmailMessageInsert): Promise<ExternalEmailMessageRow>;
  /** Bulk insert + conflict-resolve in one round-trip. Inserts new rows
   *  via `onConflictDoNothing` on `(accountId, providerMessageId)`, then
   *  one batched SELECT pulls every row in the input set back (both
   *  freshly-inserted and pre-existing) so callers always get a row per
   *  input. Single source of truth for "ingest a chunk of messages" —
   *  the per-message `insert()` path on top is for callers (legacy cron
   *  + tests) that aren't chunked. */
  insertMany(inputs: ExternalEmailMessageInsert[]): Promise<ExternalEmailMessageRow[]>;
  patch(id: string, patch: Partial<ExternalEmailMessageInsert>): Promise<void>;
  /** Apply per-row patches in one round-trip via a `VALUES(...) JOIN`
   *  UPDATE. Single source of truth for batched ingest finals so the
   *  Worker subrequest budget collapses from O(N) to O(1) per chunk
   *  (gap #815). Skipping rows whose patch is empty is the caller's
   *  responsibility. */
  patchMany(
    patches: Array<{ id: string; patch: Partial<ExternalEmailMessageInsert> }>,
  ): Promise<void>;
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
    if (opts.cursor) {
      // Tuple comparison keeps the cursor stable when two messages
      // landed in the same millisecond — `id` is the deterministic
      // tiebreaker so the page boundary doesn't double-emit or skip.
      conditions.push(
        sql`(${externalEmailMessages.receivedAt}, ${externalEmailMessages.id}) < (${opts.cursor.receivedAt}::timestamptz, ${opts.cursor.id}::uuid)`,
      );
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
      .orderBy(desc(externalEmailMessages.receivedAt), desc(externalEmailMessages.id))
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

  async insertMany(
    inputs: ExternalEmailMessageInsert[],
  ): Promise<ExternalEmailMessageRow[]> {
    if (inputs.length === 0) return [];
    // Step 1 — bulk INSERT with conflict-skip. `returning *` covers
    // the freshly-inserted rows but NOT conflicted ones, so we do a
    // single batched SELECT afterwards keyed by
    // (accountId, providerMessageId) to pull the existing rows back.
    // Two round-trips per chunk regardless of size vs. 2N for the
    // per-message path.
    const inserted = (await this.db
      .insert(externalEmailMessages)
      .values(inputs as any)
      .onConflictDoNothing({
        target: [externalEmailMessages.accountId, externalEmailMessages.providerMessageId],
      })
      .returning()) as ExternalEmailMessageRow[];

    if (inserted.length === inputs.length) return inserted;

    // Step 2 — backfill conflicted rows. Group by accountId so the
    // SELECT can use the same (accountId, providerMessageId) unique
    // index that the conflict target uses. In practice every chunk has
    // a single accountId (callers ingest per-account) — keep the loop
    // for the defensive case but it's a 1-iteration loop on the hot path.
    const insertedIds = new Set(inserted.map((r) => r.providerMessageId));
    const conflicts = inputs.filter(
      (i) => !insertedIds.has(i.providerMessageId as string),
    );
    if (conflicts.length === 0) return inserted;

    const byAccount = new Map<string, string[]>();
    for (const c of conflicts) {
      const accountId = c.accountId as string;
      const arr = byAccount.get(accountId) ?? [];
      arr.push(c.providerMessageId as string);
      byAccount.set(accountId, arr);
    }
    const existing: ExternalEmailMessageRow[] = [];
    for (const [accountId, providerMessageIds] of byAccount) {
      const rows = (await this.db
        .select()
        .from(externalEmailMessages)
        .where(
          and(
            eq(externalEmailMessages.accountId, accountId),
            inArray(externalEmailMessages.providerMessageId, providerMessageIds),
          ),
        )) as ExternalEmailMessageRow[];
      existing.push(...rows);
    }
    return [...inserted, ...existing];
  }

  async patch(id: string, patch: Partial<ExternalEmailMessageInsert>): Promise<void> {
    await this.db
      .update(externalEmailMessages)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(externalEmailMessages.id, id));
  }

  async patchMany(
    patches: Array<{ id: string; patch: Partial<ExternalEmailMessageInsert> }>,
  ): Promise<void> {
    if (patches.length === 0) return;
    // Single UPDATE FROM (VALUES …) keyed by id. Every column the
    // ingest pass writes is covered; columns the patch leaves
    // undefined fall back to the existing row value via COALESCE
    // ordering — the v.<col> placeholder is typed-null per patch and
    // the SET clause uses `COALESCE(v.<col>, m.<col>)` so omitted
    // fields don't clobber whatever was there. Single round-trip
    // regardless of N (gap #815).
    //
    // Note: numeric columns are passed as strings (drizzle convention
    // for `numeric` so JS floats don't lose precision) — the cast in
    // the VALUES row keeps the type narrow for the planner.
    const now = this.now();
    const rows = patches.map(({ id, patch }) =>
      sql`(${id}::uuid,
            ${patch.category ?? null},
            ${(patch as any).score ?? null}::numeric,
            ${patch.summary ?? null},
            ${patch.applyUrl ?? null},
            ${patch.linkedJobId ?? null}::uuid,
            ${(patch as any).dedupScore ?? null}::numeric,
            ${patch.dedupMethod ?? null},
            ${patch.isArchived ?? null}::boolean)`,
    );
    const values = sql.join(rows, sql`, `);
    await this.db.execute(sql`
      UPDATE ${externalEmailMessages} AS m
      SET
        category = COALESCE(v.category, m.category),
        score = COALESCE(v.score, m.score),
        summary = COALESCE(v.summary, m.summary),
        apply_url = COALESCE(v.apply_url, m.apply_url),
        linked_job_id = COALESCE(v.linked_job_id, m.linked_job_id),
        dedup_score = COALESCE(v.dedup_score, m.dedup_score),
        dedup_method = COALESCE(v.dedup_method, m.dedup_method),
        is_archived = COALESCE(v.is_archived, m.is_archived),
        updated_at = ${now}
      FROM (VALUES ${values}) AS v(
        id, category, score, summary, apply_url,
        linked_job_id, dedup_score, dedup_method, is_archived
      )
      WHERE m.id = v.id
    `);
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
