/**
 * Regression tests for the migration system + the editorial / affiliate
 * fixes shipped 2026-05-24 → 2026-05-25.
 *
 * Why this file exists:
 *   We hit a P1 deploy failure (gap #1186) where `affiliate_link_clicks`
 *   was declared in Drizzle but had no `CREATE TABLE` in api/drizzle/.
 *   The first deploy that referenced the table from another migration
 *   errored on "relation does not exist". Investigation showed the
 *   problem was wider — six affiliate tables had drifted, and ~100 more
 *   `pgTable(...)` declarations across the schema have no
 *   `CREATE TABLE` SQL either (the schema was originally bootstrapped
 *   by an out-of-tree `drizzle-kit push`).
 *
 * Strategy: ratchet. The test snapshots the *current* set of pgTables
 * known to be missing a `CREATE TABLE` migration (gap #1187 — full
 * backfill is tracked separately). The test fails LOUD when:
 *   • A new pgTable is added without a CREATE TABLE migration.
 *   • A table that was on the drift baseline now has a migration —
 *     remove it from the baseline below.
 *   • The 3 fixes from this session regress.
 *
 * Run: `npm test` (already wired via the api/package.json `test` script
 * — node --test scripts/*.test.mjs).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = join(__dirname, "..");
const SCHEMA_DIR = join(API_ROOT, "src/db/schema");
const DRIZZLE_DIR = join(API_ROOT, "drizzle");

/** Parse every `pgTable("name", ...)` declaration across the schema dir. */
function readPgTables() {
  const files = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".ts"));
  const names = new Set();
  for (const f of files) {
    const text = readFileSync(join(SCHEMA_DIR, f), "utf8");
    for (const m of text.matchAll(/pgTable\(\s*"([a-z][a-z0-9_]*)"/g)) {
      names.add(m[1]);
    }
  }
  return names;
}

/** Strip `-- line comments` from SQL so we don't pick up CREATE TABLE
 *  mentions in prose. Block comments `/* ... * /` are also stripped. */
function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/^[ \t]*--.*$/gm, "")    // line comments
    .replace(/[ \t]+--.*$/gm, "");    // trailing line comments
}

/** Parse every `CREATE TABLE [IF NOT EXISTS] [schema.]"name"` across migrations. */
function readCreatedTables() {
  const files = readdirSync(DRIZZLE_DIR).filter((f) => f.endsWith(".sql"));
  const names = new Set();
  const createRe = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:"?[a-z_][a-z0-9_]*"?\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  // Scratch tables that exist only inside a single migration (created
  // then RENAMEd to their permanent name, e.g. the job_items rebuild
  // pattern in 0122c_job_items_rebuild.sql) shouldn't count as orphans
  // since they never persist past the migration.
  const renameRe = /ALTER\s+TABLE\s+(?:"?[a-z_][a-z0-9_]*"?\.)?"?([a-z_][a-z0-9_]*)"?\s+RENAME\s+TO\s+"?([a-z_][a-z0-9_]*)"?/gi;
  for (const f of files) {
    const text = stripSqlComments(readFileSync(join(DRIZZLE_DIR, f), "utf8"));
    const renamedAway = new Set();
    for (const m of text.matchAll(renameRe)) renamedAway.add(m[1].toLowerCase());
    for (const m of text.matchAll(createRe)) {
      const name = m[1].toLowerCase();
      if (!renamedAway.has(name)) names.add(name);
    }
  }
  return names;
}

/** Read every migration body once, joined — cheap content checks. */
function readAllMigrationsText() {
  const files = readdirSync(DRIZZLE_DIR).filter((f) => f.endsWith(".sql")).sort();
  return Object.fromEntries(
    files.map((f) => [f, readFileSync(join(DRIZZLE_DIR, f), "utf8")]),
  );
}

// ─── Drift baseline (gap #1187) — CLOSED 2026-05-25 ───────────────────
// Every legacy table that used to live here now has a CREATE TABLE
// migration in api/drizzle/ — introspected from production into
// 0127-0129 (75 live tables) + generated from pgTable declarations into
// 0130 (28 absent-from-prod tables). The empty set below keeps the
// regression test wired but enforces "every pgTable needs a CREATE
// TABLE migration, no exceptions" going forward.
const KNOWN_MISSING_CREATE_TABLE = new Set([]);

// ─── Test suite ────────────────────────────────────────────────────────

