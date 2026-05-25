/**
 * SQL migration runner — applies pending drizzle/0*.sql files via the
 * neon HTTP client.
 *
 * Statement splitter (`splitSqlStatements`):
 *   1. Strip block + line comments (but NOT comments inside string
 *      literals).
 *   2. Walk character by character tracking single-quoted strings
 *      (`'...'`) and dollar-quoted strings (`$$...$$` or `$tag$...$tag$`).
 *      Only top-level semicolons split statements.
 *   Earlier versions used a naive `split(';')` which shattered:
 *     • Semicolons inside `-- line comments` (0022 sentiment_score)
 *     • Semicolons inside `DO $$ BEGIN ... END $$` blocks (0008 voice
 *       clone constraint)
 *   Both silently "passed" CI for weeks. Every bug we hit has a
 *   regression test in run-sql-migrations.test.mjs.
 *
 * Applied-migration tracking (gap #1220):
 *   The runner tracks which migration files have already been applied
 *   in a runner-owned `_sql_migrations` table. Each file runs at most
 *   ONCE per database, end of story — no replay, no `IF NOT EXISTS`
 *   defensive layer needed for correctness on subsequent deploys.
 *
 *   A file is recorded as applied only when EVERY statement in it ran
 *   without error. A partial application is retried on the next deploy
 *   so the remaining work can complete (this is why the runner doesn't
 *   abort on the first error in a file — it continues so subsequent
 *   independent statements still get a chance to land).
 *
 *   Transition behaviour: on the first deploy after this change ships,
 *   `_sql_migrations` is empty so every existing file is treated as
 *   pending and runs once. Existing migrations are written to be safe
 *   under replay (most use IF NOT EXISTS / ON CONFLICT DO NOTHING), so
 *   the transition deploy behaves identically to the previous "replay
 *   everything" runner. On every deploy after the transition, only
 *   genuinely-new migrations run.
 *
 *   The tracking table is created by the runner — it never appears in
 *   any migration .sql file and therefore stays invisible to the
 *   schema-parity test in migration-schema-parity.test.mjs.
 *
 * Error handling:
 *   • "already exists" errors are tolerated and counted as `skip` —
 *     legacy migrations exist where two paths could create the same
 *     object and the second arrival is genuinely a no-op.
 *   • Any other error from any statement increments the per-file `err`
 *     count and prevents the file from being recorded as applied. If
 *     any file finishes with err > 0, the runner exits 1 so CI fails
 *     loud.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const DRIZZLE_DIR = join(process.cwd(), "drizzle");

/** Parse a SQL text into an array of top-level statements. Respects:
 *  • `-- line comments` (stripped per-line)
 *  • `/* block comments * /` (stripped)
 *  • `'single-quoted strings'` (preserved, `''` escaping supported)
 *  • `$$dollar-quoted$$` and `$tag$dollar-quoted$tag$` blocks (preserved)
 */
