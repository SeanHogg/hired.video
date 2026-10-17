/**
 * Migration hygiene gate (W1-D, architecture remediation 2026-10-17).
 *
 *   node --import tsx scripts/check-migrations.mjs            # CI gate
 *   node --import tsx scripts/check-migrations.mjs --update-baseline
 *
 * Fails (exit 1) on:
 *   1. A migration number shared by two files, other than the historical
 *      duplicates frozen in ALLOWED_SHARED_NUMBERS. The runner applies files by
 *      NAME in sort order, so a reused number silently reorders migrations.
 *   2. A .sql file in drizzle/ that does not start with a number. The runner
 *      only picks up `0*.sql`, so such a file NEVER runs.
 *   3. Index drift between the schema and the migrations, ratcheted against
 *      check-migrations.baseline.json (legacy drift is frozen there; the lists
 *      may only shrink):
 *        - schemaOnly:     declared in src/db/schema but no migration creates
 *                          it (a fresh database built from migrations alone
 *                          lacks it; push papers over it on deploy only).
 *        - migrationOnly:  a migration leaves it live on a push-managed table
 *                          but the schema does not declare it — `drizzle-kit
 *                          push` DROPS it on the next deploy and the runner
 *                          never re-creates it.
 *
 * Index replay is textual, per file in runner order and in textual order
 * within a file: CREATE [UNIQUE] INDEX adds, DROP INDEX removes, ALTER INDEX …
 * RENAME TO renames, DROP TABLE / SET SCHEMA archive / ALTER TABLE … RENAME
 * TO carry the table's indexes along. Indexes built with EXECUTE format(...)
 * inside DO blocks are invisible to it — that is what the baseline absorbs.
 *
 * Never renumber or edit an applied migration to satisfy this check; add a new
 * numbered migration instead.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { argv } from "node:process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(SCRIPT_DIR, "..", "drizzle");
const BASELINE_PATH = join(SCRIPT_DIR, "check-migrations.baseline.json");

/** Historical files that share a number — frozen; applied files are never renamed. */
export const ALLOWED_SHARED_NUMBERS = new Set([
  "0072", "0080", "0085", "0097", "0098", "0099", "0107", "0120", "0121", "0122",
  "0123", "0124", "0131", "0133", "0134", "0135", "0136", "0137", "0191",
]);

/** Historical unnumbered file — the runner never applied it; kept as-is. */
export const ALLOWED_UNNUMBERED = new Set(["add_saved_jobs_status.sql"]);

export function sqlFiles(dir = DRIZZLE_DIR) {
  return readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
}

/** Files whose number is shared with another file, minus the frozen history. */
export function duplicateNumberViolations(files, allowed = ALLOWED_SHARED_NUMBERS) {
  const byNumber = new Map();
  for (const f of files) {
    const m = /^(\d+)/.exec(f);
    if (!m) continue;
    const n = m[1];
    if (!byNumber.has(n)) byNumber.set(n, []);
    byNumber.get(n).push(f);
  }
  const out = [];
  for (const [n, list] of byNumber) {
    if (list.length > 1 && !allowed.has(n)) out.push(`${n}: ${list.join(", ")}`);
  }
  return out;
}

export function unnumberedViolations(files, allowed = ALLOWED_UNNUMBERED) {
  return files.filter((f) => !/^\d+/.test(f) && !allowed.has(f));
}

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const ID = String.raw`(?:"?[A-Za-z_][A-Za-z0-9_]*"?\.)?"?[A-Za-z_][A-Za-z0-9_]*"?`;
const ident = (raw) => raw.trim().replace(/"/g, "").split(".").pop().toLowerCase();
const EVENT_RE = new RegExp(
  [
    String.raw`\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?<createIdx>${ID})\s+ON\s+(?:ONLY\s+)?(?<onTable>${ID})`,
    String.raw`\bDROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?(?<dropIdx>${ID}(?:\s*,\s*${ID})*)`,
    String.raw`\bALTER\s+INDEX\s+(?:IF\s+EXISTS\s+)?(?<renIdx>${ID})\s+RENAME\s+TO\s+(?<renIdxTo>${ID})`,
    String.raw`\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?<dropTables>${ID}(?:\s*,\s*${ID})*)`,
    String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?<archTable>${ID})\s+SET\s+SCHEMA\s+"?archive"?`,
    String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?<renTable>${ID})\s+RENAME\s+TO\s+(?<renTableTo>${ID})`,
  ].join("|"),
  "gi",
);

