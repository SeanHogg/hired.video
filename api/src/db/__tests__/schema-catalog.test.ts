/**
 * Deploy-safety guards for `drizzle-kit push` (2026-10-10 audit):
 *   - push is limited to declared tables, so SQL-only tables (the runner's
 *     `_sql_migrations` ledger, archives) can never be dropped by it;
 *   - missing declared UNIQUE constraints are created before push without
 *     touching rows, and duplicates block instead of being deleted.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addUniqueConstraintSql,
  declaredTableNames,
  declaredUniqueConstraints,
} from "../schema-catalog.js";
import { ensureUniqueConstraints } from "../../../scripts/ensure-unique-constraints.js";

describe("declaredTableNames", () => {
  const names = declaredTableNames();

  it("lists the schema's tables", () => {
    assert.ok(names.length > 400, `expected the full schema, got ${names.length}`);
    for (const t of ["users", "magic_link_tokens", "studio_projects", "uploaded_assets", "help_mappings"]) {
      assert.ok(names.includes(t), `missing ${t}`);
    }
  });

  it("excludes tables that live only in SQL migrations, so push cannot drop them", () => {
    for (const t of ["_sql_migrations", "content_reports_v2_archived"]) {
      assert.ok(!names.includes(t), `${t} must not be push-managed`);
    }
  });
});

describe("declaredUniqueConstraints", () => {
  const constraints = declaredUniqueConstraints();

  it("includes column-level .unique() under drizzle's default name", () => {
    const c = constraints.find((x) => x.name === "magic_link_tokens_token_unique");
    assert.deepEqual(c, { table: "magic_link_tokens", name: "magic_link_tokens_token_unique", columns: ["token"], nullsNotDistinct: false });
  });

  // drizzle-kit 0.31 introspects every unique as nullsNotDistinct=false, so a
  // declared NULLS NOT DISTINCT unique diffs on every push and stops the deploy
  // on a "truncate?" prompt (studio_project_publications, 2026-10-11). Keep the
  // modifier in a SQL migration and declare the plain unique here.
  it("declares no NULLS NOT DISTINCT unique (push cannot introspect it)", () => {
    const offenders = constraints.filter((c) => c.nullsNotDistinct).map((c) => c.name);
    assert.deepEqual(offenders, []);
  });

  it("names are unique across the schema", () => {
    const seen = new Set<string>();
    for (const c of constraints) {
      assert.ok(!seen.has(c.name), `duplicate constraint name ${c.name}`);
      seen.add(c.name);
    }
  });
});

describe("addUniqueConstraintSql", () => {
  it("quotes identifiers and supports NULLS NOT DISTINCT", () => {
    assert.equal(
      addUniqueConstraintSql({ table: "t", name: "t_a_b_unique", columns: ["a", "b"], nullsNotDistinct: true }),
      'ALTER TABLE "t" ADD CONSTRAINT "t_a_b_unique" UNIQUE NULLS NOT DISTINCT ("a", "b")',
    );
    assert.equal(
      addUniqueConstraintSql({ table: 'we"ird', name: "n", columns: ["c"], nullsNotDistinct: false }),
      'ALTER TABLE "we""ird" ADD CONSTRAINT "n" UNIQUE ("c")',
    );
  });
});

describe("ensureUniqueConstraints", () => {
  const declared = [
    { table: "magic_link_tokens", name: "magic_link_tokens_token_unique", columns: ["token"], nullsNotDistinct: false },
    { table: "users", name: "users_email_unique", columns: ["email"], nullsNotDistinct: false },
    { table: "dup_table", name: "dup_table_k_unique", columns: ["k"], nullsNotDistinct: false },
    { table: "not_created_yet", name: "not_created_yet_x_unique", columns: ["x"], nullsNotDistinct: false },
  ];

  function fakeDb(opts: { failWith?: Record<string, string> } = {}) {
    const executed: string[] = [];
    const query = async (text: string) => {
      if (text.includes("FROM pg_tables")) {
        return [{ tablename: "magic_link_tokens" }, { tablename: "users" }, { tablename: "dup_table" }];
      }
      if (text.includes("FROM pg_constraint")) return [{ conname: "users_email_unique" }];
      executed.push(text);
      for (const [needle, code] of Object.entries(opts.failWith ?? {})) {
        if (text.includes(needle)) throw Object.assign(new Error("boom"), { code });
      }
      return [];
    };
    return { query, executed };
  }

  it("creates only constraints that are missing on existing tables, and never deletes rows", async () => {
    const db = fakeDb({ failWith: { dup_table_k_unique: "23505" } });
    const res = await ensureUniqueConstraints(db.query, declared, () => {});
    assert.deepEqual(res.created, ["magic_link_tokens_token_unique"]);
    assert.deepEqual(res.skippedDuplicates, ["dup_table_k_unique"]);
    assert.equal(db.executed.length, 2);
    assert.ok(db.executed.every((s) => s.startsWith("ALTER TABLE") && s.includes("ADD CONSTRAINT")));
    assert.ok(!db.executed.some((s) => /\b(DELETE|UPDATE|TRUNCATE|DROP)\b/i.test(s)));
  });

  it("rethrows errors other than a duplicate-row violation", async () => {
    const db = fakeDb({ failWith: { magic_link_tokens_token_unique: "42P01" } });
    await assert.rejects(ensureUniqueConstraints(db.query, declared, () => {}), /boom/);
  });

  it("does nothing for an empty declaration list", async () => {
    const db = fakeDb();
    const res = await ensureUniqueConstraints(db.query, [], () => {});
    assert.deepEqual(res, { created: [], skippedDuplicates: [] });
    assert.equal(db.executed.length, 0);
  });
});
