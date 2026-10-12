/**
 * Generic retention sweep — single seam for "delete rows older than X
 * from append-only / ephemeral tables." Gap #1602 (Consolidated Gap
 * Register) closed via this module.
 *
 * Each entry in RETENTION_POLICIES is one table to age out. The runner
 * deletes in bounded ctid batches and KEEPS GOING — round-robin across
 * every policy — until each table has no expired rows left or the
 * per-run wall-clock budget is spent. (The original one-batch-per-run
 * shape capped request_logs at 5k deletes/day, so the table grew without
 * bound above ~5k requests/day.) Daily-only — the caller in
 * `scheduled.ts` gates the whole run to one UTC window; anything the
 * budget doesn't reach is picked up by the next run, so per-table state
 * isn't required.
 *
 * DRY: every retention policy in the codebase MUST be declared here.
 * Adding `processFooRetention` as a separate function in scheduled.ts
 * is the anti-pattern this module exists to prevent — the runner is
 * generic; the configs are data.
 *
 * Tables explicitly NOT in this list (audit-required or user-facing):
 *   - points_ledger / point_redemptions / usage_ledger (financial audit)
 *   - external_email_messages (user inbox; the user expects persistence)
 *
 * Notifications were initially excluded too, but at millions-of-users
 * scale unread-but-never-clicked notifications accumulate indefinitely.
 * The 90-day cap matches the "user would have seen it by now" floor.
 *
 * `admin_audit_log` is retained for 365 days (#1613). SOC 2 requires
 * minimum 12 months admin-action audit retention; archive to cold
 * storage prior to delete is the long-term move (separately tracked).
 *
 * Adding a row here is a load-bearing change: review the table's audit
 * + product semantics before extending.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";

export interface RetentionPolicy {
  /** Postgres table name (NOT the Drizzle TS export name). */
  table: string;
  /** Timestamptz column(s) used as the "age" axis. created_at for
   *  append-only logs, updated_at / last_hit_at for LRU caches. With more
   *  than one column a row is expired when ANY of them is past the window
   *  (NULLs never match) — e.g. sessions: revoked OR expired long ago. */
  ageColumns: readonly string[];
  /** Rows older than this many days are deleted. */
  retentionDays: number;
  /** Optional static SQL predicate ANDed with the age test — scopes the
   *  policy to a slice of the table (e.g. guest users only). Literal from
   *  this file only; never user input. */
  scope?: string;
  /** Rows deleted per DELETE statement. Bounds any single statement
   *  (lock duration, WAL burst, neon-http response time); the runner
   *  issues as many batches as the time budget allows. */
  batchSize: number;
}

/**
 * Single source of truth for retention windows. Justifications inline.
 *
 * Every single-column `ageColumns` entry needs an index leading with that
 * column (migration 0495 added the missing ones) — the batch's
 * ORDER BY … LIMIT must be an index range scan, not a full-table sort.
 */
export const RETENTION_POLICIES: readonly RetentionPolicy[] = [
  // AI scratchpad + tool history — users can re-run; 90 days covers the
  // "look up what I did last quarter" use case.
  // Tool runs made in a studio session (studio_project_id set, mig 0510)
  // live as long as the session — FK cascade removes them with it.
  { table: "tool_runs",         ageColumns: ["created_at"], retentionDays: 90, batchSize: 5000, scope: "studio_project_id IS NULL" },
  { table: "ai_chat_messages",  ageColumns: ["created_at"], retentionDays: 90, batchSize: 5000 },

  // Vendor API call logs — operational telemetry; 30 days for debugging
  // recent failures, beyond that it's just storage cost.
  { table: "integration_runs",  ageColumns: ["created_at"], retentionDays: 30, batchSize: 5000 },
  { table: "profile_sync_runs", ageColumns: ["created_at"], retentionDays: 30, batchSize: 5000 },
  { table: "worker_runs",       ageColumns: ["started_at"], retentionDays: 30, batchSize: 5000 },

  // Request-level telemetry — 30 days matches typical Worker log retention.
  { table: "request_logs",      ageColumns: ["created_at"], retentionDays: 30, batchSize: 5000 },
  { table: "activity_logs",     ageColumns: ["created_at"], retentionDays: 90, batchSize: 5000 },

  // Extension session/event telemetry. Sessions are LRU (`updated_at`)
  // so an active reconnect resets the clock; events use creation time.
  { table: "extension_sessions", ageColumns: ["updated_at"], retentionDays: 14, batchSize: 5000 },
  { table: "extension_events",   ageColumns: ["created_at"], retentionDays: 30, batchSize: 5000 },

  // Mapbox geocoder cache is a true LRU — eviction by last_hit_at, not
  // creation date. A row that's still being hit weekly stays forever.
  { table: "geocoder_cache",     ageColumns: ["last_hit_at"], retentionDays: 90, batchSize: 5000 },

  // Notifications — once a user has dismissed an old notification or
  // the platform-wide retention window passes, drop. 90 days matches
  // the "unread badge would have been seen by now" assumption. Stale
  // unread notifications also drop so the table stays bounded — if
  // the user hasn't read it in 90 days, the notification is dead.
  { table: "notifications",      ageColumns: ["created_at"], retentionDays: 90, batchSize: 5000 },

  // Auth sessions (services/auth/sessions.ts) — every login, refresh
  // rotation and revoke leaves a row behind and nothing ever deleted them.
  // A row is dead once it was revoked or passed its absolute expiry; the
  // 30-day grace keeps recently revoked/rotated rows for the device list
  // and refresh-token reuse forensics. Live sessions (revoked_at NULL,
  // expires_at in the future) can never match.
  { table: "sessions",           ageColumns: ["revoked_at", "expires_at"], retentionDays: 30, batchSize: 5000 },

  // admin_audit_log — 365d (SOC 2 floor for admin-action retention).
  // Beyond a year, the row is unlikely to be referenced by an active
  // compliance review. #1613 deferred the cold-storage archive path —
  // when that lands, this retention becomes "delete after S3 export
  // confirms." Today it's a straight delete.
  { table: "admin_audit_log",    ageColumns: ["created_at"], retentionDays: 365, batchSize: 5000 },

  // Unclaimed guest accounts (mig 0496) — a signed-out visitor's silent
  // identity. The guest JWT lives 30 days (GUEST_TOKEN_TTL); after that
  // nobody can sign back into it, so the account and everything it owns
  // (FK cascade) is dead. Claimed guests are deleted at adoption.
  { table: "users",              ageColumns: ["created_at"], retentionDays: 30, batchSize: 500, scope: "is_guest" },
] as const;

