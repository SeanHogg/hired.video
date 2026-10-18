/**
 * Archive erasure guard: every table a migration puts in the `archive` schema
 * (`ALTER TABLE … SET SCHEMA archive`, `CREATE TABLE archive.…`) or renames
 * to `public.*_archived` (`ALTER TABLE … RENAME TO x_archived`) must be
 * classified in services/privacy/archive-pii-registry.ts — either in
 * ARCHIVE_PII_REGISTRY (erased on account deletion) or in
 * ARCHIVE_TABLES_WITHOUT_USER_DATA — and every user-id-shaped column of a
 * registered table must be one of its erasure links; every email-shaped
 * column must be an `emailColumns` link or reviewed in
 * ARCHIVE_EMAIL_COLUMNS_NOT_THE_USER. A future archive
 * migration that skips the registry fails here instead of silently leaving
 * deleted users' data behind.
 *
 * Run: node --import tsx --test src/db/__tests__/archive-pii-registry.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  ARCHIVE_EMAIL_COLUMNS_NOT_THE_USER,
  ARCHIVE_PII_REGISTRY,
  ARCHIVE_TABLES_WITHOUT_USER_DATA,
} from "../../services/privacy/archive-pii-registry.js";
import { buildArchiveDeleteSql } from "../../services/privacy/archive-erasure.js";

const DRIZZLE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../drizzle");
const SQL_FILES = readdirSync(DRIZZLE_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(DRIZZLE_DIR, f), "utf8").replace(/--[^\n]*/g, ""));

/** Column names that hold a hired.video users.id. */
const USER_COLUMN = /^(user_id|owner_id|author_id|viewer_id|recruiter_id|created_by|updated_by|deleted_by)$|_user_id$|_by$/;
/** Matches the shape but is an id on an external platform, not a users.id. */
const NOT_USER_COLUMNS = new Set(["external_user_id", "provider_user_id"]);
/** Column names that hold an email address. */
const EMAIL_COLUMN = /(^|_)email$/;

const IDENT = String.raw`"?([a-z_][a-z0-9_]*)"?`;

/** Split a parenthesised body on top-level commas. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Text between the "(" at `open` and its matching ")". */
function parenBody(s: string, open: number): string {
  let depth = 1;
  let i = open + 1;
  while (depth && i < s.length) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    i++;
  }
  return s.slice(open + 1, i - 1);
}

function columnsOfCreateBody(body: string): string[] {
  return splitTopLevel(body)
    .map((p) => p.match(/^"?([a-z_][a-z0-9_]*)"?\s/i)?.[1]?.toLowerCase())
    .filter((c): c is string => !!c && !/^(constraint|primary|unique|foreign|check|exclude|like)$/.test(c));
}

/** Columns of a table as declared across all migrations (CREATE TABLE + ADD COLUMN). */
function columnsOf(table: string, schemaPrefix: "public" | "archive"): Set<string> {
  const cols = new Set<string>();
  const prefix = schemaPrefix === "public" ? String.raw`(?:"?public"?\.)?` : String.raw`"?archive"?\.`;
  const create = new RegExp(String.raw`CREATE TABLE (?:IF NOT EXISTS )?${prefix}"?${table}"?\s*\(`, "gi");
  const alter = new RegExp(String.raw`ALTER TABLE (?:IF EXISTS )?(?:ONLY )?${prefix}"?${table}"?\s+([^;]*)`, "gi");
  for (const s of SQL_FILES) {
    for (const m of s.matchAll(create)) for (const c of columnsOfCreateBody(parenBody(s, m.index! + m[0].length - 1))) cols.add(c);
    for (const m of s.matchAll(alter)) {
      for (const a of m[1]!.matchAll(new RegExp(String.raw`ADD COLUMN (?:IF NOT EXISTS )?${IDENT}`, "gi"))) cols.add(a[1]!.toLowerCase());
    }
  }
  return cols;
}

interface ArchivedTable { schema: "archive" | "public"; cols: Set<string> }

