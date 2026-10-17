/**
 * Counter cache recompute — single seam for "denormalised count columns
 * that drift over time." Gap #1605 closure.
 *
 * Each entry in COUNTER_POLICIES is a (table, column, source) tuple. The
 * recompute pass runs a single `UPDATE … SET column = (SELECT count(*)
 * FROM source WHERE source.fk = target.id)` per policy. Daily-only — the
 * caller in scheduled.ts gates the whole run to one UTC window.
 *
 * DRY: every counter cache in the codebase MUST be declared here. Adding
 * `processFooCounter` as a separate function in scheduled.ts is the
 * anti-pattern this module exists to prevent — the runner is generic;
 * the configs are data.
 *
 * NOT in this list (and deliberately so):
 *   - Append-only ledgers (points_ledger, payout_ledger_entries,
 *     usage_ledger) — totals roll up via SUM, not by counter cache.
 *   - Counters that are already covered by a Postgres trigger.
 *   - `gamification.user_points_balance` — money-equivalent state;
 *     reconstructed from points_ledger via SUM, not by re-counting.
 *
 * Adding a counter here is load-bearing: review the (table, column,
 * source) tuple before extending.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";

export interface CounterPolicy {
  /** Target table holding the cached counter column. */
  table: string;
  /** Counter column to recompute. */
  column: string;
  /** Source table whose rows we count. */
  sourceTable: string;
  /** FK column on the source pointing at target.id. */
  sourceFk: string;
  /** Additional WHERE clause on the source (e.g. only-active rows). */
  sourceWhere?: string;
}

/**
 * Single source of truth for counter caches. Justifications inline.
 */
export const COUNTER_POLICIES: readonly CounterPolicy[] = [
  // Voice marketplace — playCount + purchaseCount tracked on the clone row
  // for the catalog card. Both can drift if the writer crashes mid-update.
  {
    table: "studio_voice_clones",
    column: "play_count",
    sourceTable: "studio_voice_clone_plays",
    sourceFk: "voice_clone_id",
  },
  {
    table: "studio_voice_clones",
    column: "purchase_count",
    sourceTable: "studio_voice_clone_licenses",
    sourceFk: "voice_clone_id",
    sourceWhere: "source = 'purchase'",
  },

  // ATS package view count.
  {
    table: "studio_ats_packages",
    column: "view_count",
    sourceTable: "studio_ats_package_views",
    sourceFk: "package_id",
  },

  // Interview question-set re-use counter.
  {
    table: "interview_question_sets",
    column: "use_count",
    sourceTable: "studio_async_interviews",
    sourceFk: "question_set_id",
  },

  // Stock media pick counter.
  {
    table: "stock_media_assets",
    column: "pick_count",
    sourceTable: "studio_stock_media_picks",
    sourceFk: "asset_id",
  },

  // Articles view count (read-stat surface).
  {
    table: "articles",
    column: "view_count",
    sourceTable: "artifact_views",
    sourceFk: "artifact_id",
    sourceWhere: "artifact_kind = 'article' AND event_type = 'view'",
  },

  // Candidate resume share viewCount.
  {
    table: "candidate_resume_shares",
    column: "view_count",
    sourceTable: "candidate_resume_share_views",
    sourceFk: "share_id",
  },

  // Recruiter sourcing-bid candidate submissions counter.
  {
    table: "board_bids",
    column: "candidates_submitted_count",
    sourceTable: "candidate_submissions",
    sourceFk: "board_bid_id",
  },
] as const;

export interface CounterRecomputeSummary {
  table: string;
  column: string;
  rowsAdjusted: number;
  errorMessage?: string;
}

/**
 * Recompute every counter policy. Returns per-policy summaries so the
 * caller can log a single line with adjustment counts.
 *
 * Each policy issues a single UPDATE that touches only rows whose cached
 * value differs from the recomputed value, so the daily pass is cheap
 * when the counters are already accurate.
 */
export async function runCounterRecompute(): Promise<CounterRecomputeSummary[]> {
  const db = getDb();
  const summaries: CounterRecomputeSummary[] = [];

  for (const policy of COUNTER_POLICIES) {
    try {
      const sourceFilter = policy.sourceWhere ? ` WHERE ${policy.sourceWhere}` : "";
      // `coalesce(…, 0)` so a parent row with zero children gets 0, not NULL.
      // The `WHERE column IS DISTINCT FROM …` predicate skips rows that
      // already match — keeps the update bounded to actual drift.
      // sql.raw() is safe here because every config string is a static
      // literal declared above (no user input). Same pattern as
      // retention-sweep.ts.
      const query = `
        UPDATE ${policy.table} AS target
        SET ${policy.column} = COALESCE(sub.cnt, 0)
        FROM (
          SELECT ${policy.sourceFk} AS parent_id, COUNT(*)::int AS cnt
          FROM ${policy.sourceTable}
          ${sourceFilter}
          GROUP BY ${policy.sourceFk}
        ) sub
        WHERE sub.parent_id = target.id
          AND target.${policy.column} IS DISTINCT FROM COALESCE(sub.cnt, 0)
      `;
      const result = await db.execute(sql.raw(query));
      const rowsAdjusted = (result as { rowCount?: number }).rowCount ?? 0;
      summaries.push({ table: policy.table, column: policy.column, rowsAdjusted });
    } catch (err) {
      summaries.push({
        table: policy.table,
        column: policy.column,
        rowsAdjusted: 0,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summaries;
}
