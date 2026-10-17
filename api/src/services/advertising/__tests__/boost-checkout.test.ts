/**
 * Paid boost checkout — no boost goes active without a payment the
 * provider itself confirms (POST /api/checkout {kind:"boost"} reaches this
 * service; the verifier is the one token packs and courses use).
 *
 * Run: node --import tsx --test src/services/advertising/__tests__/boost-checkout.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  confirmBoostPayment,
  startBoostCheckout,
  startBoostPayment,
  type BoostCheckoutInput,
  type BoostCheckoutPort,
  type BoostRow,
  type CheckoutRecord,
} from "../boost-checkout.js";
import type { OneOffPaymentsPort } from "../../billing/payment/oneOffPayments.js";
import type { ProviderTransaction } from "../../billing/payment/types.js";

const USER = "c0ffee00-1234-4abc-8def-0123456789ab";
const OTHER = "deadbeef-1234-4abc-8def-0123456789ab";
const CUSTOMER = "CST1001";
const NOW = new Date("2026-10-10T12:00:00.000Z");

const INPUT: BoostCheckoutInput = {
  subjectType: "resume",
  subjectId: "4f2c9a7e-1b3d-4e8f-9a6b-2c5d7e9f1a3b",
  budgetCents: 1000,
  durationDays: 7,
  placementType: "feed_top",
  pricingModel: "flat",
};

/** In-memory port shaped like the boosts + boost_checkouts tables;
 *  `usedPaymentIds` stands in for ids already on another checkout / pack. */
function fakePort(campaignBalanceCents: number, usedPaymentIds: string[] = []) {
  const boosts = new Map<string, BoostRow>();
  const checkouts = new Map<string, CheckoutRecord>();
  const used = new Set(usedPaymentIds);
  let balance = campaignBalanceCents;
  let n = 0;
  const port: BoostCheckoutPort = {
    async insertPendingBoost(row) {
      const id = `boost-${++n}`;
      const created = { id, spentCents: 0, impressions: 0, clicks: 0, stripePaymentIntentId: null, createdAt: NOW, updatedAt: NOW, ...row } as BoostRow;
      boosts.set(id, created);
      return created;
    },
    async insertCheckout(row) {
      const id = `checkout-${++n}`;
      checkouts.set(id, { id, userId: row.userId, boostId: row.boostId, usdCents: 0, status: "pending", providerPaymentId: null });
      return { id };
    },
    async spendCampaignDollars({ maxCents }) {
      const spent = Math.min(balance, maxCents);
      balance -= spent;
      return { spentCents: spent };
    },
    async recordSplit(id, split) {
      const c = checkouts.get(id)!;
      c.status = split.paid ? "paid" : "pending";
      c.usdCents = split.usdCents;
    },
    async activateBoost(id) {
      const b = boosts.get(id);
      if (!b) return null;
      const next = { ...b, status: "active" };
      boosts.set(id, next);
      return next;
    },
    async findCheckout(id) {
      return checkouts.get(id) ?? null;
    },
    async findCheckoutForBoost(boostId) {
      return [...checkouts.values()].reverse().find((c) => c.boostId === boostId) ?? null;
    },
    async claimPayment(id, providerPaymentId) {
      const c = checkouts.get(id)!;
      if (c.status !== "pending" || used.has(providerPaymentId)) return false;
      used.add(providerPaymentId);
      c.status = "paid";
      c.providerPaymentId = providerPaymentId;
      return true;
    },
  };
  return { port, boosts, checkouts };
}

/** Provider stub: answers getTransaction from `txs`; `fail` simulates an outage. */
function fakePayments(txs: Record<string, ProviderTransaction>, opts: { fail?: boolean } = {}) {
  const purchases: Array<{ amount: number; currency: string }> = [];
  const payments: OneOffPaymentsPort = {
    supportsOneOffPurchases: true,
    async customerIdFor() { return CUSTOMER; },
    async initPurchase(input) {
      purchases.push({ amount: input.amount, currency: input.currency });
      return { flowType: "embedded", collectionFlow: "modal", checkoutToken: "ck_1", amount: input.amount, currency: input.currency, providerName: "helcim" };
    },
    async getTransaction(id) {
      if (opts.fail) throw new Error("Helcim 503");
      return txs[id] ?? null;
    },
  };
  return { payments, purchases };
}