describe("schema ↔ migration parity (gap #1186 regression)", () => {
  it("every pgTable either has a CREATE TABLE migration or is in the known-missing baseline", () => {
    const declared = readPgTables();
    const created = readCreatedTables();
    const missing = [...declared].filter((t) => !created.has(t));
    const newDrift = missing.filter((t) => !KNOWN_MISSING_CREATE_TABLE.has(t));
    assert.deepEqual(
      newDrift,
      [],
      `New pgTable(s) declared without a CREATE TABLE migration in api/drizzle/:\n` +
        newDrift.map((t) => `  • ${t}`).join("\n") +
        `\n\nFix: add CREATE TABLE IF NOT EXISTS "<name>" (...) to a new migration ` +
        `file. Do NOT add the table to KNOWN_MISSING_CREATE_TABLE — that list is ` +
        `frozen baseline debt tracked in gap #1187.`,
    );
  });

  it("baseline drift list shrinks but never grows — entries with migrations must be removed", () => {
    const created = readCreatedTables();
    const stale = [...KNOWN_MISSING_CREATE_TABLE].filter((t) => created.has(t));
    assert.deepEqual(
      stale,
      [],
      `Table(s) on the KNOWN_MISSING_CREATE_TABLE baseline now have a CREATE TABLE ` +
        `migration. Remove them from the baseline in this file so the test enforces ` +
        `the migration stays:\n` +
        stale.map((t) => `  • ${t}`).join("\n"),
    );
  });

  it("every CREATE TABLE in a migration corresponds to a pgTable declaration (no orphan tables)", () => {
    const declared = readPgTables();
    const created = readCreatedTables();
    // Tables present in migrations but not in Drizzle. Most are legacy /
    // pre-refactor leftovers: the table was created, the entity was later
    // refactored away from Drizzle (rolled into a polymorphic surface, or
    // accessed via raw SQL), but no `DROP TABLE` migration was issued.
    // Tracked as gap #1189 (inverse-drift backfill). Do not grow this set
    // for new tables — every new CREATE TABLE should land alongside a
    // matching `pgTable(...)` declaration.
    const ALLOWED_ORPHANS = new Set([
      // Polymorphic refactors — replaced by `reviews` table (see 0032_polymorphic_reviews.sql).
      "promo_project_reviews",
      "company_reviews",
      // Sourced-people pipeline ripped out in 0054 (moved to BurnRateOS — see project_contact_sourcing_burnrateos.md).
      "sourced_people",
      "sourced_person_merge_log",
      "person_identifiers",
      "person_sources",
      "enrichment_cache",
      // Privacy compliance surfaces — managed via raw SQL in services/user/account.ts.
      "data_subject_requests",
      "data_suppression_list",
    ]);
    const orphans = [...created]
      .filter((t) => !declared.has(t))
      .filter((t) => !ALLOWED_ORPHANS.has(t));
    assert.deepEqual(
      orphans,
      [],
      `Migration creates table(s) with no matching pgTable declaration in ` +
        `api/src/db/schema/:\n` +
        orphans.map((t) => `  • ${t}`).join("\n"),
    );
  });
});

describe("migration 0112 — affiliate_link_clicks guard (gap #1186 regression)", () => {
  const migrations = readAllMigrationsText();
  const sql = migrations["0112_sector_taxonomy.sql"];

  it("0112 exists", () => {
    assert.ok(sql, "0112_sector_taxonomy.sql is missing");
  });

  it("0112 wraps affiliate_link_clicks ALTER + INDEX in a DO-block table-exists guard", () => {
    // The guard must precede the ALTER, not be omitted.
    assert.match(
      sql,
      /DO\s+\$migration\$\s*BEGIN[\s\S]*pg_tables[\s\S]*'affiliate_link_clicks'[\s\S]*ALTER TABLE "affiliate_link_clicks"[\s\S]*CREATE INDEX[\s\S]*idx_affiliate_link_clicks_sector[\s\S]*END\s+\$migration\$/,
      "0112 must wrap the affiliate_link_clicks ALTER + INDEX in a DO $migration$ block " +
        "that gates on `pg_tables` (see 0085_studio_analytics_project_keyed.sql for the pattern).",
    );
  });

  it("0112 must NOT have a bare top-level ALTER TABLE on affiliate_link_clicks outside the guard", () => {
    // Strip the DO block so we can confirm the ALTER doesn't also live outside it.
    const stripped = sql.replace(/DO\s+\$migration\$[\s\S]*?END\s+\$migration\$;?/g, "");
    assert.doesNotMatch(
      stripped,
      /ALTER TABLE "affiliate_link_clicks"/,
      "An ALTER TABLE on affiliate_link_clicks must only appear inside the DO-block guard.",
    );
  });
});

