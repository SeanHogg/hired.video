/**
 * Shared soft-delete predicates. Gap #1612 closure (the convention half).
 *
 * Convention going forward: every soft-deletable table has an
 * `archived_at timestamp with time zone NULL`. Active rows have
 * `archived_at IS NULL`. The helper returns SQL that consumers compose
 * into their queries via Drizzle's `and()` / `where()`.
 *
 * The pre-existing `is_archived boolean` columns on
 *   - boards, conversations, external_email_messages,
 *   - interview_kits, scorecard_templates, scorecard_attributes,
 *   - interview_question_sets
 * are kept during the transition window. Migration 0154 added
 * `archived_at` alongside and backfilled from `is_archived`. Reads SHOULD
 * route through the helpers here; writes SHOULD set both columns until
 * the boolean is dropped.
 *
 * Don't fork the predicate at the call site. If a query needs "archived
 * OR not", that's a feature flag and belongs above the SQL layer, not
 * inline as `is_archived = true OR is_archived = false`.
 */

import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * SQL predicate for "this row is active" (not soft-deleted).
 * Compose into a where clause:
 *
 * ```ts
 * db.select().from(boards).where(and(eq(boards.userId, me), notArchived(boards.archivedAt)));
 * ```
 */
export function notArchived(archivedAtColumn: AnyPgColumn): SQL {
  return sql`${archivedAtColumn} IS NULL`;
}

/**
 * SQL predicate for "this row is soft-deleted." Inverse of notArchived.
 */
export function isArchived(archivedAtColumn: AnyPgColumn): SQL {
  return sql`${archivedAtColumn} IS NOT NULL`;
}
