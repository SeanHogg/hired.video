/**
 * Redemption engine — points → tokens / premium-month / gift-card /
 * campaign-dollars conversion math, insufficient-balance + suspension
 * rejection, KYC parking, and the refund-on-vendor-failure path.
 *
 * Drives the real RedemptionEngine against the in-memory FakePointsRepo
 * plus thin token / subscription / Tremendous fakes.
 *
 * Run: node --import tsx --test src/domains/gamification/__tests__/redemption-engine.test.ts
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { RedemptionEngine, W9_YTD_THRESHOLD_CENTS } from "../redemption-engine.js";
import type { Repos } from "../../../repositories/index.js";
import { FakePointsRepo, uid } from "./fake-points-repo.js";

const NOW = new Date("2026-06-07T12:00:00Z");

interface Fakes {
  points: FakePointsRepo;
  tokenGrants: Array<{ userId: string; tokens: number }>;
  planOverrides: Array<{ userId: string; planSlug: string; expiresAt: Date }>;
  giftOrders: Array<{ externalId: string; amountDollars: number }>;
}

function build(opts: { tremendous?: "ok" | "down" | "missing"; orderStatus?: string } = {}) {
  const points = new FakePointsRepo(() => NOW);
  const fakes: Fakes = { points, tokenGrants: [], planOverrides: [], giftOrders: [] };

  const repos = {
    points,
    tokens: {
      async upsertBalance(userId: string, tokens: number) {
        fakes.tokenGrants.push({ userId, tokens });
      },
    },
    subscriptions: {
      async upsertOverride(args: { userId: string; planSlug: string; expiresAt: Date }) {
        fakes.planOverrides.push({ userId: args.userId, planSlug: args.planSlug, expiresAt: args.expiresAt });
      },
    },
  } as unknown as Repos;

  const buildTremendous = () => {
    if (opts.tremendous === "missing") return null;
    return {
      async createOrder(args: { externalId: string; amountDollars: number }) {
        if (opts.tremendous === "down") throw new Error("Tremendous outage");
        fakes.giftOrders.push({ externalId: args.externalId, amountDollars: args.amountDollars });
        return { orderId: `ord-${args.externalId}`, status: opts.orderStatus ?? "EXECUTED" };
      },
    } as never;
  };

  const engine = new RedemptionEngine({ repos, buildTremendous, now: () => NOW });
  return { engine, points, fakes };
}

const fund = (points: FakePointsRepo, userId: string, balance: number) =>
  points.applyBalanceDelta(userId, balance, "earn");

describe("redemption-engine — rejections", () => {
  let user: string;
  beforeEach(() => {
    user = uid();
  });

  it("rejects an unknown SKU", async () => {
    const { engine } = build();
    const out = await engine.redeem({ skuId: "nope", user: { userId: user } });
    assert.equal(out.status, "rejected");
    if (out.status === "rejected") assert.equal(out.reason, "unknown_sku");
  });

  it("rejects when the balance is below the SKU cost", async () => {
    const { engine, points } = build();
    await fund(points, user, 499); // ai_credits_100k costs 500
    const out = await engine.redeem({ skuId: "ai_credits_100k", user: { userId: user } });
    assert.equal(out.status, "rejected");
    if (out.status === "rejected") assert.equal(out.reason, "insufficient_balance");
    // No debit happened.
    assert.equal((await points.findBalance(user))?.balance, 499);
  });

  it("rejects when the user is suspended", async () => {
    const { engine, points } = build();
    await fund(points, user, 10_000);
    await points.setSuspension(user, true, "review", null);
    const out = await engine.redeem({ skuId: "ai_credits_100k", user: { userId: user } });
    assert.equal(out.status, "rejected");
    if (out.status === "rejected") assert.equal(out.reason, "suspended");
  });
});

describe("redemption-engine — ai_credits", () => {
  it("debits points, grants tokens, and fulfills synchronously", async () => {
    const { engine, points, fakes } = build();
    const user = uid();
    await fund(points, user, 2_000);
    const out = await engine.redeem({ skuId: "ai_credits_500k", user: { userId: user } });
    assert.equal(out.status, "fulfilled");
    // 2000 - 2000 = 0 balance.
    assert.equal((await points.findBalance(user))?.balance, 0);
    assert.deepEqual(fakes.tokenGrants, [{ userId: user, tokens: 500_000 }]);
    if (out.status === "fulfilled") {
      assert.equal(out.redemption.status, "fulfilled");
      assert.equal(out.redemption.pointsCost, 2_000);
    }
  });

  it("leaves the remaining balance correct after a partial spend", async () => {
    const { engine, points } = build();
    const user = uid();
    await fund(points, user, 1_200);
    await engine.redeem({ skuId: "ai_credits_100k", user: { userId: user } }); // 500
    assert.equal((await points.findBalance(user))?.balance, 700);
  });
});

describe("redemption-engine — premium_month", () => {
  it("debits points and upserts a 30-day plan override", async () => {
    const { engine, points, fakes } = build();
    const user = uid();
    await fund(points, user, 10_000);
    const out = await engine.redeem({ skuId: "premium_1mo", user: { userId: user } });
    assert.equal(out.status, "fulfilled");
    assert.equal((await points.findBalance(user))?.balance, 0);
    assert.equal(fakes.planOverrides.length, 1);
    assert.equal(fakes.planOverrides[0].planSlug, "pro");
    // expiresAt = now + 30d.
    assert.equal(fakes.planOverrides[0].expiresAt.getTime(), NOW.getTime() + 30 * 86_400_000);
  });
});

describe("redemption-engine — gift_card", () => {
  it("fulfills via Tremendous when below the W-9 threshold", async () => {
    const { engine, points, fakes } = build({ tremendous: "ok" });
    const user = uid();
    await fund(points, user, 5_000); // gift_card_5 costs 5000, value $5 < $599
    const out = await engine.redeem({
      skuId: "gift_card_5",
      user: { userId: user, recipientName: "Ada", recipientEmail: "ada@x.com" },
    });
    assert.equal(out.status, "fulfilled");
    assert.equal(fakes.giftOrders.length, 1);
    assert.equal(fakes.giftOrders[0].amountDollars, 5);
    // YTD bumped for tax tracking.
    assert.equal((await points.findTaxStatus(user))?.ytdRedemptionCents, 500);
  });

  it("queues (not fulfilled) when Tremendous reports a non-terminal status", async () => {
    const { engine, points } = build({ tremendous: "ok", orderStatus: "PENDING" });
    const user = uid();
    await fund(points, user, 5_000);
    const out = await engine.redeem({
      skuId: "gift_card_5",
      user: { userId: user, recipientName: "Ada", recipientEmail: "ada@x.com" },
    });
    assert.equal(out.status, "queued");
  });

  it("parks for KYC (no Tremendous call) when crossing the $599 threshold without a W-9", async () => {
    const { engine, points, fakes } = build({ tremendous: "ok" });
    const user = uid();
    await fund(points, user, 50_000); // gift_card_50 = $50; seed YTD near threshold
    points.setTaxStatus(user, { ytdRedemptionCents: W9_YTD_THRESHOLD_CENTS - 100 });
    const out = await engine.redeem({
      skuId: "gift_card_50",
      user: { userId: user, recipientName: "Ada", recipientEmail: "ada@x.com" },
    });
    assert.equal(out.status, "pending_kyc");
    assert.equal(fakes.giftOrders.length, 0); // no vendor order yet
    // Points were still debited up front.
    assert.equal((await points.findBalance(user))?.balance, 0);
  });

  it("refunds points + marks failed when the vendor is down", async () => {
    const { engine, points } = build({ tremendous: "down" });
    const user = uid();
    await fund(points, user, 5_000);
    const out = await engine.redeem({
      skuId: "gift_card_5",
      user: { userId: user, recipientName: "Ada", recipientEmail: "ada@x.com" },
    });
    assert.equal(out.status, "rejected");
    if (out.status === "rejected") assert.equal(out.reason, "vendor_unavailable");
    // Debit (-5000) then refund (+5000) → balance back to full.
    assert.equal((await points.findBalance(user))?.balance, 5_000);
    const redemption = points.redemptions[0];
    assert.equal(redemption.status, "failed");
  });
});

describe("redemption-engine — campaign_dollars", () => {
  it("grants campaign credit without bumping YTD (not 1099 income)", async () => {
    const { engine, points } = build();
    const user = uid();
    await fund(points, user, 5_000);
    const out = await engine.redeem({ skuId: "campaign_dollars_5", user: { userId: user } });
    assert.equal(out.status, "fulfilled");
    assert.deepEqual(points.campaignGrants, [
      { userId: user, amountCents: 500, redemptionId: points.redemptions[0].id },
    ]);
    // Campaign $ deliberately skips the tax YTD line.
    assert.equal(await points.findTaxStatus(user), null);
  });
});
