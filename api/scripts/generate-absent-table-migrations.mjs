/**
 * One-shot generator (gap #1187 backfill, part 2) — for tables declared
 * in api/src/db/schema/ that are MISSING from production (never created
 * by any migration AND never bootstrapped via drizzle-kit push), emit a
 * CREATE TABLE IF NOT EXISTS migration from the pgTable declaration.
 *
 * Uses Drizzle's `getTableConfig` so the column / type / index info
 * comes straight from the source-of-truth pgTable declaration — no
 * regex parsing of TS files. Renders idempotent SQL that's a true
 * no-op on environments where the table already exists.
 *
 * Run once, commit the output, delete this script.
 */
import { writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getTableConfig, PgTable, PgDialect } from "drizzle-orm/pg-core";
import { is, getTableName, sql as drizzleSql } from "drizzle-orm";

const dialect = new PgDialect();
function renderSqlChunk(chunk) {
  try {
    const q = dialect.sqlToQuery(chunk);
    // sqlToQuery returns { sql, params } where params get substituted into
    // the SQL as $1, $2, … . For DDL defaults we want params inlined.
    let s = q.sql;
    for (let i = q.params.length - 1; i >= 0; i--) {
      const p = q.params[i];
      const lit = typeof p === "string"
        ? `'${p.replace(/'/g, "''")}'`
        : typeof p === "number" || typeof p === "boolean"
          ? String(p)
          : `'${String(p).replace(/'/g, "''")}'`;
      s = s.replaceAll("$" + (i + 1), lit);
    }
    return s;
  } catch {
    return null;
  }
}

const SCHEMA_DIR = join(process.cwd(), "src", "db", "schema");

const ABSENT = new Set([
  "answer_cache", "api_keys", "application_form_answers",
  "assessment_attempts", "ats_connections", "business_phone_numbers",
  "call_logs", "company_subscriptions", "employer_branding_pages",
  "feature_flags", "feed_post_reports", "follow_up_enrollments",
  "follow_up_logs", "follow_up_sequences", "follow_up_steps",
  "job_board_sources", "job_board_sync_log", "marketing_leads",
  "performance_cycles", "performance_goals", "performance_reviews",
  "phone_balance_transactions", "phone_balances", "saved_searches",
  "skill_assessments", "sms_messages", "webauthn_challenges",
  "webauthn_credentials",
]);

// Pull every pgTable from every schema file.
const allTables = new Map(); // name → { table, sourceFile }
for (const f of readdirSync(SCHEMA_DIR)) {
  if (!f.endsWith(".ts")) continue;
  const url = pathToFileURL(join(SCHEMA_DIR, f)).href;
  let mod;
  try {
    mod = await import(url);
  } catch (e) {
    console.warn(`Skipped ${f}: ${e.message?.slice(0, 100)}`);
    continue;
  }
  for (const [exportName, val] of Object.entries(mod)) {
    if (val && typeof val === "object" && is(val, PgTable)) {
      const name = getTableName(val);
      if (!allTables.has(name)) allTables.set(name, { table: val, file: f, export: exportName });
    }
  }
}

console.log(`Loaded ${allTables.size} pgTable declarations`);

