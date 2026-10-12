/**
 * Coupon use cases — create, redeem (grant, stacking, refusals, cap,
 * compensation) and the shared eligibility rule. In-memory fakes behind the
 * CouponDeps ports; assertions are on observable outcomes (result, override
 * row, counts, audit).
 *
 * Run: node --import tsx --test src/services/coupons/__tests__/couponUseCases.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  CouponError,
  createCoupon,
  redeemCoupon,
  updateCoupon,
  type CouponDeps,
} from "../couponUseCases.js";
import type { CouponRow } from "../couponRepository.js";
import type { PlanOverrideInsert, PlanOverrideRow } from "../../../repositories/index.js";
import type { SubscriptionSummaryDTO } from "../../../../../shared/billing.js";
import { canRedeemCoupon } from "../../../../../shared/coupons.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-08T12:00:00Z");
const ADMIN = randomUUID();

function freePlan(): SubscriptionSummaryDTO {
  return {
    planId: "free", planName: "Free", isPro: false, price: 0, currency: "USD",
    interval: "month", status: "active", cancelAtPeriodEnd: false, subscribed: false, compedUntil: null,
  };
}

function makeWorld(opts: { plan?: (userId: string) => SubscriptionSummaryDTO; failUpsert?: boolean } = {}) {
  const coupons = new Map<string, CouponRow>();
  const redemptions: Array<{ id: string; couponId: string; userId: string; grantedUntil: Date }> = [];
  const overrides = new Map<string, PlanOverrideRow>();
  const audits: string[] = [];
  const invalidated: string[] = [];
  let codeSeq = 0;

  const planFor = (userId: string): SubscriptionSummaryDTO => {
    if (opts.plan) return opts.plan(userId);
    const o = overrides.get(userId);
    if (o && o.planSlug === "pro" && o.expiresAt && o.expiresAt > NOW) {
      return { ...freePlan(), planId: "pro", planName: "Pro", isPro: true, compedUntil: o.expiresAt.toISOString() };
    }
    return freePlan();
  };

  const deps: CouponDeps = {
    coupons: {
      async insertCoupon(row) {
        if ([...coupons.values()].some((c) => c.code === row.code)) return null;
        const created: CouponRow = {
          id: randomUUID(), redemptionCount: 0, isActive: true, createdAt: NOW, updatedAt: NOW, ...row,
        };
        coupons.set(created.id, created);
        return created;
      },
      async listCoupons() { return [...coupons.values()]; },
      async findCouponByCode(code) { return [...coupons.values()].find((c) => c.code === code) ?? null; },
      async updateCoupon(id, patch) {
        const c = coupons.get(id);
        if (!c) return null;
        Object.assign(c, patch);
        return c;
      },
      async claimRedemptionSlot(id, now) {
        const c = coupons.get(id);
        if (!c || !c.isActive) return false;
        if (c.expiresAt && c.expiresAt <= now) return false;
        if (c.maxRedemptions != null && c.redemptionCount >= c.maxRedemptions) return false;
        c.redemptionCount++;
        return true;
      },
      async releaseRedemptionSlot(id) {
        const c = coupons.get(id);
        if (c) c.redemptionCount = Math.max(0, c.redemptionCount - 1);
      },
      async hasRedeemed(couponId, userId) {
        return redemptions.some((r) => r.couponId === couponId && r.userId === userId);
      },
      async insertRedemption(row) {
        if (redemptions.some((r) => r.couponId === row.couponId && r.userId === row.userId)) return null;
        const id = randomUUID();
        redemptions.push({ id, ...row });
        return { id };
      },
      async deleteRedemption(id) {
        const i = redemptions.findIndex((r) => r.id === id);
        if (i >= 0) redemptions.splice(i, 1);
      },
      async listRedemptions() { return []; },
    },
    plans: {
      async findOverrideByUserId(userId) { return overrides.get(userId) ?? null; },
      async upsertOverride(input: PlanOverrideInsert) {
        if (opts.failUpsert) throw new Error("db down");
        const row = { grantedAt: NOW, updatedAt: NOW, ...input } as PlanOverrideRow;
        overrides.set(input.userId, row);
        return row;
      },
      async getSubscription(userId) { return planFor(userId); },
      invalidateForUser(userId) { invalidated.push(userId); },
    },
    audit: { async log(e) { audits.push(e.action); } },
    now: () => NOW,
    generateCode: () => `GEN${String(++codeSeq).padStart(5, "0")}`,
  };
  return { deps, coupons, redemptions, overrides, audits, invalidated };
}

const defaults = { durationDays: 30, maxRedemptions: null, expiresAt: null, note: "" };

async function expectKind(p: Promise<unknown>, kind: string) {
  await assert.rejects(p, (err: unknown) => err instanceof CouponError && err.kind === kind);
}

describe("createCoupon", () => {
  it("creates with the given code and audits it", async () => {
    const w = makeWorld();
    const c = await createCoupon(w.deps, { ...defaults, code: "WELCOME", actorId: ADMIN });
    assert.equal(c.code, "WELCOME");
    assert.equal(c.durationDays, 30);
    assert.deepEqual(w.audits, ["COUPON_CREATED"]);
  });

  it("generates a code when none is given", async () => {
    const w = makeWorld();
    const c = await createCoupon(w.deps, { ...defaults, actorId: ADMIN });
    assert.equal(c.code, "GEN00001");
  });

  it("refuses a duplicate explicit code", async () => {
    const w = makeWorld();
    await createCoupon(w.deps, { ...defaults, code: "DUP1", actorId: ADMIN });
    await expectKind(createCoupon(w.deps, { ...defaults, code: "DUP1", actorId: ADMIN }), "CODE_TAKEN");
  });
});

describe("redeemCoupon", () => {
  it("grants Pro for durationDays from now and busts the plan cache", async () => {
    const w = makeWorld();
    await createCoupon(w.deps, { ...defaults, code: "FREEMONTH", actorId: ADMIN });
    const user = randomUUID();
    const res = await redeemCoupon(w.deps, { userId: user, isGuest: false, code: "FREEMONTH" });
    assert.equal(res.grantedUntil, new Date(NOW.getTime() + 30 * DAY).toISOString());
    const o = w.overrides.get(user)!;
    assert.equal(o.planSlug, "pro");
    assert.equal(o.grantedBy, ADMIN);
    assert.equal(o.reason, "Coupon FREEMONTH");
    assert.deepEqual(w.invalidated, [user]);
    assert.equal([...w.coupons.values()][0]!.redemptionCount, 1);
    assert.ok(w.audits.includes("COUPON_REDEEMED"));
  });

  it("stacks a second code onto an active comp", async () => {
    const w = makeWorld();
    await createCoupon(w.deps, { ...defaults, code: "FIRST", actorId: ADMIN });
    await createCoupon(w.deps, { ...defaults, code: "SECOND", durationDays: 10, actorId: ADMIN });
    const user = randomUUID();
    await redeemCoupon(w.deps, { userId: user, isGuest: false, code: "FIRST" });
    const res = await redeemCoupon(w.deps, { userId: user, isGuest: false, code: "SECOND" });
    assert.equal(res.grantedUntil, new Date(NOW.getTime() + 40 * DAY).toISOString());
  });

  it("keeps an active SuperAdmin token cap", async () => {
    const w = makeWorld();
    await createCoupon(w.deps, { ...defaults, code: "CAPKEEP", actorId: ADMIN });
    const user = randomUUID();
    w.overrides.set(user, {
      userId: user, planSlug: null, monthlyTokenLimit: 5000, expiresAt: null,
      reason: "cap", grantedBy: ADMIN, grantedAt: NOW, updatedAt: NOW,
    });
    await redeemCoupon(w.deps, { userId: user, isGuest: false, code: "CAPKEEP" });
    assert.equal(w.overrides.get(user)!.monthlyTokenLimit, 5000);
  });

  it("refuses unknown, inactive and expired codes", async () => {
    const w = makeWorld();
    const user = randomUUID();
    await expectKind(redeemCoupon(w.deps, { userId: user, isGuest: false, code: "NOPE" }), "INVALID_CODE");
    const off = await createCoupon(w.deps, { ...defaults, code: "OFF1", actorId: ADMIN });
    await updateCoupon(w.deps, { id: off.id, actorId: ADMIN, patch: { isActive: false } });
    await expectKind(redeemCoupon(w.deps, { userId: user, isGuest: false, code: "OFF1" }), "INVALID_CODE");
    await createCoupon(w.deps, { ...defaults, code: "OLD1", expiresAt: new Date(NOW.getTime() - DAY).toISOString(), actorId: ADMIN });
    await expectKind(redeemCoupon(w.deps, { userId: user, isGuest: false, code: "OLD1" }), "EXPIRED");
  });

  it("refuses a second redemption of the same code by the same user", async () => {
    const w = makeWorld();
    await createCoupon(w.deps, { ...defaults, code: "ONCE", actorId: ADMIN });
    const user = randomUUID();
    await redeemCoupon(w.deps, { userId: user, isGuest: false, code: "ONCE" });
    await expectKind(redeemCoupon(w.deps, { userId: user, isGuest: false, code: "ONCE" }), "ALREADY_REDEEMED");
  });

  it("enforces max redemptions", async () => {
    const w = makeWorld();
    await createCoupon(w.deps, { ...defaults, code: "ONLY1", maxRedemptions: 1, actorId: ADMIN });
    await redeemCoupon(w.deps, { userId: randomUUID(), isGuest: false, code: "ONLY1" });
    await expectKind(redeemCoupon(w.deps, { userId: randomUUID(), isGuest: false, code: "ONLY1" }), "EXHAUSTED");
  });

  it("refuses guests and users already on paid Pro", async () => {
    const w = makeWorld({ plan: () => ({ ...freePlan(), planId: "pro", isPro: true, subscribed: true }) });
    await createCoupon(w.deps, { ...defaults, code: "PAID", actorId: ADMIN });
    await expectKind(redeemCoupon(w.deps, { userId: randomUUID(), isGuest: true, code: "PAID" }), "ACCOUNT_REQUIRED");
    await expectKind(redeemCoupon(w.deps, { userId: randomUUID(), isGuest: false, code: "PAID" }), "ALREADY_PRO");
    assert.equal([...w.coupons.values()][0]!.redemptionCount, 0);
  });

  it("undoes the redemption and slot when the grant write fails", async () => {
    const w = makeWorld({ failUpsert: true });
    await createCoupon(w.deps, { ...defaults, code: "FLAKY", maxRedemptions: 1, actorId: ADMIN });
    await assert.rejects(redeemCoupon(w.deps, { userId: randomUUID(), isGuest: false, code: "FLAKY" }), /db down/);
    assert.equal(w.redemptions.length, 0);
    assert.equal([...w.coupons.values()][0]!.redemptionCount, 0);
  });
});

describe("canRedeemCoupon", () => {
  it("allows free users and time-boxed Pro comps only", () => {
    const base = { isPro: false, planId: "free", subscribed: false, compedUntil: null };
    assert.equal(canRedeemCoupon(base), true);
    assert.equal(canRedeemCoupon({ ...base, isPro: true, planId: "pro", compedUntil: NOW.toISOString() }), true);
    assert.equal(canRedeemCoupon({ ...base, isPro: true, planId: "pro" }), false); // paid / permanent
    assert.equal(canRedeemCoupon({ ...base, isPro: true, planId: "unlimited", compedUntil: NOW.toISOString() }), false);
    assert.equal(canRedeemCoupon({ ...base, subscribed: true }), false);
  });
});
