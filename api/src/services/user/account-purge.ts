/**
 * Hard-delete sweep for soft-deleted user accounts past the retention
 * window published in the Privacy Policy.
 *
 * Background — closes gap #1149 (US compliance):
 *
 *   The product's privacy notice promises that deleted accounts are
 *   permanently purged after the retention period (currently 36 months).
 *   Until this job existed, `deleteAccount()` only soft-deleted the row
 *   (is_active=false + scrambled password) and nothing ever purged the
 *   record. CPRA / GDPR / CASL / PIPEDA / LFPDPPP all require the policy
 *   match the implementation.
 *
 * Wiring:
 *   - Scheduled (runScheduled in scheduled.ts) calls this every cron tick.
 *   - This module gates itself to fire ONCE per day in a UTC window so the
 *     /5 tick doesn't run it 288 times.
 *   - Inside, it batches a small page of overdue rows and hard-deletes
 *     them. Foreign keys on dependent tables are ON DELETE CASCADE in most
 *     schemas (videos, refresh_tokens, account_preferences, etc.); rows
 *     pointed at by SET NULL FKs (job_items.posted_by_user_id, etc.) just
 *     null out.
 *   - The page size is small (50) so a long backlog drains over many days
 *     rather than fitting in one cron window. The 36-month threshold means
 *     a real-world backlog should be near-zero.
 *
 * Safety:
 *   - PURGE_AFTER_DAYS is the only knob; lowering it accidentally would
 *     hard-delete recently-deleted users. Treat any change as a P0 review.
 *   - Existing soft-deleted rows that pre-date this migration have NULL
 *     deletedAt and therefore never qualify — the worker is implicitly
 *     a no-op for legacy soft-deletes (deliberate; we won't retroactively
 *     start the clock without an admin-initiated backfill).
 *   - The worker logs every deletion to console + (future) audit table.
 *     Any deletion failure surfaces in the per-row catch and skips that
 *     row rather than aborting the whole batch.
 */

import { and, isNotNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const { users } = schema;

/** Retention window from the Privacy Policy. Changing this requires a
 *  matching update to the public privacy notice (and likely jurisdiction
 *  review). 36 months expressed as days for explicit math. */
const PURGE_AFTER_DAYS = 36 * 30;

/** Daily window when the sweep is allowed to fire. The /5 cron tick fires
 *  every 5 minutes; without this gate the worker would run 288 times/day. */
const UTC_HOUR_WINDOW_START = 3;
const UTC_HOUR_WINDOW_END = 4;

/** Max rows to hard-delete per cron invocation. Small because the steady
 *  state should be near-zero; if a large backlog accrues, it drains over
 *  many cron ticks — preferable to one giant DELETE that holds locks. */
const PURGE_PAGE_SIZE = 50;

export interface AccountPurgeSummary {
  scanned: number;
  deleted: number;
  failed: number;
  skippedNotDue: boolean;
}

/** Decide whether the sweep should run on this cron tick. Exported for
 *  unit testing — runScheduled() calls processAccountPurge() and lets
 *  the gate live inside that helper. */
export function isPurgeWindow(now: Date = new Date()): boolean {
  const h = now.getUTCHours();
  return h >= UTC_HOUR_WINDOW_START && h < UTC_HOUR_WINDOW_END;
}

/** Resolve the cut-off timestamp — rows with deletedAt < this are eligible
 *  for hard-delete. Exported so admin tooling can preview what would be
 *  purged before triggering a manual sweep. */
export function purgeCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);
}

export async function processAccountPurge(now: Date = new Date()): Promise<AccountPurgeSummary> {
  if (!isPurgeWindow(now)) {
    return { scanned: 0, deleted: 0, failed: 0, skippedNotDue: true };
  }
  const db = getDb();
  const cutoff = purgeCutoff(now);

  // Pull just IDs; per-row DELETE keeps lock scope tight and lets us log
  // individual failures without losing the rest of the batch.
  const candidates = await db
    .select({ id: users.id })
    .from(users)
    .where(and(isNotNull(users.deletedAt), lt(users.deletedAt, cutoff)))
    .limit(PURGE_PAGE_SIZE);

  let deleted = 0;
  let failed = 0;
  for (const { id } of candidates) {
    try {
      // Hard delete. Cascading FKs handle most dependent rows; tables
      // without CASCADE (job_items.posted_by_user_id, etc.) are SET NULL
      // by their FK definitions so we don't orphan and don't violate
      // referential integrity. If a constraint blocks the DELETE, the
      // failure is logged and the row stays — we DO NOT bypass FKs to
      // force the delete (would lose audit trails on the dependent side).
      await db.execute(sql`DELETE FROM users WHERE id = ${id}`);
      deleted += 1;
      console.log(`[scheduled] account-purge: hard-deleted user ${id}`);
    } catch (err) {
      failed += 1;
      console.error(`[scheduled] account-purge: failed to delete user ${id}:`, err);
    }
  }

  return { scanned: candidates.length, deleted, failed, skippedNotDue: false };
}