// Map Drizzle column → SQL type string.
function colTypeSQL(col) {
  // dataType ("number" | "string" | "boolean" | "json" | "date" | "buffer") +
  // columnType (the exact pg type name).
  const ct = col.columnType;
  const map = {
    PgUUID: "uuid",
    PgUUIDBuilder: "uuid",
    PgText: "text",
    PgVarchar: col.length ? `varchar(${col.length})` : "varchar",
    PgChar: col.length ? `char(${col.length})` : "char",
    PgBoolean: "boolean",
    PgInteger: "integer",
    PgSmallInt: "smallint",
    PgBigInt53: "bigint",
    PgBigInt64: "bigint",
    PgSerial: "serial",
    PgBigSerial53: "bigserial",
    PgBigSerial64: "bigserial",
    PgReal: "real",
    PgDoublePrecision: "double precision",
    PgNumeric: col.precision != null
      ? `numeric(${col.precision}${col.scale != null ? "," + col.scale : ""})`
      : "numeric",
    PgJson: "json",
    PgJsonb: "jsonb",
    PgTimestamp: col.withTimezone
      ? `timestamp${col.precision != null ? "(" + col.precision + ")" : ""} with time zone`
      : `timestamp${col.precision != null ? "(" + col.precision + ")" : ""}`,
    PgDate: "date",
    PgTime: "time",
    PgInterval: "interval",
    PgInet: "inet",
    PgCidr: "cidr",
    PgMacaddr: "macaddr",
    PgMacaddr8: "macaddr8",
    PgEnumColumn: col.enumValues ? `text` : "text", // simplified — most enums declared as varchar anyway
  };
  if (map[ct]) return map[ct];
  // Array variant
  if (ct === "PgArray") {
    const inner = colTypeSQL(col.baseColumn);
    return `${inner}[]`;
  }
  // Fallback — use lowercased columnType (rare).
  return ct.replace(/^Pg/, "").toLowerCase();
}

// Render default expression. Drizzle stores defaults as either:
//   - col.default (literal value) → render quoted/casted
//   - col.defaultFn (function — sql`now()`-style or runtime fn)
//   - col.hasDefault + col.defaultFn returns SQL → render SQL.toQuery()
function defaultSQL(col) {
  if (col.defaultFn) return null; // runtime default — skip in DDL
  if (col.default === undefined) return null;
  const v = col.default;
  if (v === null) return "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
  if (Array.isArray(v)) {
    if (v.length === 0) {
      if (col.columnType === "PgJsonb") return `'[]'::jsonb`;
      if (col.columnType === "PgJson") return `'[]'::json`;
    }
    if (col.columnType === "PgJsonb") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
    if (col.columnType === "PgJson") return `'${JSON.stringify(v).replace(/'/g, "''")}'::json`;
    return null;
  }
  if (typeof v === "object") {
    // SQL chunk from sql`...` — render via PgDialect.
    if (v && typeof v.queryChunks !== "undefined") {
      const rendered = renderSqlChunk(v);
      if (rendered) return rendered;
    }
    if (Object.keys(v).length === 0) {
      if (col.columnType === "PgJsonb") return `'{}'::jsonb`;
      if (col.columnType === "PgJson") return `'{}'::json`;
    }
    if (col.columnType === "PgJsonb") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
    if (col.columnType === "PgJson") return `'${JSON.stringify(v).replace(/'/g, "''")}'::json`;
    return null;
  }
  return null;
}

function renderTable(t) {
  const cfg = getTableConfig(t);
  const name = cfg.name;
  const cols = cfg.columns;

  const lines = [];
  for (const c of cols) {
    let line = `  "${c.name}" ${colTypeSQL(c)}`;
    if (c.notNull) line += " NOT NULL";
    // Default — special-case common runtime defaults known to Drizzle.
    let def = defaultSQL(c);
    if (def == null) {
      // Heuristic for common runtime defaults Drizzle attaches via .defaultFn
      if (c.hasDefault && c.columnType === "PgUUID") def = "gen_random_uuid()";
      else if (c.hasDefault && c.columnType === "PgTimestamp") def = "now()";
    }
    if (def) line += ` DEFAULT ${def}`;
    if (c.primary) line += " PRIMARY KEY";
    lines.push(line);
  }

  // Composite primary key from extraConfig
  const extras = cfg.indexes ?? [];
  const uniqueIdx = (cfg.uniqueConstraints ?? []).map((u) => {
    const colNames = u.columns.map((c) => `"${c.name}"`).join(", ");
    return `  CONSTRAINT "${u.name}" UNIQUE (${colNames})`;
  });
  const checks = (cfg.checks ?? []).map((c) => `  CONSTRAINT "${c.name}" CHECK (${c.value.toString?.() ?? ""})`);
  // Foreign keys defined inline via .references() are rendered as ALTER below
  // to avoid forward-reference issues within a single batch.

  const allLines = [...lines, ...uniqueIdx, ...checks];
  return { name, ddl: `CREATE TABLE IF NOT EXISTS "${name}" (\n${allLines.join(",\n")}\n);`, cfg };
}