/** archived table → schema + columns, discovered from every migration. */
function discoverArchiveTables(): Map<string, ArchivedTable> {
  const tables = new Map<string, ArchivedTable>();
  const add = (t: string, cols: Iterable<string>, schema: ArchivedTable["schema"] = "archive") => {
    const entry = tables.get(t) ?? { schema, cols: new Set<string>() };
    for (const c of cols) entry.cols.add(c);
    tables.set(t, entry);
  };
  for (const s of SQL_FILES) {
    for (const m of s.matchAll(new RegExp(String.raw`ALTER TABLE (?:IF EXISTS )?(?:"?public"?\.)?${IDENT}\s+RENAME TO "?([a-z_][a-z0-9_]*_archived)"?`, "gi"))) {
      add(m[2]!.toLowerCase(), columnsOf(m[1]!.toLowerCase(), "public"), "public");
    }
    for (const m of s.matchAll(new RegExp(String.raw`ALTER TABLE (?:IF EXISTS )?(?:"?public"?\.)?${IDENT}\s+SET SCHEMA "?archive"?`, "gi"))) {
      add(m[1]!.toLowerCase(), columnsOf(m[1]!.toLowerCase(), "public"));
    }
    for (const m of s.matchAll(new RegExp(String.raw`CREATE TABLE (?:IF NOT EXISTS )?"?archive"?\.${IDENT}\s*\(`, "gi"))) {
      add(m[1]!.toLowerCase(), columnsOf(m[1]!.toLowerCase(), "archive"));
    }
    for (const m of s.matchAll(new RegExp(String.raw`CREATE TABLE (?:IF NOT EXISTS )?"?archive"?\.${IDENT}\s+AS\s+SELECT\s+([\s\S]*?)\s+FROM\s`, "gi"))) {
      const cols = splitTopLevel(m[2]!).map((expr) => {
        const alias = expr.match(/\sAS\s+"?([a-z_][a-z0-9_]*)"?$/i)?.[1];
        return (alias ?? expr.split(".").pop()!).replace(/"/g, "").trim().toLowerCase();
      });
      add(m[1]!.toLowerCase(), cols);
    }
  }
  return tables;
}

const ARCHIVE = discoverArchiveTables();
const REGISTERED = new Map(ARCHIVE_PII_REGISTRY.map((e) => [e.table, e]));
const userShaped = (cols: Iterable<string>) => [...cols].filter((c) => USER_COLUMN.test(c) && !NOT_USER_COLUMNS.has(c));
/** Email columns not reviewed as someone else's address. */
const emailShaped = (table: string, cols: Iterable<string>) =>
  [...cols].filter((c) => EMAIL_COLUMN.test(c) && !(`${table}.${c}` in ARCHIVE_EMAIL_COLUMNS_NOT_THE_USER));

describe("archive PII registry ↔ api/drizzle/*.sql", () => {
  it("discovers the archive tables (parser sanity)", () => {
    for (const t of ["user_profiles_legacy_0632", "saved_jobs_lifecycle_0622", "placements_recruiter_name_0623", "oauth_accounts", "resume_versions"]) {
      assert.ok(ARCHIVE.has(t), `parser did not find archive.${t}`);
    }
    assert.deepEqual([...ARCHIVE.get("placements_recruiter_name_0623")!.cols].sort(), ["id", "recruiter_id", "recruiter_name"]);
    assert.ok(ARCHIVE.get("user_profiles_legacy_0632")!.cols.has("billing_line1"));
    assert.ok(ARCHIVE.get("profile_views")!.cols.has("viewer_user_id"));
    assert.ok(ARCHIVE.get("studio_review_comments")!.cols.has("author_email"));
    assert.equal(ARCHIVE.get("content_reports_v2_archived")?.schema, "public");
    assert.ok(ARCHIVE.get("content_reports_v2_archived")!.cols.has("reporter_user_id"));
  });

  it("every archive table is classified (erased, or reviewed as holding no user data)", () => {
    const unclassified = [...ARCHIVE.keys()].filter((t) => !REGISTERED.has(t) && !(t in ARCHIVE_TABLES_WITHOUT_USER_DATA));
    assert.deepEqual(unclassified, [], `add these archive tables to ARCHIVE_PII_REGISTRY (or ARCHIVE_TABLES_WITHOUT_USER_DATA): ${unclassified.join(", ")}`);
  });

  it("no table is in both lists, and no entry is stale", () => {
    for (const t of Object.keys(ARCHIVE_TABLES_WITHOUT_USER_DATA)) {
      assert.ok(!REGISTERED.has(t), `${t} is both erased and marked as holding no user data`);
      assert.ok(ARCHIVE.has(t), `ARCHIVE_TABLES_WITHOUT_USER_DATA lists ${t}, which no migration archives`);
    }
    assert.equal(REGISTERED.size, ARCHIVE_PII_REGISTRY.length, "duplicate table in ARCHIVE_PII_REGISTRY");
    for (const [t, e] of REGISTERED) {
      assert.ok(ARCHIVE.has(t), `ARCHIVE_PII_REGISTRY lists ${t}, which no migration archives`);
      assert.equal(e.schema ?? "archive", ARCHIVE.get(t)!.schema, `${t} is registered under the wrong schema`);
    }
    for (const k of Object.keys(ARCHIVE_EMAIL_COLUMNS_NOT_THE_USER)) {
      const [t, c] = k.split(".");
      assert.ok(ARCHIVE.get(t!)?.cols.has(c!), `ARCHIVE_EMAIL_COLUMNS_NOT_THE_USER lists ${k}, which no archived table has`);
      assert.ok(!REGISTERED.get(t!)?.emailColumns?.includes(c!), `${k} is both an emailColumns link and reviewed as not the user`);
    }
  });

  it("a table with a user-id column is erased, and every such column is a link", () => {
    for (const [table, { cols }] of ARCHIVE) {
      const shaped = userShaped(cols);
      if (shaped.length === 0) continue;
      const entry = REGISTERED.get(table);
      assert.ok(entry, `archived ${table} has user column(s) ${shaped.join(", ")} but is not in ARCHIVE_PII_REGISTRY`);
      for (const c of shaped) {
        assert.ok(entry.userColumns.includes(c), `archived ${table}.${c} looks like a users.id but is not in its userColumns`);
      }
    }
  });

  it("every email column is an emailColumns link or reviewed as someone else's address", () => {
    for (const [table, { cols }] of ARCHIVE) {
      const shaped = emailShaped(table, cols);
      if (shaped.length === 0) continue;
      const entry = REGISTERED.get(table);
      assert.ok(entry, `archived ${table} has email column(s) ${shaped.join(", ")} but is not in ARCHIVE_PII_REGISTRY`);
      for (const c of shaped) {
        assert.ok(
          entry.emailColumns?.includes(c),
          `archived ${table}.${c}: add it to emailColumns (the user's own address) or ARCHIVE_EMAIL_COLUMNS_NOT_THE_USER (someone else's)`,
        );
      }
    }
  });

  it("every registered link column exists on its table", () => {
    for (const e of ARCHIVE_PII_REGISTRY) {
      assert.ok(e.userColumns.length + (e.emailColumns?.length ?? 0) + (e.via?.length ?? 0) > 0, `${e.table} has no erasure link`);
      const cols = ARCHIVE.get(e.table)!.cols;
      for (const c of [...e.userColumns, ...(e.emailColumns ?? []), ...(e.via ?? []).map((v) => v.column)]) {
        assert.ok(cols.has(c), `archive.${e.table} has no column ${c}`);
      }
    }
  });

  it("an archive parent used via a link is registered and erased after its children", () => {
    ARCHIVE_PII_REGISTRY.forEach((e, i) => {
      for (const v of e.via ?? []) {
        if (v.parentSchema !== "archive") continue;
        const parentIndex = ARCHIVE_PII_REGISTRY.findIndex((p) => p.table === v.parentTable);
        assert.ok(parentIndex > i, `${e.table} links through archive.${v.parentTable}, which must be registered after it`);
      }
    });
  });
});

describe("buildArchiveDeleteSql", () => {
  const dialect = new PgDialect();
  const catalog = (entries: Record<string, string[]>) => new Map(Object.entries(entries).map(([k, v]) => [k, new Set(v)]));

  it("ORs direct and via links with quoted identifiers and a bound user id", () => {
    const stmt = buildArchiveDeleteSql(
      {
        table: "recruiter_outreach_enrollments",
        userColumns: ["recruiter_id"],
        via: [{ column: "talent_pool_candidate_id", parentSchema: "public", parentTable: "talent_pool_candidates", parentKey: "id", parentUserColumns: ["candidate_id"] }],
      },
      { userId: "u-1" },
      catalog({
        "archive.recruiter_outreach_enrollments": ["id", "recruiter_id", "talent_pool_candidate_id"],
        "public.talent_pool_candidates": ["id", "candidate_id"],
      }),
    );
    assert.ok(stmt);
    const q = dialect.sqlToQuery(stmt);
    assert.equal(
      q.sql,
      `DELETE FROM "archive"."recruiter_outreach_enrollments" WHERE "recruiter_id"::text = $1 OR "talent_pool_candidate_id" IN (SELECT "id" FROM "public"."talent_pool_candidates" WHERE "candidate_id"::text = $2)`,
    );
    assert.deepEqual(q.params, ["u-1", "u-1"]);
  });

  it("drops links whose column or parent is missing in this database", () => {
    const stmt = buildArchiveDeleteSql(
      {
        table: "performance_reviews",
        userColumns: ["reviewee_user_id", "reviewer_user_id"],
        via: [{ column: "cycle_id", parentSchema: "public", parentTable: "gone", parentKey: "id", parentUserColumns: ["user_id"] }],
      },
      { userId: "u-1" },
      catalog({ "archive.performance_reviews": ["id", "reviewee_user_id"] }),
    );
    assert.equal(dialect.sqlToQuery(stmt!).sql, `DELETE FROM "archive"."performance_reviews" WHERE "reviewee_user_id"::text = $1`);
  });

  it("matches the user's own email case-insensitively, and only when an email is given", () => {
    const entry = { table: "studio_review_comments", userColumns: ["author_user_id"], emailColumns: ["author_email"] };
    const cat = catalog({ "archive.studio_review_comments": ["id", "author_user_id", "author_email"] });
    const q = dialect.sqlToQuery(buildArchiveDeleteSql(entry, { userId: "u-1", email: "Gone@Acme.com" }, cat)!);
    assert.equal(q.sql, `DELETE FROM "archive"."studio_review_comments" WHERE "author_user_id"::text = $1 OR lower("author_email") = lower($2)`);
    assert.deepEqual(q.params, ["u-1", "Gone@Acme.com"]);
    for (const email of [null, "", "  "]) {
      assert.equal(
        dialect.sqlToQuery(buildArchiveDeleteSql(entry, { userId: "u-1", email }, cat)!).sql,
        `DELETE FROM "archive"."studio_review_comments" WHERE "author_user_id"::text = $1`,
      );
    }
  });

  it("targets public.*_archived tables when the entry says schema public", () => {
    const stmt = buildArchiveDeleteSql(
      { table: "content_reports_v2_archived", schema: "public", userColumns: ["reporter_user_id"] },
      { userId: "u-1" },
      catalog({ "public.content_reports_v2_archived": ["id", "reporter_user_id"] }),
    );
    assert.equal(dialect.sqlToQuery(stmt!).sql, `DELETE FROM "public"."content_reports_v2_archived" WHERE "reporter_user_id"::text = $1`);
  });

  it("returns null when the archive table does not exist here", () => {
    assert.equal(buildArchiveDeleteSql({ table: "nope", userColumns: ["user_id"] }, { userId: "u-1" }, catalog({})), null);
  });

  it("returns null when none of the links exist", () => {
    assert.equal(buildArchiveDeleteSql({ table: "t", userColumns: ["user_id"] }, { userId: "u-1" }, catalog({ "archive.t": ["id"] })), null);
  });
});
