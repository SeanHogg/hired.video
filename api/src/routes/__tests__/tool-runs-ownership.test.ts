/**
 * Regression + behaviour tests for entity-ownership checks in
 * /api/tool-runs.
 *
 * Bug history: the `job` entity binding tried `eq(jobItems.userId, …)`
 * but `job_items` has no `user_id` column — the column is
 * `posted_by_user_id`. With the column undefined, Drizzle compiled the
 * predicate to `… AND  = $2` and Postgres returned
 *   "syntax error at or near =" (HTTP 500)
 * which crashed every Value Proposition / Resume Tailor / etc. run that
 * referenced an existing job.
 *
 * These tests pin three things:
 *   1. The schema shape that triggered the bug (`jobItems.userId` is
 *      undefined, `postedByUserId` exists).
 *   2. The compiled SQL for every entity's ownership predicate has both
 *      operands of `=` filled in (no empty-LHS regression).
 *   3. `ownsByJob` accepts posted / saved / applied jobs and rejects
 *      otherwise — using a stub Db so the test stays a unit test.
 *
 * Run: node --import tsx --test src/routes/__tests__/tool-runs-ownership.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { and, eq, exists, or, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { schema } from "../../db/index.js";
import { ownsByJob } from "../tool-runs.js";

const dialect = new PgDialect();
const USER_ID = "11111111-1111-1111-1111-111111111111";
const JOB_ID = "22222222-2222-2222-2222-222222222222";
const RESUME_ID = "33333333-3333-3333-3333-333333333333";
const VIDEO_ID = "44444444-4444-4444-4444-444444444444";

describe("schema shape — jobItems ownership column", () => {
  it("job_items has no `userId` column (the field that caused the bug)", () => {
    // If a future migration adds `user_id` to job_items this test will
    // fail and the route's ownsByJob can be simplified to use it.
    assert.equal((schema.jobItems as any).userId, undefined);
  });

  it("job_items exposes `postedByUserId` mapped to posted_by_user_id", () => {
    assert.ok(schema.jobItems.postedByUserId, "postedByUserId column must exist");
    assert.equal((schema.jobItems.postedByUserId as any).name, "posted_by_user_id");
  });
});

describe("entity ownership predicates compile to valid SQL (no empty `=` operand)", () => {
  // Each fragment mirrors what the route's ownsBy* helpers build. If any
  // of these compiles with an empty operand around `=`, Postgres would
  // throw "syntax error at or near =" — exactly the original bug.

  const fragments = {
    resume: and(
      eq(schema.resumeInformation.id, RESUME_ID),
      eq(schema.resumeInformation.userId, USER_ID),
    )!,
    "job — posted_by": and(
      eq(schema.jobItems.id, JOB_ID),
      eq(schema.jobItems.postedByUserId, USER_ID),
    )!,
    "job — saved_jobs": and(
      eq(schema.savedJobs.jobId, JOB_ID),
      eq(schema.savedJobs.userId, USER_ID),
    )!,
    "job — job_applications": and(
      eq(schema.jobApplications.jobId, JOB_ID),
      eq(schema.jobApplications.userId, USER_ID),
    )!,
    video: and(
      eq(schema.videos.id, VIDEO_ID),
      eq(schema.videos.userId, USER_ID),
    )!,
  };

  for (const [label, fragment] of Object.entries(fragments)) {
    it(`${label} predicate has a column on both sides of every \`=\``, () => {
      const compiled = dialect.sqlToQuery(fragment.getSQL());
      // Regression: the broken form compiled to `… AND  = $2` (note the
      // double-space — empty LHS). Reject any `=` that isn't preceded
      // by a quoted identifier or a closing paren.
      assert.doesNotMatch(
        compiled.sql,
        / {2}=/,
        `compiled SQL had empty LHS before \`=\`:\n${compiled.sql}`,
      );
      // And every `= $n` placeholder must bind a scalar (uuid string),
      // not undefined / array — which would also fail at the driver.
      const placeholders = (compiled.sql.match(/= \$\d+/g) ?? []).length;
      assert.equal(
        compiled.params.length,
        placeholders,
        "param count must match `= $n` placeholder count",
      );
      for (const p of compiled.params) {
        assert.equal(typeof p, "string", "every bound param is a uuid string");
      }
    });
  }
});

// ── ownsByJob behaviour with a stub Db ──────────────────────────────────────
//
// We don't spin up Postgres for unit tests. ownsByJob is ONE query
// (posted_by OR EXISTS saved_jobs OR EXISTS job_applications); the stub
// stands in for Postgres evaluating that OR, and counts executed queries
// so the single-round-trip shape is pinned too.

interface StubMatch {
  posted?: boolean;
  saved?: boolean;
  applied?: boolean;
}

function makeStubDb(matches: StubMatch) {
  const stats = { executed: 0 };
  // The EXISTS sub-selects build (select→from→where) without executing;
  // only the outer chain's .limit() runs a query.
  const chain = () => ({
    from: () => ({
      where: () => ({
        limit: async () => {
          stats.executed++;
          return matches.posted || matches.saved || matches.applied ? [{ id: "row" }] : [];
        },
      }),
    }),
  });

  const db = { select: () => chain() } as any;
  return Object.assign(db, { stats });
}

describe("ownsByJob — combined predicate compiles to valid SQL", () => {
  it("has the posted_by OR EXISTS(saved) OR EXISTS(applied) shape", () => {
    const { jobItems, savedJobs, jobApplications } = schema;
    const fragment = and(
      eq(jobItems.id, JOB_ID),
      or(
        eq(jobItems.postedByUserId, USER_ID),
        exists(sql`select 1 from ${savedJobs} where ${and(eq(savedJobs.jobId, jobItems.id), eq(savedJobs.userId, USER_ID))}`),
        exists(sql`select 1 from ${jobApplications} where ${and(eq(jobApplications.jobId, jobItems.id), eq(jobApplications.userId, USER_ID))}`),
      ),
    )!;
    const compiled = dialect.sqlToQuery(fragment.getSQL());
    assert.doesNotMatch(compiled.sql, / {2}=/);
    assert.match(compiled.sql, /"posted_by_user_id"/);
    assert.match(compiled.sql, /exists/i);
  });
});

describe("ownsByJob — accepts the three job-ownership paths", () => {
  it("returns true when the user posted the job", async () => {
    const db = makeStubDb({ posted: true });
    assert.equal(await ownsByJob(db, USER_ID, JOB_ID), true);
  });

  it("returns true when the user saved/tracked the job (posted = false)", async () => {
    const db = makeStubDb({ posted: false, saved: true });
    assert.equal(await ownsByJob(db, USER_ID, JOB_ID), true);
  });

  it("returns true when the user applied to the job (posted/saved = false)", async () => {
    const db = makeStubDb({ posted: false, saved: false, applied: true });
    assert.equal(await ownsByJob(db, USER_ID, JOB_ID), true);
  });

  it("returns false when none of the three paths match", async () => {
    const db = makeStubDb({ posted: false, saved: false, applied: false });
    assert.equal(await ownsByJob(db, USER_ID, JOB_ID), false);
  });

  it("resolves every ownership path in a single query", async () => {
    const db = makeStubDb({ posted: false, saved: false, applied: true });
    await ownsByJob(db, USER_ID, JOB_ID);
    assert.equal(db.stats.executed, 1);
  });
});
