/**
 * Migration lint — enforces the idempotent patterns documented in
 * api/drizzle/TEMPLATE.md. Gap #1643.
 *
 * Walks every `drizzle/0*.sql` file and flags:
 *
 *   (a) `pg_temp.` function definition or call — the migration runner
 *       uses Neon HTTP per-statement sessions; pg_temp doesn't survive.
 *       Always use `public.__mig_NNNN_*` named functions with
 *       `DROP FUNCTION IF EXISTS` at the end. (Pass-7 CI break.)
 *
 *   (b) `ALTER COLUMN … TYPE` not preceded (anywhere in the file) by a
 *       `data_type` lookup against information_schema.columns. Without
 *       that gate the second run plan-time-fails on the already-
 *       converted column. (Pass-6 CI break.)
 *
 *   (c) `ADD CONSTRAINT` not gated by a `pg_constraint` existence
 *       check. Postgres has no `IF NOT EXISTS` for ADD CONSTRAINT.
 *
 *   (d) `DROP COLUMN` / `DROP TABLE` without `IF EXISTS`.
 *
 * Exits 1 with a per-file report if any violations found. Run from CI
 * before run-sql-migrations.mjs so the build fails BEFORE we try to
 * apply a broken migration.
 *
 * Whitelist: a leading SQL comment `-- lint-disable: <rule>` on the
 * offending statement opts that statement out. Use sparingly with a
 * justification in the comment.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(SCRIPT_DIR, "..", "drizzle");

/** Strip block + line comments so we don't false-positive on patterns
 *  in comment text. Mirror of the runner's phase-1 strip but simpler —
 *  we don't preserve strings because the patterns we check don't
 *  appear in string literals in practice. */
function stripComments(sql) {
  // Block comments
  let out = sql.replace(/\/\*[\s\S]*?\*\//g, "");
  // Line comments (but keep the newline so line numbers stay aligned)
  out = out.replace(/--[^\n]*/g, "");
  return out;
}

function lintFile(name, raw) {
  const violations = [];
  const stripped = stripComments(raw);

  if (/\bpg_temp\.\w+/.test(stripped)) {
    violations.push(
      "pg_temp functions don't survive Neon HTTP per-statement sessions. " +
      "Use public.__mig_NNNN_* and DROP at end. See TEMPLATE.md."
    );
  }

  // (b) ALTER COLUMN … TYPE without a data_type information_schema gate
  // anywhere in the file. Either ordering of `data_type` + `information
  // _schema.columns` qualifies — Postgres SELECT puts data_type first,
  // pg_attribute joins put information_schema first.
  const hasAlterColumnType = /\bALTER\s+COLUMN\b[\s\S]{0,200}\bTYPE\b/i.test(stripped);
  const hasDataTypeGate =
    /\bdata_type\b/i.test(stripped) && /\binformation_schema\.columns\b/i.test(stripped);
  if (hasAlterColumnType && !hasDataTypeGate) {
    violations.push(
      "ALTER COLUMN … TYPE without an information_schema.columns.data_type " +
      "gate. See TEMPLATE.md §canonical patterns."
    );
  }

  // (c) ADD CONSTRAINT … without a pg_constraint existence check anywhere
  // in the file. Wrap each ADD CONSTRAINT in a DO block guarded by a
  // pg_constraint.conname SELECT per TEMPLATE.md.
  const hasAddConstraint = /\bADD\s+CONSTRAINT\b/i.test(stripped);
  const hasConstraintGate =
    /\bpg_constraint\b/i.test(stripped) && /\bconname\b/i.test(stripped);
  if (hasAddConstraint && !hasConstraintGate) {
    violations.push(
      "ADD CONSTRAINT without a pg_constraint.conname existence check. " +
      "Wrap in DO block per TEMPLATE.md."
    );
  }

  // (d) DROP COLUMN / DROP TABLE without IF EXISTS. Match `DROP COLUMN`
  // not followed by `IF EXISTS` within 30 chars.
  const dropColumnRe = /\bDROP\s+COLUMN\b(?![\s\S]{0,30}IF\s+EXISTS)/i;
  if (dropColumnRe.test(stripped)) {
    violations.push("DROP COLUMN without IF EXISTS.");
  }
  const dropTableRe = /\bDROP\s+TABLE\b(?![\s\S]{0,30}IF\s+EXISTS)/i;
  if (dropTableRe.test(stripped)) {
    violations.push("DROP TABLE without IF EXISTS.");
  }

  return violations;
}

function main() {
  const files = readdirSync(DRIZZLE_DIR)
    .filter((f) => /^0\d+.*\.sql$/.test(f))
    .sort();

  let failed = 0;
  for (const f of files) {
    const raw = readFileSync(join(DRIZZLE_DIR, f), "utf8");
    const vios = lintFile(f, raw);
    if (vios.length > 0) {
      failed++;
      console.error(`✗ ${f}`);
      for (const v of vios) console.error(`    ${v}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} migration file(s) violate the TEMPLATE.md rules.`);
    process.exit(1);
  }
  console.log(`migration lint OK (${files.length} files scanned)`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
