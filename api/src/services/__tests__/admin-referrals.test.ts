/**
 * assembleReferralGroups — pure grouping/merge for the SuperAdmin
 * "referred users by referrer" view.
 *
 * The loader's two SQL reads use joins the fake-db harness can't evaluate, so
 * the DB-touching part isn't unit-tested here; this covers the logic that
 * actually carries risk: bucketing referred users under the right affiliate,
 * keeping aggregate counts authoritative (even past the detail cap), deriving
 * the converted flag, and skipping orphaned (deleted-user) referrals.
 *
 * Run: node --import tsx --test src/services/__tests__/admin-referrals.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  assembleReferralGroups,
  type RawReferralGroupCount,
  type RawReferralDetailRow,
} from "../adminReferrals.js";

const T1 = new Date("2026-06-01T00:00:00.000Z");
const T2 = new Date("2026-06-02T00:00:00.000Z");

function group(over: Partial<RawReferralGroupCount> = {}): RawReferralGroupCount {
  return {
    affiliateId: "aff-1",
    referralCode: "JANE42",
    referrerUserId: "u-owner",
    referrerName: "Jane",
    referrerEmail: "jane@example.com",
    referredCount: 1,
    convertedCount: 0,
    ...over,
  };
}

function detail(over: Partial<RawReferralDetailRow> = {}): RawReferralDetailRow {
  return {
    affiliateId: "aff-1",
    referredUserId: "u-new",
    referredName: "New User",
    referredEmail: "new@example.com",
    referredRole: "job_seeker",
    referredAt: T1,
    convertedAt: null,
    ...over,
  };
}

describe("assembleReferralGroups", () => {
  it("buckets referred users under the right affiliate and totals counts", () => {
    const result = assembleReferralGroups(
      [
        group({ affiliateId: "aff-1", referralCode: "JANE42", referredCount: 2, convertedCount: 1 }),
        group({ affiliateId: "aff-2", referralCode: "BOB99", referrerUserId: "u-bob", referrerName: "Bob", referredCount: 1, convertedCount: 0 }),
      ],
      [
        detail({ affiliateId: "aff-1", referredUserId: "u-a", referredName: "A", convertedAt: T2 }),
        detail({ affiliateId: "aff-1", referredUserId: "u-b", referredName: "B" }),
        detail({ affiliateId: "aff-2", referredUserId: "u-c", referredName: "C" }),
      ],
      false,
    );

    assert.equal(result.groups.length, 2);
    const aff1 = result.groups.find((g) => g.affiliateId === "aff-1")!;
    const aff2 = result.groups.find((g) => g.affiliateId === "aff-2")!;
    assert.deepEqual(aff1.referredUsers.map((u) => u.id), ["u-a", "u-b"]);
    assert.deepEqual(aff2.referredUsers.map((u) => u.id), ["u-c"]);
    assert.equal(result.totalReferred, 3);
    assert.equal(result.totalConverted, 1);
    assert.equal(result.truncated, false);
  });

  it("keeps aggregate counts authoritative even when detail rows are fewer (truncation)", () => {
    // 5 referrals reported by the aggregate, but only 1 detail row hydrated.
    const result = assembleReferralGroups(
      [group({ referredCount: 5, convertedCount: 2 })],
      [detail({ referredUserId: "u-recent" })],
      true,
    );
    const g = result.groups[0]!;
    assert.equal(g.referredCount, 5); // count is not derived from the list
    assert.equal(g.convertedCount, 2);
    assert.equal(g.referredUsers.length, 1);
    assert.equal(result.totalReferred, 5);
    assert.equal(result.truncated, true);
  });

  it("derives the converted flag from convertedAt", () => {
    const result = assembleReferralGroups(
      [group({ referredCount: 2 })],
      [
        detail({ referredUserId: "u-paid", convertedAt: T2 }),
        detail({ referredUserId: "u-free", convertedAt: null }),
      ],
      false,
    );
    const users = result.groups[0]!.referredUsers;
    assert.equal(users.find((u) => u.id === "u-paid")!.converted, true);
    assert.equal(users.find((u) => u.id === "u-free")!.converted, false);
  });

  it("skips orphaned referrals (referred user deleted → null)", () => {
    const result = assembleReferralGroups(
      [group({ referredCount: 2 })],
      [
        detail({ referredUserId: "u-live", referredName: "Live" }),
        detail({ referredUserId: null, referredName: null }),
      ],
      false,
    );
    // Count stays 2 (authoritative), but only the live user is listed.
    assert.equal(result.groups[0]!.referredCount, 2);
    assert.deepEqual(result.groups[0]!.referredUsers.map((u) => u.id), ["u-live"]);
  });

  it("returns an empty view for no referrals", () => {
    const result = assembleReferralGroups([], [], false);
    assert.deepEqual(result, { groups: [], totalReferred: 0, totalConverted: 0, truncated: false });
  });
});
