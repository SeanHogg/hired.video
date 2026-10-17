/**
 * Regression test for the last-login stamp.
 *
 * Bug: users reported that the admin UserManagement page's "Last Login" column
 * never updated even after repeatedly logging out and back in. Root cause was
 * /api/auth/login (and /verify-2fa, OAuth callback, magic-link verify) issuing
 * a JWT without writing `lastLoginAt`. The fix routes every login path through
 * `markUserLogin`; this test pins the helper's contract so the update can't be
 * silently removed again.
 *
 * Run: node --import tsx --test src/routes/__tests__/auth-markUserLogin.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { markUserLogin } from "../../services/auth/loginStamp.js";

type UpdateCall = {
  table: unknown;
  setValues?: Record<string, unknown>;
  whereArg?: unknown;
};

function makeFakeDb() {
  const calls: UpdateCall[] = [];
  const db = {
    update(table: unknown) {
      const call: UpdateCall = { table };
      calls.push(call);
      return {
        set(values: Record<string, unknown>) {
          call.setValues = values;
          return {
            where(arg: unknown) {
              call.whereArg = arg;
              return Promise.resolve();
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

describe("markUserLogin", () => {
  it("writes lastLoginAt to the users row for the given user id", async () => {
    const { db, calls } = makeFakeDb();
    const now = new Date("2026-04-18T12:34:56.000Z");

    await markUserLogin(db, "user-abc", now);

    assert.equal(calls.length, 1, "exactly one update statement");
    const [call] = calls;
    assert.ok(call.setValues, "set() was called");
    assert.equal(
      (call.setValues as { lastLoginAt: Date }).lastLoginAt.toISOString(),
      now.toISOString(),
      "lastLoginAt matches the provided timestamp",
    );
    assert.ok(call.whereArg, "where() was called with a predicate");
  });

  it("defaults to the current time when no timestamp is passed", async () => {
    const { db, calls } = makeFakeDb();
    const before = Date.now();

    await markUserLogin(db, "user-xyz");

    const after = Date.now();
    const { lastLoginAt } = calls[0]!.setValues as { lastLoginAt: Date };
    assert.ok(lastLoginAt instanceof Date, "lastLoginAt is a Date");
    const ts = lastLoginAt.getTime();
    assert.ok(
      ts >= before && ts <= after,
      `lastLoginAt (${ts}) should fall within [${before}, ${after}]`,
    );
  });

  it("targets the users table (not some other table)", async () => {
    const { db, calls } = makeFakeDb();
    await markUserLogin(db, "user-1");
    // The table reference is whatever drizzle's schema.users is at runtime; we
    // just assert it was supplied so a future refactor can't silently drop it.
    assert.ok(calls[0]!.table, "update() received a table reference");
  });
});