describe("migration 0113 — 'So You Want to Become a...' editorial seed", () => {
  const migrations = readAllMigrationsText();
  const sql = migrations["0113_so_you_want_to_become_articles.sql"];

  it("0113 exists", () => {
    assert.ok(sql, "0113_so_you_want_to_become_articles.sql is missing");
  });

  it("seeds the editorial author user with is_system = true and email_verified = true", () => {
    assert.match(sql, /INSERT INTO "users"/);
    assert.match(sql, /'editorial@hired\.video'/);
    // is_system must be true (the column value matters here, not just the column name).
    // Allow either positional INSERT or ON CONFLICT path that sets is_system = true.
    assert.match(sql, /is_system[\s\S]*true|"is_system"\s*=\s*true/);
    assert.match(sql, /email_verified[\s\S]*true|"email_verified"\s*=\s*true/);
  });

  it("adds the users.is_system column", () => {
    assert.match(
      sql,
      /ALTER TABLE "users"[\s\S]*ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN/,
      "0113 must add `users.is_system` so editorial accounts bypass the creator paywall.",
    );
  });

  it("seeds exactly 14 articles, all with unique slugs starting with `so-you-want-to-become-`", () => {
    const slugs = [...sql.matchAll(/'(so-you-want-to-become-[a-z-]+)'/g)].map((m) => m[1]);
    const unique = new Set(slugs);
    assert.equal(slugs.length, unique.size, `Duplicate slug detected in 0113: ${slugs.join(", ")}`);
    assert.equal(
      unique.size,
      14,
      `Expected 14 unique 'so-you-want-to-become-*' slugs in 0113, found ${unique.size}. ` +
        `If the series intentionally grows, update this count.`,
    );
  });

  it("every article INSERT uses ON CONFLICT (user_id, slug) — not ON CONSTRAINT — because uq_articles_user_slug is a plain unique INDEX (regression)", () => {
    // 0038 created uq_articles_user_slug as a UNIQUE INDEX, not a CONSTRAINT.
    // PostgreSQL's `ON CONFLICT ON CONSTRAINT <name>` requires a pg_constraint
    // row, so the column-list form is mandatory here.
    const conflictColumnList = (sql.match(/ON CONFLICT \("user_id", "slug"\) DO NOTHING/g) || []).length;
    assert.equal(
      conflictColumnList,
      14,
      `All 14 article INSERTs must use ON CONFLICT ("user_id", "slug") DO NOTHING; found ${conflictColumnList}.`,
    );
    assert.doesNotMatch(
      sql,
      /ON CONFLICT ON CONSTRAINT "uq_articles_user_slug"/,
      `0113 must NOT use ON CONFLICT ON CONSTRAINT — the underlying object is a UNIQUE INDEX, ` +
        `not a CONSTRAINT, so that form fails at runtime (the bug fixed in this session).`,
    );
  });

  it("every article INSERT is published immediately (status='published')", () => {
    // Editorial seed bypasses the creator submit-for-review flow.
    const slugs = [...sql.matchAll(/'(so-you-want-to-become-[a-z-]+)'/g)].map((m) => m[1]);
    const publishedCount = (sql.match(/'published'/g) || []).length;
    assert.ok(
      publishedCount >= slugs.length,
      `Expected at least ${slugs.length} 'published' status literals (one per article); found ${publishedCount}.`,
    );
  });

  it("every article INSERT carries a sector tag from the AI-resilient taxonomy", () => {
    const ALLOWED_SECTORS = ["skilled_trades", "healthcare", "beauty_personal_care", "law_enforcement", "government"];
    for (const sector of ALLOWED_SECTORS) {
      // At least one article per sector (sanity check on bucket coverage).
      assert.match(
        sql,
        new RegExp(`'${sector}'`),
        `0113 must tag at least one article with sector='${sector}'.`,
      );
    }
  });
});

describe("migration 0114 — missing affiliate tables (gap #1186 regression)", () => {
  const migrations = readAllMigrationsText();
  const sql = migrations["0114_create_missing_affiliate_tables.sql"];

  it("0114 exists", () => {
    assert.ok(sql, "0114_create_missing_affiliate_tables.sql is missing");
  });

  it("creates all six affiliate tables declared in src/db/schema/affiliates.ts", () => {
    const REQUIRED = [
      "affiliate_profiles",
      "affiliate_referrals",
      "affiliate_conversions",
      "affiliate_payouts",
      "affiliate_tiers",
      "affiliate_link_clicks",
    ];
    for (const t of REQUIRED) {
      assert.match(
        sql,
        new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
        `0114 must include CREATE TABLE IF NOT EXISTS "${t}".`,
      );
    }
  });

  it("re-creates the partial indexes from 0112 (idempotently)", () => {
    assert.match(sql, /CREATE INDEX IF NOT EXISTS "idx_affiliate_referrals_sector"/);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS "idx_affiliate_link_clicks_sector"/);
  });

  it("affiliate_link_clicks table includes the landing_sector column baked in (so 0112's ALTER is a true no-op on fresh DBs)", () => {
    // Extract the affiliate_link_clicks CREATE TABLE block + assert column.
    const m = sql.match(/CREATE TABLE IF NOT EXISTS "affiliate_link_clicks"[\s\S]*?\);/);
    assert.ok(m, "could not find affiliate_link_clicks CREATE TABLE block");
    assert.match(
      m[0],
      /"landing_sector"\s+VARCHAR\(64\)/i,
      "affiliate_link_clicks must include landing_sector at CREATE TABLE time.",
    );
  });
});
