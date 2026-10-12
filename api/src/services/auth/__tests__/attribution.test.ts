/**
 * Referral attribution helper tests (gaps #1683 / #1684).
 *
 * recordReferralAttribution is the shared seam the password-register AND the
 * OAuth callback both use, so these cover: normal attribution, the
 * self-referral guards (owner + same-IP), disabled/unknown codes, and the
 * click → signup back-link that closes the affiliate funnel.
 *
 * Run: node --import tsx --test src/services/auth/__tests__/attribution.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFakeDb } from "../../../handlers/__testing__/fake-db.js";
import { recordReferralAttribution } from "../attribution.js";

function makeDb(seed: Record<string, any[]> = {}) {
  return buildFakeDb({
    users: [],
    affiliate_profiles: [],
    affiliate_referrals: [],
    affiliate_link_clicks: [],
    ...seed,
  });
}

const AFFILIATE = { id: "aff-1", userId: "u-owner", referralCode: "JANE42", status: "active" };

describe("recordReferralAttribution", () => {
  it("attributes a new signup to an active affiliate", async () => {
    const { db, state } = makeDb({
      users: [{ id: "u-owner", signupIp: "1.1.1.1" }],
      affiliate_profiles: [{ ...AFFILIATE }],
    });
    await recordReferralAttribution(
      { referralCode: "JANE42", userId: "u-new", ipAddress: "2.2.2.2", userAgent: "UA" },
      db,
    );
    assert.equal(state.affiliate_referrals.length, 1);
    assert.equal(state.affiliate_referrals[0]!.affiliateId, "aff-1");
    assert.equal(state.affiliate_referrals[0]!.referredUserId, "u-new");
  });

  it("drops a self-referral (affiliate owns the code)", async () => {
    const { db, state } = makeDb({
      users: [{ id: "u-owner", signupIp: "1.1.1.1" }],
      affiliate_profiles: [{ ...AFFILIATE }],
    });
    await recordReferralAttribution({ referralCode: "JANE42", userId: "u-owner", ipAddress: "9.9.9.9" }, db);
    assert.equal(state.affiliate_referrals.length, 0);
  });

  it("drops a same-device signup (affiliate owner's signup IP)", async () => {
    const { db, state } = makeDb({
      users: [{ id: "u-owner", signupIp: "1.1.1.1" }],
      affiliate_profiles: [{ ...AFFILIATE }],
    });
    await recordReferralAttribution({ referralCode: "JANE42", userId: "u-new", ipAddress: "1.1.1.1" }, db);
    assert.equal(state.affiliate_referrals.length, 0);
  });

  it("ignores a disabled affiliate code", async () => {
    const { db, state } = makeDb({
      affiliate_profiles: [{ ...AFFILIATE, status: "disabled" }],
    });
    await recordReferralAttribution({ referralCode: "JANE42", userId: "u-new", ipAddress: "2.2.2.2" }, db);
    assert.equal(state.affiliate_referrals.length, 0);
  });

  it("ignores an unknown code (no-op)", async () => {
    const { db, state } = makeDb();
    await recordReferralAttribution({ referralCode: "NOPE", userId: "u-new", ipAddress: "2.2.2.2" }, db);
    assert.equal(state.affiliate_referrals.length, 0);
  });

  it("back-links the affiliate's unconverted click from the same IP (funnel close)", async () => {
    const { db, state } = makeDb({
      users: [{ id: "u-owner", signupIp: "1.1.1.1" }],
      affiliate_profiles: [{ ...AFFILIATE }],
      affiliate_link_clicks: [
        { id: "clk-1", affiliateId: "aff-1", ipAddress: "2.2.2.2", convertedReferralId: null },
        { id: "clk-2", affiliateId: "aff-1", ipAddress: "3.3.3.3", convertedReferralId: null },
      ],
    });
    await recordReferralAttribution({ referralCode: "JANE42", userId: "u-new", ipAddress: "2.2.2.2" }, db);
    const referralId = state.affiliate_referrals[0]!.id;
    assert.equal(state.affiliate_link_clicks.find((c) => c.id === "clk-1")!.convertedReferralId, referralId);
    // A click from a different IP is left untouched.
    assert.equal(state.affiliate_link_clicks.find((c) => c.id === "clk-2")!.convertedReferralId, null);
  });
});
