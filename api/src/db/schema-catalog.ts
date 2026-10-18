/**
 * What the Drizzle schema declares, read from the table objects themselves.
 *
 * Used by the deploy path, never at request time:
 *   - drizzle.config.ts limits `drizzle-kit push` to these tables
 *     (`tablesFilter`), so push can never drop a table that lives only in SQL
 *     migrations — `_sql_migrations` (the runner's ledger), archive tables
 *     such as `content_reports_v2_archived`, legacy tables kept for a later
 *     explicit DROP. Tables are dropped by numbered migrations, not by push.
 *   - scripts/ensure-unique-constraints.ts creates any declared UNIQUE
 *     constraint that is missing before push runs, because drizzle-kit asks
 *     "truncate the table?" for a missing constraint on a non-empty table even
 *     under --force, and CI cannot answer.
 */
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "./schema/index.js";
import { quoteIdent } from "./sql-ident.js";

export interface DeclaredUniqueConstraint {
  table: string;
  name: string;
  columns: string[];
  nullsNotDistinct: boolean;
}

function declaredTables(): PgTable[] {
  const exports: unknown[] = Object.values(schema);
  return exports.filter((v): v is PgTable => is(v, PgTable));
}

/** Names of every public-schema table the Drizzle schema declares. */
export function declaredTableNames(): string[] {
  const names = new Set<string>();
  for (const table of declaredTables()) {
    const config = getTableConfig(table);
    if (!config.schema || config.schema === "public") names.add(config.name);
  }
  return [...names].sort();
}

/** Every UNIQUE constraint (column `.unique()` and table-level `unique()`). */
export function declaredUniqueConstraints(): DeclaredUniqueConstraint[] {
  const out: DeclaredUniqueConstraint[] = [];
  for (const table of declaredTables()) {
    const config = getTableConfig(table);
    if (config.schema && config.schema !== "public") continue;
    for (const column of config.columns) {
      if (!column.isUnique || !column.uniqueName) continue;
      out.push({
        table: config.name,
        name: column.uniqueName,
        columns: [column.name],
        nullsNotDistinct: column.uniqueType === "not distinct",
      });
    }
    for (const unique of config.uniqueConstraints) {
      out.push({
        table: config.name,
        name: unique.getName(),
        columns: unique.columns.map((c) => c.name),
        nullsNotDistinct: unique.nullsNotDistinct,
      });
    }
  }
  return out;
}

/**
 * Names of every CHECK constraint, keyed by table. drizzle-kit push compares
 * CHECKs by name only (a changed expression is ignored on push) and drops any
 * the schema does not declare (gap #2388).
 */
export function declaredCheckNames(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const table of declaredTables()) {
    const config = getTableConfig(table);
    if (config.schema && config.schema !== "public") continue;
    const names = out.get(config.name) ?? new Set<string>();
    for (const c of config.checks) names.add(c.name);
    out.set(config.name, names);
  }
  return out;
}

/**
 * Every index declared with `index()` / `uniqueIndex()`, as name → table.
 * push drops any index on a declared table that is missing here, so
 * scripts/check-migrations.mjs compares this with the indexes the SQL
 * migrations leave live (unique CONSTRAINTS are covered by
 * declaredUniqueConstraints, not here).
 */
export function declaredIndexes(): Map<string, string> {
  const out = new Map<string, string>();
  for (const table of declaredTables()) {
    const config = getTableConfig(table);
    if (config.schema && config.schema !== "public") continue;
    for (const idx of config.indexes) {
      if (idx.config.name) out.set(idx.config.name, config.name);
    }
  }
  return out;
}


/** The exact DDL drizzle-kit would run for this constraint. */
export function addUniqueConstraintSql(c: DeclaredUniqueConstraint): string {
  const nulls = c.nullsNotDistinct ? " NULLS NOT DISTINCT" : "";
  return `ALTER TABLE ${quoteIdent(c.table)} ADD CONSTRAINT ${quoteIdent(c.name)} UNIQUE${nulls} (${c.columns.map(quoteIdent).join(", ")})`;
}
