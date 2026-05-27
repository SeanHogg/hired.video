/**
 * Generic retention sweep — single seam for "delete rows older than X
 * from append-only / ephemeral tables." Gap #1602 (Consolidated Gap
 * Register) closed via this module.
 *
 * Each entry in RETENTION_POLICIES is one table to age out. The runner
 * loops them, batching the DELETE so a single sweep can't blow the
 * Worker CPU budget. Daily-only — the caller in `scheduled.ts` gates
 * the whole run to one UTC window, so per-table state isn't required.
 *
 * DRY: every retention policy in the codebase MUST be declared here.
 * Adding `processFooRetention` as a separate function in scheduled.ts
 * is the anti-pattern this module exists to prevent — the runner is
 * generic; the configs are data.
 *
 * Tables explicitly NOT in this list (audit-required or user-facing):
 *   - points_ledger / point_redemptions / usage_ledger (financial audit)
 *   - admin_audit_log (audit retention is policy-driven, separate)
 *   - external_email_messages (user inbox; the user expects persistence)
 *
 * Notifications were initially excluded too, but at millions-of-users
 * scale unread-but-never-clicked notifications accumulate indefinitely.
 * The 90-day cap matches the "user would have seen it by now" floor.
 *
 * Adding a row here is a load-bearing change: review the table's audit
 * + product semantics before extending.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";

export interface RetentionPolicy {
  /** Postgres table name (NOT the Drizzle TS export name). */
  table: string;
  /** Timestamptz column used as the "age" axis. created_at for
   *  append-only logs, updated_at / last_hit_at for LRU caches. */
  ageColumn: string;
  /** Rows older than this many days are deleted. */
  retentionDays: number;
  /** Max rows the sweep will delete per run, so a single sweep can't
   *  blow the Worker CPU budget. The next daily run picks up the rest. */
  maxRowsPerRun: number;
}

/**
 * Single source of truth for retention windows. Justifications inline.
 */
export const RETENTION_POLICIES: readonly RetentionPolicy[] = [
  // AI scratchpad + tool history — users can re-run; 90 days covers the
  // "look up what I did last quarter" use case.
  { table: "tool_runs",         ageColumn: "created_at", retentionDays: 90, maxRowsPerRun: 5000 },
  { table: "ai_chat_messages",  ageColumn: "created_at", retentionDays: 90, maxRowsPerRun: 5000 },

  // Vendor API call logs — operational telemetry; 30 days for debugging
  // recent failures, beyond that it's just storage cost.
  { table: "integration_runs",  ageColumn: "created_at", retentionDays: 30, maxRowsPerRun: 5000 },
  { table: "profile_sync_runs", ageColumn: "created_at", retentionDays: 30, maxRowsPerRun: 5000 },
  { table: "worker_runs",       ageColumn: "started_at", retentionDays: 30, maxRowsPerRun: 5000 },

  // Request-level telemetry — 30 days matches typical Worker log retention.
  { table: "request_logs",      ageColumn: "created_at", retentionDays: 30, maxRowsPerRun: 5000 },
  { table: "activity_logs",     ageColumn: "created_at", retentionDays: 90, maxRowsPerRun: 5000 },

  // Extension session/event telemetry. Sessions are LRU (`updated_at`)
  // so an active reconnect resets the clock; events use creation time.
  { table: "extension_sessions", ageColumn: "updated_at", retentionDays: 14,  maxRowsPerRun: 5000 },
  { table: "extension_events",   ageColumn: "created_at", retentionDays: 30,  maxRowsPerRun: 5000 },

  // Mapbox geocoder cache is a true LRU — eviction by last_hit_at, not
  // creation date. A row that's still being hit weekly stays forever.
  { table: "geocoder_cache",     ageColumn: "last_hit_at", retentionDays: 90, maxRowsPerRun: 5000 },

  // Notifications — once a user has dismissed an old notification or
  // the platform-wide retention window passes, drop. 90 days matches
  // the "unread badge would have been seen by now" assumption. Stale
  // unread notifications also drop so the table stays bounded — if
  // the user hasn't read it in 90 days, the notification is dead.
  { table: "notifications",      ageColumn: "created_at", retentionDays: 90, maxRowsPerRun: 5000 },
] as const;

export interface RetentionRunSummary {
  table: string;
  rowsDeleted: number;
  cappedAtLimit: boolean;
  errorMessage?: string;
}

/**
 * Run the retention sweep against every policy. Returns per-table
 * summaries so the caller can log a single line.
 */
export async function runRetentionSweep(): Promise<RetentionRunSummary[]> {
  const db = getDb();
  const summaries: RetentionRunSummary[] = [];

  for (const policy of RETENTION_POLICIES) {
    try {
      // Postgres DELETE doesn't take LIMIT directly; the WHERE id IN
      // (SELECT … LIMIT …) idiom is what bounds the batch. The
      // sql.raw() escape is needed because table + column names can't
      // be parameterised (parameters are only for values). The values
      // in RETENTION_POLICIES are static literals declared above, so
      // there's no injection surface.
      const result = await db.execute(sql.raw(`
        DELETE FROM ${policy.table}
        WHERE ctid IN (
          SELECT ctid FROM ${policy.table}
          WHERE ${policy.ageColumn} < NOW() - INTERVAL '${policy.retentionDays} days'
          ORDER BY ${policy.ageColumn}
          LIMIT ${policy.maxRowsPerRun}
        )
      `));
      const rowsDeleted = (result as { rowCount?: number }).rowCount ?? 0;
      summaries.push({
        table: policy.table,
        rowsDeleted,
        cappedAtLimit: rowsDeleted >= policy.maxRowsPerRun,
      });
    } catch (err) {
      summaries.push({
        table: policy.table,
        rowsDeleted: 0,
        cappedAtLimit: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summaries;
}
