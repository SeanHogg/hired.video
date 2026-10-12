/**
 * Regression tests for the seed routine (gap #1593).
 *
 * The bug we're locking down: previously `seedSuperAdminAndCompany` ran on
 * every fetch in worker.ts, guarded only by a module-level `let seeded =
 * false` flag. Cloudflare Workers are stateless, so the flag reset on
 * every isolate cold-start. The existing-user branch then re-hashed the
 * superadmin password and ran an UPDATE — silently resetting whatever
 * password the user had set through the app.
 *
 * These tests assert the contract that prevents that bug from coming back:
 *   1. First call CREATES the user with the configured password hash.
 *   2. Second call does NOT issue an UPDATE on the user row.
 *   3. Second call does NOT re-hash the password.
 *   4. The user's password hash is bit-identical before/after the second
 *      call (would have failed under the old "refresh" behaviour).
 *   5. Company profile / membership / article inserts are idempotent on
 *      repeat calls (no duplicates).
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { buildFakeDb } from "../handlers/__testing__/fake-db.js";
import { runSeed, type SeedOpts } from "../seed.js";

const OPTS: SeedOpts = {
  email: "test-super-admin@example.com",
  password: "TestPassword!23",
  name: "Test Admin",
  role: "super_admin",
  companyName: "Test Co",
};

function seedState() {
  return {
    users: [] as Array<Record<string, unknown>>,
    company_profiles: [] as Array<Record<string, unknown>>,
    user_company_role_associations: [] as Array<Record<string, unknown>>,
    articles: [] as Array<Record<string, unknown>>,
  };
}

describe("runSeed — superadmin + company seed contract", () => {
  it("creates the user on first call when no row exists", async () => {
    const { db, state, calls } = buildFakeDb(seedState());

    await runSeed(db as any, OPTS);

    assert.equal(state.users.length, 1, "user row was created");
    assert.equal(state.users[0].email, OPTS.email);
    assert.equal(state.users[0].role, OPTS.role);
    assert.equal(state.users[0].emailVerified, true);
    assert.ok(
      typeof state.users[0].passwordHash === "string" &&
        (state.users[0].passwordHash as string).includes(":"),
      "password hash was written in the PBKDF2 salt:hash format",
    );
    const userInserts = calls.filter(
      (c) => c.kind === "insert" && c.table === "users",
    );
    assert.equal(userInserts.length, 1, "exactly one users INSERT");
  });

  it("does NOT update the user row on a second call (#1593 regression)", async () => {
    const { db, state, calls } = buildFakeDb(seedState());

    await runSeed(db as any, OPTS);
    const passwordHashAfterFirst = state.users[0].passwordHash;
    const updatesAfterFirst = calls.filter(
      (c) => c.kind === "update" && c.table === "users",
    ).length;

    await runSeed(db as any, OPTS);

    assert.equal(state.users.length, 1, "still exactly one user row");
    assert.equal(
      state.users[0].passwordHash,
      passwordHashAfterFirst,
      "password hash is bit-identical — re-hash on existing-user branch is gone",
    );
    const updatesAfterSecond = calls.filter(
      (c) => c.kind === "update" && c.table === "users",
    ).length;
    assert.equal(
      updatesAfterSecond - updatesAfterFirst,
      0,
      "second runSeed call issued zero UPDATEs on the users table",
    );
  });

  it("does not duplicate company profiles on repeat calls", async () => {
    const { db, state } = buildFakeDb(seedState());

    await runSeed(db as any, OPTS);
    const profilesAfterFirst = state.company_profiles.length;

    await runSeed(db as any, OPTS);
    await runSeed(db as any, OPTS);

    assert.equal(
      state.company_profiles.length,
      profilesAfterFirst,
      "no duplicate company profile rows after three runSeed calls",
    );
  });

  it("does not duplicate company memberships on repeat calls", async () => {
    const { db, state } = buildFakeDb(seedState());

    await runSeed(db as any, OPTS);
    const membershipsAfterFirst = state.user_company_role_associations.length;

    await runSeed(db as any, OPTS);

    assert.equal(
      state.user_company_role_associations.length,
      membershipsAfterFirst,
      "no duplicate user_company_role_associations rows",
    );
  });
});