export function splitSqlStatements(sqlText) {
  // Phase 1 — strip comments that are NOT inside a string literal.
  // We do this by walking the text with minimal state.
  let stripped = "";
  let i = 0;
  const n = sqlText.length;
  while (i < n) {
    const c = sqlText[i];
    const c2 = sqlText[i + 1];

    // Block comment
    if (c === "/" && c2 === "*") {
      const end = sqlText.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    // Line comment
    if (c === "-" && c2 === "-") {
      const nl = sqlText.indexOf("\n", i + 2);
      i = nl === -1 ? n : nl; // leave the newline so line counts are preserved
      continue;
    }
    // Single-quoted string — copy through verbatim
    if (c === "'") {
      stripped += c;
      i++;
      while (i < n) {
        stripped += sqlText[i];
        if (sqlText[i] === "'" && sqlText[i + 1] === "'") {
          stripped += sqlText[i + 1];
          i += 2;
          continue;
        }
        if (sqlText[i] === "'") { i++; break; }
        i++;
      }
      continue;
    }
    // Dollar-quoted string — copy through verbatim, matching the tag
    if (c === "$") {
      const tagMatch = sqlText.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (tagMatch) {
        const tag = tagMatch[0]; // includes the $...$
        stripped += tag;
        i += tag.length;
        const close = sqlText.indexOf(tag, i);
        if (close === -1) {
          // Unterminated — include the rest and stop.
          stripped += sqlText.slice(i);
          i = n;
        } else {
          stripped += sqlText.slice(i, close + tag.length);
          i = close + tag.length;
        }
        continue;
      }
    }
    stripped += c;
    i++;
  }

  // Phase 2 — split `stripped` on `;` at top level, re-tracking strings so
  // we don't split inside a string (we preserved them in phase 1).
  const statements = [];
  let buf = "";
  let j = 0;
  const m = stripped.length;
  while (j < m) {
    const c = stripped[j];
    // Single-quoted string
    if (c === "'") {
      buf += c;
      j++;
      while (j < m) {
        buf += stripped[j];
        if (stripped[j] === "'" && stripped[j + 1] === "'") { buf += stripped[j + 1]; j += 2; continue; }
        if (stripped[j] === "'") { j++; break; }
        j++;
      }
      continue;
    }
    // Dollar-quoted string
    if (c === "$") {
      const tagMatch = stripped.slice(j).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (tagMatch) {
        const tag = tagMatch[0];
        buf += tag;
        j += tag.length;
        const close = stripped.indexOf(tag, j);
        if (close === -1) { buf += stripped.slice(j); j = m; }
        else { buf += stripped.slice(j, close + tag.length); j = close + tag.length; }
        continue;
      }
    }
    if (c === ";") {
      const trimmed = buf.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      buf = "";
      j++;
      continue;
    }
    buf += c;
    j++;
  }
  const tail = buf.trim();
  if (tail.length > 0) statements.push(tail);
  return statements;
}

/** Ensure the runner's tracking table exists. Idempotent — safe to call
 *  on every invocation. The table lives in the public schema and is
 *  intentionally underscore-prefixed so it sorts away from product
 *  tables in any pg_dump or admin tool.
 */
async function ensureMigrationsTable(sql) {
  await sql(`CREATE TABLE IF NOT EXISTS "_sql_migrations" (
    "name"       text PRIMARY KEY,
    "applied_at" timestamptz NOT NULL DEFAULT now()
  )`);
}

/** Load the set of migration filenames already applied to this database.
 *  Returned as a Set<string> so the runner can do O(1) `has()` checks.
 */
async function loadAppliedSet(sql) {
  const rows = await sql(`SELECT "name" FROM "_sql_migrations"`);
  return new Set(rows.map((r) => r.name));
}

async function recordApplied(sql, name) {
  await sql`INSERT INTO "_sql_migrations" ("name") VALUES (${name}) ON CONFLICT DO NOTHING`;
}

async function runFile(sql, name, path) {
  const raw = readFileSync(path, "utf8");
  const stmts = splitSqlStatements(raw);
  let ok = 0, skip = 0, err = 0;
  for (const s of stmts) {
    try {
      await sql(s);
      ok++;
    } catch (e) {
      const msg = e?.message ?? String(e);
      if (msg.includes("already exists")) {
        skip++;
      } else {
        err++;
        console.error(`ERR in ${path}:`, msg.slice(0, 240));
        console.error(`  stmt: ${s.slice(0, 200).replace(/\s+/g, " ")}`);
      }
    }
  }
  // A file is only marked applied when every statement ran cleanly.
  // Partial applications stay pending so the next deploy retries the
  // tail. Idempotent statements (CREATE … IF NOT EXISTS, ALTER … ADD
  // COLUMN IF NOT EXISTS, INSERT … ON CONFLICT DO NOTHING) safely
  // re-execute their already-landed half on the retry.
  if (err === 0) {
    await recordApplied(sql, name);
    console.log(`${path}: ${ok} applied, ${skip} already existed, 0 errors → recorded`);
  } else {
    console.log(`${path}: ${ok} applied, ${skip} already existed, ${err} errors`);
  }
  return err;
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NEON_DB_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const sql = neon(url);
  await ensureMigrationsTable(sql);
  const applied = await loadAppliedSet(sql);

  const files = readdirSync(DRIZZLE_DIR)
    .filter((f) => /^0\d+.*\.sql$/.test(f))
    .sort();

  let totalErr = 0;
  let skippedFiles = 0;
  for (const f of files) {
    if (applied.has(f)) {
      skippedFiles++;
      continue;
    }
    const errs = await runFile(sql, f, join(DRIZZLE_DIR, f));
    totalErr += errs;
  }
  if (skippedFiles > 0) {
    console.log(`\n${skippedFiles} migration file(s) skipped (already applied per _sql_migrations).`);
  }

  if (totalErr > 0) {
    console.error(`\n${totalErr} migration error(s) — failing the build.`);
    process.exit(1);
  }
  console.log("\nAll migrations OK");
}

// Only auto-run when invoked as `node scripts/run-sql-migrations.mjs` —
// imports for testing must not kick off the migration.
import { fileURLToPath } from "node:url";
import { argv } from "node:process";
if (fileURLToPath(import.meta.url) === argv[1]) {
  main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
}
