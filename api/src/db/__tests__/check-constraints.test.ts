/**
 * Guard for gap #2388: every CHECK constraint a SQL migration leaves in place
 * must be declared in the Drizzle schema under the same name.
 *
 * drizzle-kit 0.31 push compares CHECKs by NAME only (on push it ignores a
 * changed expression) and drops any CHECK the schema does not declare. That
 * drop is not flagged as data loss, so it runs even without --force and the
 * integrity rule silently disappears.
 *
 * The replay below covers NAMED checks only (`CONSTRAINT <name> CHECK`, inside
 * CREATE TABLE or after ALTER TABLE … ADD). Rules, applied per file in runner
 * order (filename sort) and in textual order within a file:
 *   - a named CHECK belongs to the table of the closest preceding
 *     CREATE TABLE / ALTER TABLE;
 *   - DROP CONSTRAINT <name> removes it;
 *   - DROP TABLE removes the table's checks;
 *   - ALTER TABLE a RENAME TO b moves them (constraint names do not change).
 * Not covered, so declared by hand and not asserted here:
 *   - unnamed inline checks, which Postgres names `<table>_<col>_check`
 *     (one referenced column) or `<table>_check` (several);
 *   - checks built with EXECUTE format(...) (0157's *_enc_format_check).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { declaredCheckNames } from "../schema-catalog.js";

const DRIZZLE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "drizzle");

/** Named checks that are intentionally not declared, with the reason. */
const ALLOW_UNDECLARED: Record<string, string> = {};

interface MigrationFile {
  name: string;
  sql: string;
}

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const ident = (raw: string): string => raw.replace(/"/g, "").split(".").pop()!.toLowerCase();

const NAME = String.raw`(?:"?\w+"?\.)?"?\w+"?`;
const EVENT_RE = new RegExp(
  [
    String.raw`\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?<create>${NAME})`,
    String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?<alter>${NAME})(?:\s+RENAME\s+TO\s+(?<renameTo>${NAME}))?`,
    String.raw`\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?<dropTables>${NAME}(?:\s*,\s*${NAME})*)`,
    String.raw`\bDROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(?<dropCheck>"?\w+"?)`,
    String.raw`\bCONSTRAINT\s+(?<check>"?\w+"?)\s+CHECK\b`,
  ].join("|"),
  "gi",
);

/** Named CHECK constraints still live after replaying `files` in order: name → table. */
function liveNamedChecks(files: MigrationFile[]): Map<string, string> {
  const live = new Map<string, string>();
  for (const file of files) {
    let table: string | null = null;
    for (const m of stripComments(file.sql).matchAll(EVENT_RE)) {
      const g = m.groups!;
      if (g.create) {
        table = ident(g.create);
      } else if (g.alter) {
        table = ident(g.alter);
        if (g.renameTo) {
          const to = ident(g.renameTo);
          for (const [name, t] of live) if (t === table) live.set(name, to);
          table = to;
        }
      } else if (g.dropTables) {
        const dropped = new Set(g.dropTables.split(",").map((s) => ident(s.trim())));
        for (const [name, t] of live) if (dropped.has(t)) live.delete(name);
        table = null;
      } else if (g.dropCheck) {
        live.delete(ident(g.dropCheck));
      } else if (g.check && table) {
        live.set(ident(g.check), table);
      }
    }
  }
  return live;
}

function readMigrations(): MigrationFile[] {
  return readdirSync(DRIZZLE_DIR)
    .filter((f) => /^0\d+.*\.sql$/.test(f))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(DRIZZLE_DIR, name), "utf8") }));
}

describe("liveNamedChecks — migration replay", () => {
  it("keeps a check added in CREATE TABLE and one added by a guarded ALTER", () => {
    const live = liveNamedChecks([
      {
        name: "0001_a.sql",
        sql: `CREATE TABLE IF NOT EXISTS uploaded_assets (
  id uuid PRIMARY KEY,
  size_bytes bigint NOT NULL, -- CONSTRAINT not_this CHECK (x) in a comment
  CONSTRAINT uploaded_assets_size_check CHECK (size_bytes >= 0)
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_status_check') THEN
    ALTER TABLE reviews
      ADD CONSTRAINT reviews_status_check
      CHECK (status IN ('published', 'hidden', 'removed')) NOT VALID;
  END IF;
END $$;`,
      },
    ]);
    assert.deepEqual(
      [...live].sort(),
      [
        ["reviews_status_check", "reviews"],
        ["uploaded_assets_size_check", "uploaded_assets"],
      ],
    );
  });

  it("re-adds a check dropped then recreated, and follows a table rename", () => {
    const live = liveNamedChecks([
      {
        name: "0067_x.sql",
        sql: `ALTER TABLE studio_projects DROP CONSTRAINT IF EXISTS studio_projects_kind_check;
ALTER TABLE studio_projects ADD CONSTRAINT studio_projects_kind_check CHECK (kind IN ('scene', 'nle'));
CREATE TABLE content_reports_v2 (id uuid, CONSTRAINT content_reports_v2_kind_check CHECK (kind <> ''));`,
      },
      { name: "0482_y.sql", sql: `ALTER TABLE content_reports_v2 RENAME TO content_reports_v2_archived;` },
    ]);
    assert.equal(live.get("studio_projects_kind_check"), "studio_projects");
    assert.equal(live.get("content_reports_v2_kind_check"), "content_reports_v2_archived");
  });

  it("forgets checks removed by DROP CONSTRAINT or DROP TABLE", () => {
    const live = liveNamedChecks([
      {
        name: "0001_a.sql",
        sql: `CREATE TABLE company_reviews (id uuid, CONSTRAINT company_reviews_rating CHECK (rating > 0));
ALTER TABLE board_bids ADD CONSTRAINT board_bids_direction_check CHECK (board_id IS NOT NULL);`,
      },
      {
        name: "0002_b.sql",
        sql: `DROP TABLE IF EXISTS company_reviews, promo_project_reviews CASCADE;
ALTER TABLE "public"."board_bids" DROP CONSTRAINT IF EXISTS "board_bids_direction_check";`,
      },
    ]);
    assert.equal(live.size, 0);
  });
});

describe("CHECK constraints — migrations vs schema (#2388)", () => {
  const live = liveNamedChecks(readMigrations());
  const declared = declaredCheckNames();

  it("finds the migration checks (parser sanity)", () => {
    assert.ok(live.size > 50, `expected the full set of named checks, got ${live.size}`);
    assert.equal(live.get("uploaded_assets_size_check"), "uploaded_assets");
    assert.equal(live.get("studio_projects_media_kind_check"), "studio_projects");
  });

  it("declares every named migration check on a schema table under the same name", () => {
    const missing: string[] = [];
    for (const [name, table] of live) {
      const names = declared.get(table);
      if (!names) continue; // table not push-managed (archive / SQL-only)
      if (names.has(name) || name in ALLOW_UNDECLARED) continue;
      missing.push(`${table}.${name}`);
    }
    assert.deepEqual(missing, [], "declare these with check(...) in api/src/db/schema/* or push will drop them");
  });

  it("keeps the allow-list honest", () => {
    for (const name of Object.keys(ALLOW_UNDECLARED)) {
      assert.ok(live.has(name), `${name} is allow-listed but no migration leaves it live`);
    }
  });
});