/** The error code of a service result, or null on success. Narrows with
 *  `in` (the API tsc config doesn't narrow on the boolean `ok`). */
function codeOf(r: object): string | null {
  return "code" in r ? (r as { code: string }).code : null;
}

const approved = (id: string, amountCents: number, extra: Partial<ProviderTransaction> = {}): ProviderTransaction => ({
  id, approved: true, amountCents, currency: "USD", customerId: CUSTOMER, ...extra,
});

describe("startBoostCheckout", () => {
  it("unpaid: no Campaign $ → boost stays pending_payment and USD is owed", async () => {
    const { port, boosts } = fakePort(0);
    const r = await startBoostCheckout(USER, INPUT, port, NOW);
    assert.equal(r.boost.status, "pending_payment");
    assert.equal(boosts.get(r.boost.id)!.status, "pending_payment");
    assert.equal(r.usdCents, 1000);
    assert.equal(r.requiresFurtherPayment, true);
  });

  it("boundary: Campaign $ one cent short still leaves the boost inactive", async () => {
    const { port, boosts } = fakePort(999);
    const r = await startBoostCheckout(USER, INPUT, port, NOW);
    assert.equal(r.usdCents, 1);
    assert.equal(boosts.get(r.boost.id)!.status, "pending_payment");
  });

  it("paid by Campaign $: covered in full → boost active", async () => {
    const { port, boosts, checkouts } = fakePort(5000);
    const r = await startBoostCheckout(USER, INPUT, port, NOW);
    assert.equal(boosts.get(r.boost.id)!.status, "active");
    assert.equal(checkouts.get(r.checkoutId)!.status, "paid");
    assert.equal(r.boost.rateUnitCents, 143); // flat: 1000¢ / 7 days
  });
});

describe("startBoostPayment", () => {
  it("opens the widget for exactly the USD owed (server-chosen amount)", async () => {
    const { port } = fakePort(250);
    const r = await startBoostCheckout(USER, INPUT, port, NOW);
    const { payments, purchases } = fakePayments({});
    const pay = await startBoostPayment(USER, { boostId: r.boost.id }, { successUrl: "https://hired.video/a", cancelUrl: "https://hired.video/b" }, payments, port);
    assert.equal(pay.ok, true);
    assert.deepEqual(purchases, [{ amount: 7.5, currency: "USD" }]);
  });

  it("refuses when nothing is owed or payments are off", async () => {
    const { port } = fakePort(5000);
    const r = await startBoostCheckout(USER, INPUT, port, NOW);
    const res = await startBoostPayment(USER, { checkoutId: r.checkoutId }, { successUrl: "https://x.y", cancelUrl: "https://x.y" }, fakePayments({}).payments, port);
    assert.equal(codeOf(res), "NOTHING_DUE");
    const { port: p2 } = fakePort(0);
    const r2 = await startBoostCheckout(USER, INPUT, p2, NOW);
    const off = await startBoostPayment(USER, { checkoutId: r2.checkoutId }, { successUrl: "https://x.y", cancelUrl: "https://x.y" }, null, p2);
    assert.equal(codeOf(off), "PAYMENTS_UNAVAILABLE");
  });
});

