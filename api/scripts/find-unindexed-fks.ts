/**
 * Schema index audit (W1-D, 2026-10-17).
 *
 * Reads the Drizzle table objects (not the source text), so multi-line
 * `.references()` and table-level `foreignKey()` declarations are all seen, and
 * reports:
 *   1. FK columns with no index/unique/PK whose LEADING column is that FK
 *      (Postgres does not index FK columns; an unindexed FK means a seq scan on
 *      every parent delete/cascade and on every "children of X" read);
 *   2. tables with no secondary index at all;
 *   3. redundant indexes: a non-unique, non-partial index whose columns are a
 *      strict prefix of (or identical to) another non-partial index on the
 *      same table.
 *
 *   node --import tsx scripts/find-unindexed-fks.ts            # human report
 *   node --import tsx scripts/find-unindexed-fks.ts --json     # machine output
 *   node --import tsx scripts/find-unindexed-fks.ts --check    # exit 1 on any unindexed FK
 */
import { is, SQL, StringChunk, Column } from "drizzle-orm";
import { getTableConfig, PgTable, IndexedColumn } from "drizzle-orm/pg-core";
import { fileURLToPath } from "node:url";
import { argv } from "node:process";
import * as schema from "../src/db/schema/index.js";

export interface IndexShape {
  name: string;
  columns: string[];
  unique: boolean;
  partial: boolean;
  /** Leading column of a `WHERE <col> IS NOT NULL` partial — still serves
   *  every equality lookup / FK cascade on that column. */
  notNullOf: string | null;
  /** True when any column is an expression or the method is not btree
   *  (cannot be prefix-compared, does not serve FK equality lookups). */
  expression: boolean;
}

export interface UnindexedFk {
  table: string;
  column: string;
  references: string;
}

export interface RedundantIndex {
  table: string;
  index: string;
  coveredBy: string;
}

export interface AuditResult {
  tables: number;
  foreignKeys: number;
  unindexed: UnindexedFk[];
  tablesWithoutSecondaryIndex: string[];
  redundant: RedundantIndex[];
}

function tables(): PgTable[] {
  return (Object.values(schema) as unknown[]).filter((v): v is PgTable => is(v, PgTable));
}

/** Render a partial-index predicate to text (columns by name). */
function predicateText(where: SQL | undefined): string {
  if (!where) return "";
  return where.queryChunks
    .map((c) => (is(c, StringChunk) ? c.value.join("") : is(c, Column) ? c.name : is(c, SQL) ? predicateText(c) : ""))
    .join("");
}

/** Every leading-column-bearing structure on a table: indexes, uniques, PK. */
export function tableIndexes(table: PgTable): IndexShape[] {
  const cfg = getTableConfig(table);
  const out: IndexShape[] = [];
  for (const idx of cfg.indexes) {
    const c = idx.config;
    const cols: string[] = [];
    let expression = false;
    for (const col of c.columns) {
      if (is(col, IndexedColumn)) cols.push(col.name ?? "");
      else if (is(col, SQL)) { expression = true; cols.push("<expr>"); }
      else cols.push((col as { name?: string }).name ?? "<expr>");
    }
    if (c.method && c.method !== "btree") expression = true;
    const m = /^\s*"?([a-z0-9_]+)"?\s+IS\s+NOT\s+NULL\s*$/i.exec(predicateText(c.where));
    out.push({
      name: c.name ?? "<unnamed>", columns: cols, unique: c.unique, partial: !!c.where, expression,
      notNullOf: m && m[1] === cols[0] ? m[1] : null,
    });
  }
  for (const u of cfg.uniqueConstraints) {
    out.push({ name: u.getName(), columns: u.columns.map((x) => x.name), unique: true, partial: false, notNullOf: null, expression: false });
  }
  for (const col of cfg.columns) {
    if (col.primary) out.push({ name: `${cfg.name}_pkey`, columns: [col.name], unique: true, partial: false, notNullOf: null, expression: false });
    if (col.isUnique) out.push({ name: col.uniqueName ?? `${cfg.name}_${col.name}_unique`, columns: [col.name], unique: true, partial: false, notNullOf: null, expression: false });
  }
  for (const pk of cfg.primaryKeys) {
    out.push({ name: pk.getName(), columns: pk.columns.map((x) => x.name), unique: true, partial: false, notNullOf: null, expression: false });
  }
  return out;
}

export function audit(): AuditResult {
  const all = tables();
  const unindexed: UnindexedFk[] = [];
  const noSecondary: string[] = [];
  const redundant: RedundantIndex[] = [];
  let fkCount = 0;
  for (const table of all) {
    const cfg = getTableConfig(table);
    const idx = tableIndexes(table);
    // A partial index still serves FK lookups for the rows it covers, but not
    // cascades over the excluded rows — only non-partial ones count.
    const leading = new Set(
      idx.filter((i) => (!i.partial || i.notNullOf) && !i.expression).map((i) => i.columns[0]),
    );
    const seen = new Set<string>();
    for (const fk of cfg.foreignKeys) {
      const ref = fk.reference();
      const col = ref.columns[0]?.name;
      if (!col) continue;
      fkCount++;
      const key = ref.columns.map((c) => c.name).join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      if (!leading.has(col)) {
        unindexed.push({
          table: cfg.name,
          column: key,
          references: `${getTableConfig(ref.foreignTable).name}(${ref.foreignColumns.map((c) => c.name).join(",")})`,
        });
      }
    }
    if (cfg.indexes.length === 0 && cfg.uniqueConstraints.length === 0 && !cfg.columns.some((c) => c.isUnique)) {
      noSecondary.push(cfg.name);
    }
    const plain = cfg.indexes.map((i) => i.config);
    const shapes = idx.filter((i) => !i.partial && !i.expression);
    for (const [pos, i] of idx.entries()) {
      if (i.unique || i.partial || i.expression) continue;
      if (!plain.some((p) => p.name === i.name)) continue;
      const cover = shapes.find(
        (o, opos) => o.name !== i.name
          && o.columns.length >= i.columns.length
          && i.columns.every((c, n) => o.columns[n] === c)
          // Longer, unique, or an identical plain twin declared earlier.
          && (o.columns.length > i.columns.length || o.unique || idx.indexOf(o) < pos)
          && opos >= 0,
      );
      if (cover) redundant.push({ table: cfg.name, index: i.name, coveredBy: cover.name });
    }
  }
  unindexed.sort((a, b) => (a.table + a.column).localeCompare(b.table + b.column));
  return { tables: all.length, foreignKeys: fkCount, unindexed, tablesWithoutSecondaryIndex: noSecondary.sort(), redundant };
}

if (fileURLToPath(import.meta.url) === argv[1]) {
  const result = audit();
  if (argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`tables: ${result.tables}  foreign keys: ${result.foreignKeys}`);
    console.log(`\nFK columns without a leading index: ${result.unindexed.length}`);
    for (const u of result.unindexed) console.log(`  ${u.table}.${u.column} -> ${u.references}`);
    console.log(`\nTables with no secondary index: ${result.tablesWithoutSecondaryIndex.length}`);
    for (const t of result.tablesWithoutSecondaryIndex) console.log(`  ${t}`);
    console.log(`\nRedundant indexes (prefix of / identical to another): ${result.redundant.length}`);
    for (const r of result.redundant) console.log(`  ${r.table}.${r.index} (covered by ${r.coveredBy})`);
  }
  if (argv.includes("--check") && result.unindexed.length > 0) process.exit(1);
}
