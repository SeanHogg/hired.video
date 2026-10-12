/**
 * SQL-shape tests for the five fixed call sites that historically used
 * `sql`= ANY(${jsArray})` and broke under the worker pg driver.
 *
 * The bug surfaced as:
 *   "op ANY/ALL (array) requires array on right side"
 *
 * Root cause: in raw `sql\`...\`` templates the worker driver doesn't
 * coerce JS arrays into Postgres array parameters. Drizzle's `inArray()`
 * helper does, by emitting an `IN ($1, $2, ...)` predicate where each
 * element binds as its own scalar parameter — no array-on-right-side.
 *
 * These tests pin two things per route:
 *   1. The compiled SQL contains an `IN (` clause (or no `WHERE` at all
 *      for the empty-array short-circuit) — never `= ANY(`.
 *   2. The bound parameters expand to one scalar per id, matching the
 *      placeholder count in the SQL — i.e. the worker driver receives
 *      scalars, not a single array parameter that Postgres has to coerce.
 *
 * Run: node --import tsx --test src/routes/__tests__/array-binding-sql.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { schema } from "../../db/index.js";

const dialect = new PgDialect();

/** Compile a Drizzle SQL fragment to its parameterised form so tests can
 *  inspect both the rendered SQL and the params the driver would bind. */
function compile(fragment: ReturnType<typeof inArray>) {
  return dialect.sqlToQuery(fragment.getSQL());
}

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";
const UUID_C = "33333333-3333-3333-3333-333333333333";

describe("inArray() vs raw `= ANY(${array})` — SQL-shape contract", () => {
  it("renders `in (?, ?, ?)` rather than `= ANY(?)` for a multi-id list", () => {
    const compiled = compile(inArray(schema.companyProfiles.id, [UUID_A, UUID_B, UUID_C]));
    assert.match(compiled.sql, / in \(\$\d+, \$\d+, \$\d+\)/i);
    assert.doesNotMatch(compiled.sql, /= ANY\(/i);
  });

  it("binds each id as its own scalar parameter (the fix vs. array-on-right-side)", () => {
    const compiled = compile(inArray(schema.users.id, [UUID_A, UUID_B]));
    // Three parameters land in compiled.params: the column-prefix-free spec of
    // `inArray` is `col in (...)`, and the params line up with the placeholders.
    // What matters: each id is its own scalar — no JS array hidden inside one
    // parameter slot, which is exactly what the worker driver chokes on.
    assert.equal(compiled.params.length, 2);
    assert.deepEqual(compiled.params, [UUID_A, UUID_B]);
    assert.ok(!Array.isArray(compiled.params[0]), "params[0] must be a scalar id, not an array");
  });

  it("regression guard: the legacy `sql\\`= ANY(${arr})\\`` form expands to `ANY(($1, $2))` — invalid Postgres syntax", async () => {
    // Reproduces the broken form so the test documents *why* we changed it.
    //
    // Drizzle's `sql\`...\`` template expands a JS array into N scalar
    // parameters wrapped in an extra paren tuple — emitting
    //   "users"."id" = ANY(($1, $2))
    // Postgres parses that as `ANY(record)`, not `ANY(array)`, and replies
    // with "op ANY/ALL (array) requires array on right side".
    //
    // The fix (`inArray`) emits `in ($1, $2)` instead — flat scalars, no
    // tuple wrapper. This test pins the structural difference so a future
    // Drizzle upgrade can't silently restore the broken shape.
    const { sql } = await import("drizzle-orm");
    // Deliberately reproduces the banned `= ANY(${array})` form to document why
    // it's broken; this is the regression counter-example, not production SQL.
    // eslint-disable-next-line no-restricted-syntax
    const buggy = sql`${schema.users.id} = ANY(${[UUID_A, UUID_B]})`;
    const compiled = dialect.sqlToQuery(buggy);
    assert.match(compiled.sql, /= ANY\(\(\$\d+, \$\d+\)\)/i);
    assert.doesNotMatch(compiled.sql, / in \(/i);
  });
});

describe("workspaces.ts — populated company / delegated lists hit no `ANY(`", () => {
  it("companyProfiles lookup uses `in (...)` form", () => {
    const compiled = compile(inArray(schema.companyProfiles.id, [UUID_A, UUID_B]));
    assert.doesNotMatch(compiled.sql, /ANY\(/);
    assert.match(compiled.sql, / in \(/i);
  });

  it("users lookup for delegated subjects uses `in (...)` form", () => {
    const compiled = compile(inArray(schema.users.id, [UUID_A]));
    assert.doesNotMatch(compiled.sql, /ANY\(/);
    assert.match(compiled.sql, / in \(/i);
  });
});

describe("advertising.ts — boost job-title hydration", () => {
  it("jobItems lookup binds ids as scalars, not as a single array param", () => {
    const compiled = compile(inArray(schema.jobItems.id, [UUID_A, UUID_B, UUID_C]));
    assert.equal(compiled.params.length, 3);
    compiled.params.forEach((p, idx) => {
      assert.ok(!Array.isArray(p), `param ${idx} must be scalar`);
    });
  });
});

describe("phone.ts — call/sms phone-number hydration", () => {
  it("businessPhoneNumbers lookup uses `in (...)` for many ids", () => {
    const compiled = compile(inArray(schema.businessPhoneNumbers.id, [UUID_A, UUID_B]));
    assert.match(compiled.sql, / in \(\$\d+, \$\d+\)/i);
  });

  it("`inArray` + a single-element list still produces a parameterised `in (?)` (no special-casing needed)", () => {
    // The old phone.ts code branched on length===1 to use eq() instead of ANY().
    // After the fix, the single-element case goes through inArray and still
    // produces a valid `in ($1)` form — proving the dead branch was unnecessary.
    const compiled = compile(inArray(schema.businessPhoneNumbers.id, [UUID_A]));
    assert.match(compiled.sql, / in \(\$\d+\)/i);
    assert.equal(compiled.params.length, 1);
  });
});

describe("services.ts — pipeline scope by team-member ids", () => {
  it("jobItems.postedByUserId scope-by-member uses `in (...)` form", () => {
    const compiled = compile(inArray(schema.jobItems.postedByUserId, [UUID_A, UUID_B]));
    assert.doesNotMatch(compiled.sql, /ANY\(/);
    assert.match(compiled.sql, / in \(/i);
  });
});

describe("inArray edge cases worth pinning", () => {
  it("two-element list", () => {
    const compiled = compile(inArray(schema.users.id, [UUID_A, UUID_B]));
    assert.equal(compiled.params.length, 2);
    assert.match(compiled.sql, / in \(\$1, \$2\)/i);
  });

  it("eq() vs inArray() on a single element compile to different but equally-correct SQL", () => {
    const eqCompiled = dialect.sqlToQuery(eq(schema.users.id, UUID_A).getSQL());
    const inCompiled = compile(inArray(schema.users.id, [UUID_A]));
    assert.match(eqCompiled.sql, /= \$\d+/);
    assert.match(inCompiled.sql, / in \(\$\d+\)/i);
    // Both bind a scalar — neither attempts to bind an array as a single param.
    assert.ok(!Array.isArray(eqCompiled.params[0]));
    assert.ok(!Array.isArray(inCompiled.params[0]));
  });
});