/** Indexes left live after replaying the migrations: name → table. */
export function liveMigrationIndexes(files) {
  const live = new Map();
  for (const { sql } of files) {
    for (const m of stripComments(sql).matchAll(EVENT_RE)) {
      const g = m.groups;
      if (g.createIdx) {
        live.set(ident(g.createIdx), ident(g.onTable));
      } else if (g.dropIdx) {
        for (const n of g.dropIdx.split(",")) live.delete(ident(n));
      } else if (g.renIdx) {
        const t = live.get(ident(g.renIdx));
        live.delete(ident(g.renIdx));
        if (t) live.set(ident(g.renIdxTo), t);
      } else if (g.dropTables || g.archTable) {
        const gone = new Set((g.dropTables ?? g.archTable).split(",").map(ident));
        for (const [n, t] of live) if (gone.has(t)) live.delete(n);
      } else if (g.renTable) {
        const from = ident(g.renTable), to = ident(g.renTableTo);
        for (const [n, t] of live) if (t === from) live.set(n, to);
      }
    }
  }
  return live;
}

export function readMigrations(dir = DRIZZLE_DIR) {
  return readdirSync(dir)
    .filter((f) => /^0\d+.*\.sql$/.test(f))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
}

/** Both directions of index drift, restricted to push-managed tables. */
export function indexDrift(declared, live, declaredTables) {
  const schemaOnly = [...declared]
    .filter(([name]) => !live.has(name))
    .map(([name, table]) => `${table}.${name}`)
    .sort();
  const migrationOnly = [...live]
    .filter(([name, table]) => declaredTables.has(table) && !declared.has(name))
    .map(([name, table]) => `${table}.${name}`)
    .sort();
  return { schemaOnly, migrationOnly };
}

/** New entries (not in baseline) and stale baseline entries (now fixed). */
export function ratchet(current, baseline) {
  const base = new Set(baseline);
  const cur = new Set(current);
  return {
    added: current.filter((x) => !base.has(x)),
    stale: baseline.filter((x) => !cur.has(x)),
  };
}

async function main() {
  const failures = [];
  const files = sqlFiles();

  const dups = duplicateNumberViolations(files);
  if (dups.length) failures.push(`Migration numbers used by more than one file:\n${dups.map((d) => `  • ${d}`).join("\n")}`);

  const unnumbered = unnumberedViolations(files);
  if (unnumbered.length) {
    failures.push(
      `Unnumbered .sql files (the runner only applies 0*.sql — these never run):\n` +
        unnumbered.map((f) => `  • ${f}`).join("\n"),
    );
  }

  const catalog = await import("../src/db/schema-catalog.ts");
  const declared = catalog.declaredIndexes();
  const declaredTables = new Set(catalog.declaredTableNames());
  const live = liveMigrationIndexes(readMigrations());
  const drift = indexDrift(declared, live, declaredTables);

  if (argv.includes("--update-baseline")) {
    writeFileSync(BASELINE_PATH, JSON.stringify(drift, null, 2) + "\n");
    console.log(`Baseline written: schemaOnly=${drift.schemaOnly.length} migrationOnly=${drift.migrationOnly.length}`);
    return;
  }

  const baseline = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
    : { schemaOnly: [], migrationOnly: [] };
  for (const key of ["schemaOnly", "migrationOnly"]) {
    const { added, stale } = ratchet(drift[key], baseline[key] ?? []);
    if (added.length) {
      const fix = key === "schemaOnly"
        ? "add `CREATE INDEX IF NOT EXISTS <name> ON <table> (...)` to a new numbered migration"
        : "declare the index in src/db/schema/* under the same name, or DROP INDEX it in a new migration";
      failures.push(`Index drift (${key}) — ${fix}:\n${added.map((x) => `  • ${x}`).join("\n")}`);
    }
    if (stale.length) {
      console.warn(
        `check-migrations: ${stale.length} ${key} baseline entr${stale.length === 1 ? "y is" : "ies are"} fixed — ` +
          `run with --update-baseline to shrink the baseline:\n${stale.map((x) => `  • ${x}`).join("\n")}`,
      );
    }
  }

  console.log(
    `check-migrations: ${files.length} files, ${declared.size} declared indexes, ${live.size} migration indexes, ` +
      `drift schemaOnly=${drift.schemaOnly.length} migrationOnly=${drift.migrationOnly.length}`,
  );
  if (failures.length) {
    console.error("\n" + failures.join("\n\n"));
    process.exit(1);
  }
  console.log("check-migrations: OK");
}

if (fileURLToPath(import.meta.url) === argv[1]) {
  main().catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  });
}