/** Wall-clock budget for one sweep run. Nearly all of it is spent awaiting
 *  Postgres (not Worker CPU), but the sweep shares its /5 tick with other
 *  jobs — 20s keeps it a good neighbour while still draining hundreds of
 *  thousands of rows per run. */
export const RETENTION_TIME_BUDGET_MS = 20_000;

export interface RetentionRunSummary {
  table: string;
  rowsDeleted: number;
  /** DELETE statements issued against this table this run. */
  batches: number;
  /** True when the time budget ran out before this table was fully
   *  drained — expired rows remain and the next run continues. */
  cappedAtLimit: boolean;
  errorMessage?: string;
}

export interface RetentionSweepOptions {
  /** Override the wall-clock budget (tests / manual backfill runs). */
  timeBudgetMs?: number;
  /** Clock seam for tests. */
  now?: () => number;
  /** Policy list seam for tests. Defaults to RETENTION_POLICIES. */
  policies?: readonly RetentionPolicy[];
  /** Batch executor seam for tests — returns rows deleted. Defaults to a
   *  ctid-batched DELETE against the live DB. */
  deleteBatch?: (policy: RetentionPolicy) => Promise<number>;
}

/**
 * Build the bounded DELETE for one batch of `policy`. Pure + exported so
 * the SQL shape is unit-testable.
 *
 * Postgres DELETE doesn't take LIMIT directly; the WHERE ctid IN
 * (SELECT … LIMIT …) idiom is what bounds the batch. Raw SQL is needed
 * because table + column names can't be parameterised (parameters are
 * only for values). Every value comes from the static RETENTION_POLICIES
 * literals above, so there's no injection surface.
 */
export function buildRetentionDeleteSql(policy: RetentionPolicy): string {
  const cutoff = `NOW() - INTERVAL '${policy.retentionDays} days'`;
  const age = policy.ageColumns.map((col) => `${col} < ${cutoff}`).join(" OR ");
  const predicate = policy.scope ? `(${age}) AND (${policy.scope})` : age;
  // Oldest-first only for the single-column case, where it's a range scan
  // on that column's index. Across an OR it would force a sort of every
  // expired row on every batch for no correctness gain.
  const orderBy = policy.ageColumns.length === 1 ? `ORDER BY ${policy.ageColumns[0]}` : "";
  return `
    DELETE FROM ${policy.table}
    WHERE ctid IN (
      SELECT ctid FROM ${policy.table}
      WHERE ${predicate}
      ${orderBy}
      LIMIT ${policy.batchSize}
    )
  `;
}

async function deleteBatchFromDb(policy: RetentionPolicy): Promise<number> {
  const result = await getDb().execute(sql.raw(buildRetentionDeleteSql(policy)));
  return (result as { rowCount?: number }).rowCount ?? 0;
}

/**
 * Run the retention sweep against every policy. Batches go round-robin
 * across the policies that still have expired rows, so one table with a
 * large backlog (request_logs after the sweep fell behind) can't starve
 * the others of the time budget. A table is done when a batch comes back
 * short (< batchSize) or errors; the run ends when every table is done or
 * the budget is spent. Returns per-table summaries so the caller can log
 * a single line.
 */
export async function runRetentionSweep(
  opts: RetentionSweepOptions = {},
): Promise<RetentionRunSummary[]> {
  const now = opts.now ?? Date.now;
  const policies = opts.policies ?? RETENTION_POLICIES;
  const deleteBatch = opts.deleteBatch ?? deleteBatchFromDb;
  const deadline = now() + (opts.timeBudgetMs ?? RETENTION_TIME_BUDGET_MS);

  const states = policies.map((policy) => ({
    policy,
    done: false,
    summary: { table: policy.table, rowsDeleted: 0, batches: 0, cappedAtLimit: false } as RetentionRunSummary,
  }));

  while (states.some((s) => !s.done) && now() < deadline) {
    for (const state of states) {
      if (state.done) continue;
      if (now() >= deadline) break;
      try {
        const deleted = await deleteBatch(state.policy);
        state.summary.rowsDeleted += deleted;
        state.summary.batches += 1;
        if (deleted < state.policy.batchSize) state.done = true;
      } catch (err) {
        // One bad table (missing relation on a fresh DB, lock timeout)
        // must not stop the others — record it and move on.
        state.summary.errorMessage = err instanceof Error ? err.message : String(err);
        state.done = true;
      }
    }
  }

  for (const state of states) {
    if (!state.done) state.summary.cappedAtLimit = true;
  }
  return states.map((s) => s.summary);
}
