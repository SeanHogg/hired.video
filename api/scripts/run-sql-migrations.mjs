/**
 * SQL migration runner — applies every drizzle/0*.sql file via the neon
 * HTTP client.
 *
 * Split the problem properly:
 *   1. Strip block + line comments (but not comments INSIDE strings).
 *   2. Walk the SQL character by character, tracking when we're inside a
 *      single-quoted string ('...') or a dollar-quoted string ($$...$$ or
 *      $tag$...$tag$). Only top-level semicolons split statements. Earlier
 *      migrations used a naive `split(';')` which shattered:
 *        • Semicolons inside `-- comments` (0022 sentiment_score)
 *        • Semicolons inside `DO $$ BEGIN ... END $$` blocks (0008 voice
 *          clone constraint).
 *      Both silently "passed" CI for weeks.
 *
 * Error handling:
 *   • "already exists" errors are expected (migrations are idempotent with
 *     IF NOT EXISTS / IF NOT EXISTS semantics).
 *   • Any other error aborts the script with exit code 1 so CI fails loud.
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

async function runFile(sql, path) {
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
  console.log(`${path}: ${ok} applied, ${skip} already existed, ${err} errors`);
  return err;
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NEON_DB_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const sql = neon(url);

  const files = readdirSync(DRIZZLE_DIR)
    .filter((f) => /^0\d+.*\.sql$/.test(f))
    .sort();

  let totalErr = 0;
  for (const f of files) {
    const errs = await runFile(sql, join(DRIZZLE_DIR, f));
    totalErr += errs;
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