describe("confirmBoostPayment — provider-verified", () => {
  it("approved payment for the exact amount activates the boost", async () => {
    const { port, boosts, checkouts } = fakePort(0);
    const r = await startBoostCheckout(USER, INPUT, port, NOW);
    const { payments } = fakePayments({ "txn-1": approved("txn-1", 1000) });
    const res = await confirmBoostPayment(USER, { checkoutId: r.checkoutId }, "txn-1", payments, port, NOW);
    assert.deepEqual(res, { ok: true, activated: true, pending: false });
    assert.equal(boosts.get(r.boost.id)!.status, "active");
    assert.equal(checkouts.get(r.checkoutId)!.providerPaymentId, "txn-1");
  });

  it("a forged transaction id (unknown to the provider) is refused", async () => {
    const { port, boosts } = fakePort(0);
    const r = await startBoostCheckout(USER, INPUT, port, NOW);
    const res = await confirmBoostPayment(USER, { boostId: r.boost.id }, "made-up", fakePayments({}).payments, port, NOW);
    assert.equal(codeOf(res), "PAYMENT_NOT_VERIFIED");
    assert.equal(boosts.get(r.boost.id)!.status, "pending_payment");
  });

  it("an amount mismatch, a declined charge or another customer's charge is refused", async () => {
    for (const tx of [
      approved("t", 999),
      approved("t", 1000, { approved: false }),
      approved("t", 1000, { currency: "CAD" }),
      approved("t", 1000, { customerId: "CST9999" }),
    ]) {
      const { port, boosts } = fakePort(0);
      const r = await startBoostCheckout(USER, INPUT, port, NOW);
      const res = await confirmBoostPayment(USER, { checkoutId: r.checkoutId }, "t", fakePayments({ t: tx }).payments, port, NOW);
      assert.equal(codeOf(res), "PAYMENT_NOT_VERIFIED", JSON.stringify(tx));
      assert.equal(boosts.get(r.boost.id)!.status, "pending_payment");
    }
  });

  it("a payment id already used (another boost or a token pack) is refused", async () => {
    const { port, boosts } = fakePort(0, ["txn-used"]);
    const r = await startBoostCheckout(USER, INPUT, port, NOW);
    const res = await confirmBoostPayment(USER, { checkoutId: r.checkoutId }, "txn-used", fakePayments({ "txn-used": approved("txn-used", 1000) }).payments, port, NOW);
    assert.equal(codeOf(res), "PAYMENT_ALREADY_USED");
    assert.equal(boosts.get(r.boost.id)!.status, "pending_payment");
  });

  it("one payment can't pay for two boosts", async () => {
    const { port, boosts } = fakePort(0);
    const a = await startBoostCheckout(USER, INPUT, port, NOW);
    const b = await startBoostCheckout(USER, INPUT, port, NOW);
    const { payments } = fakePayments({ "txn-2": approved("txn-2", 1000) });
    assert.equal((await confirmBoostPayment(USER, { checkoutId: a.checkoutId }, "txn-2", payments, port, NOW)).ok, true);
    const second = await confirmBoostPayment(USER, { checkoutId: b.checkoutId }, "txn-2", payments, port, NOW);
    assert.equal(codeOf(second), "PAYMENT_ALREADY_USED");
    assert.equal(boosts.get(b.boost.id)!.status, "pending_payment");
  });

  it("replaying the same confirm is idempotent", async () => {
    const { port } = fakePort(0);
    const r = await startBoostCheckout(USER, INPUT, port, NOW);
    const { payments } = fakePayments({ "txn-3": approved("txn-3", 1000) });
    await confirmBoostPayment(USER, { checkoutId: r.checkoutId }, "txn-3", payments, port, NOW);
    const again = await confirmBoostPayment(USER, { checkoutId: r.checkoutId }, "txn-3", payments, port, NOW);
    assert.deepEqual(again, { ok: true, activated: false, pending: false });
  });

  it("a provider error leaves the boost pending (retryable)", async () => {
    const { port, boosts, checkouts } = fakePort(0);
    const r = await startBoostCheckout(USER, INPUT, port, NOW);
    const res = await confirmBoostPayment(USER, { checkoutId: r.checkoutId }, "txn-4", fakePayments({}, { fail: true }).payments, port, NOW);
    assert.deepEqual(res, { ok: true, activated: false, pending: true });
    assert.equal(boosts.get(r.boost.id)!.status, "pending_payment");
    assert.equal(checkouts.get(r.checkoutId)!.status, "pending");
  });

  it("another user can't confirm; unknown checkout is NOT_FOUND", async () => {
    const { port, boosts } = fakePort(0);
    const r = await startBoostCheckout(USER, INPUT, port, NOW);
    const { payments } = fakePayments({ "txn-5": approved("txn-5", 1000) });
    const forbidden = await confirmBoostPayment(OTHER, { checkoutId: r.checkoutId }, "txn-5", payments, port, NOW);
    assert.equal(codeOf(forbidden), "FORBIDDEN");
    assert.equal(boosts.get(r.boost.id)!.status, "pending_payment");
    const missing = await confirmBoostPayment(USER, { checkoutId: "nope" }, "txn-5", payments, port, NOW);
    assert.equal(codeOf(missing), "NOT_FOUND");
  });
});
