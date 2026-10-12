/**
 * #1764 — computeBoostPricing is the one boost pricing function (flat
 * today; D6 open).
 *
 * Run: node --import tsx --test src/services/advertising/__tests__/pricing.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BOOST_CPC_RATE_CENTS, BOOST_CPM_RATE_CENTS, computeBoostPricing } from "../pricing.js";

const START = new Date("2026-10-10T12:00:00.000Z");

describe("computeBoostPricing", () => {
  it("flat: charges the budget and spreads it as a daily rate", () => {
    const p = computeBoostPricing({ pricingModel: "flat", budgetCents: 5000, durationDays: 7, startsAt: START });
    assert.equal(p.totalCents, 5000);
    assert.equal(p.rateUnitCents, 714);
    assert.equal(p.endsAt.toISOString(), "2026-10-17T12:00:00.000Z");
  });

  it("flat boundary: a $1 budget over 90 days never prices below 1 cent/day", () => {
    const p = computeBoostPricing({ pricingModel: "flat", budgetCents: 100, durationDays: 90, startsAt: START });
    assert.equal(p.rateUnitCents, 1);
  });

  it("cpm / cpc keep their published unit rates", () => {
    assert.equal(computeBoostPricing({ pricingModel: "cpm", budgetCents: 1000, durationDays: 1 }).rateUnitCents, BOOST_CPM_RATE_CENTS);
    assert.equal(computeBoostPricing({ pricingModel: "cpc", budgetCents: 1000, durationDays: 1 }).rateUnitCents, BOOST_CPC_RATE_CENTS);
  });

  it("rejects a non-positive budget or duration", () => {
    assert.throws(() => computeBoostPricing({ pricingModel: "flat", budgetCents: 0, durationDays: 7 }), RangeError);
    assert.throws(() => computeBoostPricing({ pricingModel: "flat", budgetCents: 500, durationDays: 0 }), RangeError);
  });
});
