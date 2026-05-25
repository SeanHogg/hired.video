/**
 * Tests for `recordAffiliateConversion` in routes/payment.ts.
 *
 * Closes #1196 (re-credit guard) and #1197 (totalEarned accumulator)
 * regression coverage. Before the fix:
 *   • Every recurring-subscription webhook re-credited the same
 *     referral — affiliates earned commission every month per referred
 *     user instead of once at conversion.
 *   • The totalEarned accumulator read `existing[0]?.totalEarned` on an
 *     already-destructured row, so `existing[0]` was always `undefined`
 *     and the lifetime total was overwritten to the single conversion
 *     value on every credit.
 *
 * Both bugs were silent: the affiliate dashboards showed numbers, just
 * the wrong numbers. Tests here are the only way to keep them dead.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { recordAffiliateConversion } from "../payment.js";
import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";

function makeDb() {
  const fake = buildFakeDb({
    affiliate_profiles: [
      { id: "aff-1", userId: "owner-1", referralCode: "JANE42", status: "active", commissionRate: "0.10", specialtySectors: [], totalEarned: "0", totalPaid: "0", createdAt: new Date(), updatedAt: new Date() },
    ] as any,
    affiliate_referrals: [
      { id: "ref-1", affiliateId: "aff-1", referredUserId: "user-1", referralCode: "JANE42", convertedAt: null, createdAt: new Date(), landingSector: null } as any,
    ] as any,
    affiliate_conversions: [] as any,
  });
  return fake;
}

describe("recordAffiliateConversion", () => {
  it("credits the affiliate exactly once even when called twice for the same user (#1196 idempotency)", async () => {
    const fake = makeDb();
    await recordAffiliateConversion(fake.db as any, "user-1", 100, "USD");
    // Second call simulates the monthly Stripe subscription webhook.
    await recordAffiliateConversion(fake.db as any, "user-1", 100, "USD");

    const conversions = (fake.state as any).affiliate_conversions;
    assert.equal(conversions.length, 1, "only one conversion row written across two webhook fires");
    assert.equal(conversions[0].revenue, "100");
    assert.equal(conversions[0].commission, "10", "10% of $100 = $10");

    // convertedAt is stamped on the referral after the first credit.
    const referrals = (fake.state as any).affiliate_referrals;
    assert.ok(referrals[0].convertedAt instanceof Date, "convertedAt timestamp stamped on referral");
  });

  it("returns early when no referral exists for the user (organic conversion)", async () => {
    const fake = makeDb();
    await recordAffiliateConversion(fake.db as any, "no-referral-user", 50, "USD");
    const conversions = (fake.state as any).affiliate_conversions;
    assert.equal(conversions.length, 0, "no commission credited without a referral");
  });

  it("returns early when the referral is already marked convertedAt (no double-credit)", async () => {
    const fake = makeDb();
    (fake.state as any).affiliate_referrals[0].convertedAt = new Date("2026-01-01");

    await recordAffiliateConversion(fake.db as any, "user-1", 100, "USD");
    const conversions = (fake.state as any).affiliate_conversions;
    assert.equal(conversions.length, 0, "pre-converted referral does not produce a fresh conversion");
  });

  it("accumulates totalEarned across multiple referrals (#1197 — existing.totalEarned must add, not overwrite)", async () => {
    // Two distinct referrals on the same affiliate. Each conversion
    // should ADD to the affiliate's totalEarned, not overwrite it.
    const fake = buildFakeDb({
      affiliate_profiles: [
        { id: "aff-1", userId: "owner-1", referralCode: "JANE42", status: "active", commissionRate: "0.10", specialtySectors: [], totalEarned: "0", totalPaid: "0", createdAt: new Date(), updatedAt: new Date() },
      ] as any,
      affiliate_referrals: [
        { id: "ref-A", affiliateId: "aff-1", referredUserId: "user-A", referralCode: "JANE42", convertedAt: null, createdAt: new Date(), landingSector: null } as any,
        { id: "ref-B", affiliateId: "aff-1", referredUserId: "user-B", referralCode: "JANE42", convertedAt: null, createdAt: new Date(), landingSector: null } as any,
      ] as any,
      affiliate_conversions: [] as any,
    });

    await recordAffiliateConversion(fake.db as any, "user-A", 100, "USD"); // +$10
    await recordAffiliateConversion(fake.db as any, "user-B", 250, "USD"); // +$25

    const profile = (fake.state as any).affiliate_profiles[0];
    // The previous bug overwrote to the latest value, which would have been "25".
    assert.equal(profile.totalEarned, "35", "lifetime total accumulates ($10 + $25 = $35)");
  });
});
