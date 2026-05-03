/**
 * Tests for the AccountLock service.
 *
 * The same lockAccount/unlockAccount/isAccountLocked fns power the
 * brute-force counter (Phase 5) AND the SuperAdmin manual lock UI
 * (Phase 6). If these break, both surfaces break together.
 *
 * Run: node --import tsx --test src/services/__tests__/account-lock.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";
import { lockAccount, unlockAccount, isAccountLocked } from "../auth/lock.js";

function makeDb() {
  return buildFakeDb({ account_locks: [] as any });
}

describe("lockAccount", () => {
  it("inserts an active row", async () => {
    const { db, state } = makeDb();
    const lock = await lockAccount({
      db,
      userId: "u1",
      reason: "brute_force",
    });
    assert.equal(lock.userId, "u1");
    assert.equal(lock.reason, "brute_force");
    assert.equal(lock.active, true);
    assert.equal((state as any).account_locks.length, 1);
  });

  it("is idempotent — re-locking returns the existing active row", async () => {
    const { db, state } = makeDb();
    const first = await lockAccount({ db, userId: "u1", reason: "brute_force" });
    const second = await lockAccount({ db, userId: "u1", reason: "admin_manual" });
    assert.equal(first.id, second.id, "should return same lock id");
    assert.equal((state as any).account_locks.length, 1, "no second row");
  });

  it("records the lockedBy admin id when supplied", async () => {
    const { db } = makeDb();
    const lock = await lockAccount({
      db,
      userId: "u1",
      reason: "admin_manual",
      lockedBy: "admin-7",
      notes: "phishing attempt",
    });
    assert.equal(lock.lockedBy, "admin-7");
    assert.equal(lock.notes, "phishing attempt");
  });
});

describe("isAccountLocked", () => {
  it("returns null when no lock exists", async () => {
    const { db } = makeDb();
    assert.equal(await isAccountLocked(db, "u1"), null);
  });

  it("returns the active lock when present", async () => {
    const { db } = makeDb();
    await lockAccount({ db, userId: "u1", reason: "brute_force" });
    const lock = await isAccountLocked(db, "u1");
    assert.notEqual(lock, null);
    assert.equal(lock?.userId, "u1");
  });

  it("auto-clears expired locks on read (the brute-force unlock path)", async () => {
    const { db, state } = makeDb();
    await lockAccount({
      db,
      userId: "u1",
      reason: "brute_force",
      unlocksAt: new Date(Date.now() - 1000), // already past
    });
    const lock = await isAccountLocked(db, "u1");
    assert.equal(lock, null, "expired lock must auto-clear");
    const row = (state as any).account_locks[0];
    assert.equal(row.active, false, "row must be flipped inactive");
    assert.notEqual(row.unlockedAt, null);
  });

  it("does NOT auto-clear locks with no unlocksAt (manual-only)", async () => {
    const { db } = makeDb();
    await lockAccount({ db, userId: "u1", reason: "admin_manual", unlocksAt: null });
    const lock = await isAccountLocked(db, "u1");
    assert.notEqual(lock, null);
  });
});

describe("unlockAccount", () => {
  it("flips active=false and stamps unlockedAt + unlockedBy", async () => {
    const { db, state } = makeDb();
    await lockAccount({ db, userId: "u1", reason: "admin_manual" });
    await unlockAccount({ db, userId: "u1", unlockedBy: "admin-9" });
    const row = (state as any).account_locks[0];
    assert.equal(row.active, false);
    assert.equal(row.unlockedBy, "admin-9");
    assert.notEqual(row.unlockedAt, null);
  });

  it("makes a subsequent isAccountLocked return null", async () => {
    const { db } = makeDb();
    await lockAccount({ db, userId: "u1", reason: "brute_force" });
    await unlockAccount({ db, userId: "u1" });
    assert.equal(await isAccountLocked(db, "u1"), null);
  });

  it("is a no-op when no lock exists", async () => {
    const { db } = makeDb();
    await unlockAccount({ db, userId: "u-never-locked" });
    assert.equal(await isAccountLocked(db, "u-never-locked"), null);
  });
});
