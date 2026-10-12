/**
 * Runway impact of a headcount plan — shared/people-ops.ts
 * computeRunwayImpactDays (used by GET /api/people/headcount-plans/:id/summary).
 *
 * Run: node --import tsx --test src/services/people-ops/__tests__/runway.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DAYS_PER_MONTH, computeRunwayImpactDays } from "../../../../../shared/people-ops.js";

describe("computeRunwayImpactDays", () => {
  it("halves runway when the plan doubles burn", () => {
    // $1.2M cash, $100k/mo burn → 12 months; +$100k/mo → 6 months.
    const days = computeRunwayImpactDays({ cashOnHandCents: 120_000_000, monthlyBurnCents: 10_000_000, addedMonthlyCostCents: 10_000_000 });
    assert.equal(days, Math.round(-6 * DAYS_PER_MONTH));
  });

  it("is zero when the plan adds no cost", () => {
    assert.equal(computeRunwayImpactDays({ cashOnHandCents: 1_000, monthlyBurnCents: 100, addedMonthlyCostCents: 0 }), 0);
  });

  it("is null when inputs are missing, burn is zero, or cash is negative", () => {
    assert.equal(computeRunwayImpactDays({ cashOnHandCents: null, monthlyBurnCents: 100, addedMonthlyCostCents: 50 }), null);
    assert.equal(computeRunwayImpactDays({ cashOnHandCents: 1_000, monthlyBurnCents: undefined, addedMonthlyCostCents: 50 }), null);
    assert.equal(computeRunwayImpactDays({ cashOnHandCents: 1_000, monthlyBurnCents: 0, addedMonthlyCostCents: 50 }), null);
    assert.equal(computeRunwayImpactDays({ cashOnHandCents: -1, monthlyBurnCents: 100, addedMonthlyCostCents: 50 }), null);
  });

  it("ignores a negative added cost rather than extending runway", () => {
    assert.equal(computeRunwayImpactDays({ cashOnHandCents: 1_000, monthlyBurnCents: 100, addedMonthlyCostCents: -50 }), 0);
  });
});