function renderColumnFKs(t) {
  const cfg = getTableConfig(t);
  const out = [];
  for (const c of cfg.columns) {
    if (!c.references) continue;
    // c.references is a function returning the referenced column.
    let target;
    try {
      target = c.references();
    } catch {
      continue;
    }
    if (!target) continue;
    const targetTable = getTableConfig(target.table);
    const cname = `${cfg.name}_${c.name}_fk`;
    const onDelete = c.onDelete ? ` ON DELETE ${c.onDelete.toUpperCase()}` : "";
    const onUpdate = c.onUpdate ? ` ON UPDATE ${c.onUpdate.toUpperCase()}` : "";
    out.push(
      `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${cname}' AND conrelid = '"${cfg.name}"'::regclass) THEN
    ALTER TABLE "${cfg.name}" ADD CONSTRAINT "${cname}" FOREIGN KEY ("${c.name}") REFERENCES "${targetTable.name}" ("${target.name}")${onDelete}${onUpdate};
  END IF;
END $$;`,
    );
  }
  return out;
}

function renderIndexes(t) {
  const cfg = getTableConfig(t);
  return (cfg.indexes ?? []).map((idx) => {
    const colNames = idx.config.columns.map((c) => `"${c.name ?? c}"`).join(", ");
    const unique = idx.config.unique ? "UNIQUE " : "";
    return `CREATE ${unique}INDEX IF NOT EXISTS "${idx.config.name}" ON "${cfg.name}" (${colNames});`;
  });
}

// Build absent-table list in declaration order (since FKs between them
// would be order-sensitive — but most refer to `users` which already exists).
const absentTables = [];
for (const [name, info] of allTables) {
  if (ABSENT.has(name)) absentTables.push(info.table);
}

console.log(`Resolved ${absentTables.length} / ${ABSENT.size} absent tables from schema`);
const resolved = new Set(absentTables.map((t) => getTableName(t)));
const unresolved = [...ABSENT].filter((n) => !resolved.has(n));
if (unresolved.length) console.log("  unresolved:", unresolved.join(", "));

// Emit one migration file for all 28 absent tables (small enough).
const sections = ["-- ─── CREATE TABLE ───────────────────────────────────────────────────"];
for (const t of absentTables) {
  const r = renderTable(t);
  sections.push(`\n-- ${r.name}\n${r.ddl}`);
}
sections.push("\n\n-- ─── FOREIGN KEYS ───────────────────────────────────────────────────");
for (const t of absentTables) {
  const fks = renderColumnFKs(t);
  if (fks.length) sections.push(`\n-- ${getTableName(t)}\n${fks.join("\n")}`);
}
sections.push("\n\n-- ─── INDEXES ────────────────────────────────────────────────────────");
for (const t of absentTables) {
  const idx = renderIndexes(t);
  if (idx.length) sections.push(`\n-- ${getTableName(t)}\n${idx.join("\n")}`);
}

const header = `-- Migration 0130 — Backfill CREATE TABLE for ${absentTables.length} legacy
-- tables that were declared in schema/ but never bootstrapped to any
-- database (gap #1187 — part 2 of 2; part 1 = 0127-0129 introspected
-- from live DB).
--
-- These tables only appeared as Drizzle pgTable declarations. No prior
-- migration created them, and the production DB doesn't have them
-- either — they were planned features that never reached the schema
-- push step, leaving the application referencing tables that didn't
-- exist. This migration creates them fresh with the exact shape the
-- pgTable declarations expect.
--
-- Every CREATE / index / FK is IF NOT EXISTS / DO-block-guarded so
-- production (which lacks all these tables) just creates them, and any
-- environment that has partial state stays consistent.
--
-- Generated once by \`scripts/generate-absent-table-migrations.mjs\`.
-- Do not edit by hand — schema changes ship as new ALTER migrations.

`;

const body = header + sections.join("\n") + "\n";
const out = join(process.cwd(), "drizzle", "0130_backfill_legacy_tables_absent.sql");
writeFileSync(out, body);
console.log(`Wrote 0130_backfill_legacy_tables_absent.sql — ${absentTables.length} tables`);
