/**
 * Pre-push reconciliation of legacy UNIQUE indexes (gap #2305) — chained in
 * the api/package.json `db:push` script after ensure-db-extensions and
 * BEFORE `drizzle-kit push`.
 *
 * Why it runs before push: the indexes in unique-index-registry.mjs are now
 * declared in the Drizzle schema. If one is missing in the DB, push would try
 * to CREATE UNIQUE INDEX itself — and abort the deploy on any duplicate rows
 * that accumulated while the index was gone. Running here first, each entry:
 *   1. finds duplicate rows (row_number() over the unique key, among rows
 *      that can actually conflict: partial predicate true, key non-null),
 *   2. applies the entry's resolution to every row but the kept one,
 *   3. CREATE UNIQUE INDEX IF NOT EXISTS with the exact migration definition.
 * Push then sees each index present under its declared name and leaves it.
 *
 *   node scripts/reconcile-unique-indexes.mjs            # apply
 *   node scripts/reconcile-unique-indexes.mjs --dry-run  # report only
 *
 * Idempotent: once an index exists its key admits no duplicates, so later
 * runs find zero losers and the CREATE is a no-op. All SQL comes from the
 * static registry — no runtime input is interpolated.
 */

import { neon } from "@neondatabase/serverless";
import { fileURLToPath } from "node:url";
import { argv } from "node:process";
import { withRetry } from "./run-sql-migrations.mjs";
import { LEGACY_UNIQUE_INDEXES } from "./unique-index-registry.mjs";

/** Rows that can collide under the index: predicate true AND key non-null. */
function conflictScope(entry) {
  const conds = entry.keyNotNull.map((c) => `${c} IS NOT NULL`);
  if (entry.where) conds.push(`(${entry.where})`);
  return conds.join(" AND ");
}

/** Subquery returning the ids of every duplicate except the kept row. */
export function losersSql(entry) {
  return `SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY ${entry.columns} ORDER BY ${entry.keep}, id) AS rn
  FROM ${entry.table} WHERE ${conflictScope(entry)}
) AS ranked WHERE rn > 1`;
}

export function countLosersSql(entry) {
  return `SELECT count(*)::int AS n FROM (${losersSql(entry)}) AS losers`;
}

export function resolveSql(entry) {
  return entry.resolve.replaceAll("{losers}", losersSql(entry));
}

export function createIndexSql(entry) {
  const where = entry.where ? ` WHERE ${entry.where}` : "";
  return `CREATE UNIQUE INDEX IF NOT EXISTS ${entry.name} ON ${entry.table} (${entry.columns})${where}`;
}

/**
 * Reconcile every registry entry. `query(sqlText)` returns rows; injected so
 * tests can drive it without a database.
 */
export async function reconcileUniqueIndexes(query, { dryRun = false, log = console.log } = {}) {
  const summary = [];
  for (const entry of LEGACY_UNIQUE_INDEXES) {
    const [{ n }] = await query(countLosersSql(entry));
    if (n > 0 && !dryRun) await query(resolveSql(entry));
    if (!dryRun) await query(createIndexSql(entry));
    summary.push({ name: entry.name, table: entry.table, duplicates: n });
    log(`${entry.name}: ${n} duplicate row(s)${n > 0 ? (dryRun ? " — would resolve" : " — resolved") : ""}${dryRun ? "" : ", index ok"}`);
  }
  return summary;
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NEON_DB_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const sql = neon(url);
  const dryRun = argv.includes("--dry-run");
  const summary = await reconcileUniqueIndexes((text) => withRetry(() => sql(text)), { dryRun });
  const total = summary.reduce((acc, s) => acc + s.duplicates, 0);
  console.log(`unique-index reconcile${dryRun ? " (dry run)" : ""}: ${summary.length} indexes, ${total} duplicate row(s)`);
}

// Only auto-run when invoked directly — imports for testing must not touch
// the database.
if (fileURLToPath(import.meta.url) === argv[1]) {
  main().catch((e) => {
    console.error("FATAL: reconcile-unique-indexes failed:", e?.message ?? e);
    process.exit(1);
  });
}
