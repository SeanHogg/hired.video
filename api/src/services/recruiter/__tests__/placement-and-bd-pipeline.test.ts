/**
 * Pure money-math + stage-transition tests for the agency-recruiter desk:
 *
 *   • placement-fee.ts — resolvePlacementFeeCents (flat vs percent, bps,
 *     legacy commission fallback, rounding, clamping) +
 *     deriveLegacyCommissionFields (the inverse display projection)
 *   • bd-pipeline.ts   — computeStageClosePatch (deal stage-transition
 *     close semantics) + the DEFAULT_BD_PIPELINE funnel invariants
 *
 * All functions under test are pure (or pure given an injected `now`), so
 * no DB. The commission engine + BD route delegate to these helpers, so
 * pinning them locks the dollars shown on every placement + the
 * won/lost stamping on every deal move.
 *
 * Run: node --import tsx --test src/services/recruiter/__tests__/placement-and-bd-pipeline.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  resolvePlacementFeeCents,
  deriveLegacyCommissionFields,
} from "../placement-fee.js";
import { computeStageClosePatch } from "../bd-pipeline.js";
import { DEFAULT_BD_PIPELINE } from "../../../db/schema/recruiterBd.js";

// ───────────────────────────────────────────────────────────────────────────
// resolvePlacementFeeCents — flat mode
// ───────────────────────────────────────────────────────────────────────────

describe("resolvePlacementFeeCents — flat", () => {
  it("returns the explicit flat cents, rounded to an int", () => {
    const r = resolvePlacementFeeCents({
      feeMode: "flat",
      feeFlatCents: 1_500_055.6,
      feePercentBps: null,
      annualSalaryDollars: 200_000,
      legacyCommissionAmountDollars: null,
      legacyCommissionPercentage: null,
    });
    assert.equal(r.mode, "flat");
    assert.equal(r.cents, 1_500_056);
  });

  it("clamps a negative flat fee to zero", () => {
    const r = resolvePlacementFeeCents({
      feeMode: "flat",
      feeFlatCents: -100,
      feePercentBps: null,
      annualSalaryDollars: 0,
      legacyCommissionAmountDollars: null,
      legacyCommissionPercentage: null,
    });
    assert.equal(r.cents, 0);
  });

  it("falls back to legacy commission_amount (USD→cents) when flat cents is NULL", () => {
    const r = resolvePlacementFeeCents({
      feeMode: "flat",
      feeFlatCents: null,
      feePercentBps: null,
      annualSalaryDollars: 0,
      legacyCommissionAmountDollars: "2500.50", // numeric serializes as string
      legacyCommissionPercentage: null,
    });
    assert.equal(r.cents, 250_050);
  });

  it("treats explicit flat 0 as a real value (not a NULL fallback trigger)", () => {
    const r = resolvePlacementFeeCents({
      feeMode: "flat",
      feeFlatCents: 0,
      feePercentBps: null,
      annualSalaryDollars: 0,
      legacyCommissionAmountDollars: 999, // must be IGNORED — explicit 0 wins
      legacyCommissionPercentage: null,
    });
    assert.equal(r.cents, 0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// resolvePlacementFeeCents — percent mode
// ───────────────────────────────────────────────────────────────────────────

describe("resolvePlacementFeeCents — percent", () => {
  it("computes feePercentBps × salary correctly (2000 bps = 20% of $150k = $30k)", () => {
    const r = resolvePlacementFeeCents({
      feeMode: "percent",
      feeFlatCents: null,
      feePercentBps: 2000,
      annualSalaryDollars: 150_000,
      legacyCommissionAmountDollars: null,
      legacyCommissionPercentage: null,
    });
    assert.equal(r.mode, "percent");
    assert.equal(r.cents, 3_000_000); // $30,000.00
  });

  it("defaults to percent mode when feeMode is unset/unknown", () => {
    const r = resolvePlacementFeeCents({
      feeMode: null,
      feeFlatCents: null,
      feePercentBps: 1000,
      annualSalaryDollars: 100_000,
      legacyCommissionAmountDollars: null,
      legacyCommissionPercentage: null,
    });
    assert.equal(r.mode, "percent");
    assert.equal(r.cents, 1_000_000); // 10% of $100k
  });

  it("falls back to legacy commission_percentage (percent points) when bps is NULL", () => {
    // 15 percent points of $200k = $30k. Legacy path divides by 100 (not 10_000).
    const r = resolvePlacementFeeCents({
      feeMode: "percent",
      feeFlatCents: null,
      feePercentBps: null,
      annualSalaryDollars: 200_000,
      legacyCommissionAmountDollars: null,
      legacyCommissionPercentage: 15,
    });
    assert.equal(r.cents, 3_000_000);
  });

  it("rounds the percent result to the nearest cent", () => {
    // 333 bps of $99,999 = 0.0333 × 9,999,900 cents = 332,996.67 → 332,997
    const r = resolvePlacementFeeCents({
      feeMode: "percent",
      feeFlatCents: null,
      feePercentBps: 333,
      annualSalaryDollars: 99_999,
      legacyCommissionAmountDollars: null,
      legacyCommissionPercentage: null,
    });
    assert.equal(r.cents, 332_997);
  });

  it("yields 0 cents on a 0 salary even with a positive bps", () => {
    const r = resolvePlacementFeeCents({
      feeMode: "percent",
      feeFlatCents: null,
      feePercentBps: 2500,
      annualSalaryDollars: 0,
      legacyCommissionAmountDollars: null,
      legacyCommissionPercentage: null,
    });
    assert.equal(r.cents, 0);
  });

  it("clamps a negative bps to zero", () => {
    const r = resolvePlacementFeeCents({
      feeMode: "percent",
      feeFlatCents: null,
      feePercentBps: -500,
      annualSalaryDollars: 100_000,
      legacyCommissionAmountDollars: null,
      legacyCommissionPercentage: null,
    });
    assert.equal(r.cents, 0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// deriveLegacyCommissionFields — inverse display projection
// ───────────────────────────────────────────────────────────────────────────

describe("deriveLegacyCommissionFields", () => {
  it("derives the percentage + dollar amount for a percent fee", () => {
    // $30k fee on $150k salary = 20.0000%
    const legacy = deriveLegacyCommissionFields(
      { mode: "percent", cents: 3_000_000 },
      150_000,
    );
    assert.equal(legacy.commissionPercentage, "20.0000");
    assert.equal(legacy.commissionAmount, "30000.00");
  });

  it("reports 0% for a flat fee (no implied rate)", () => {
    const legacy = deriveLegacyCommissionFields(
      { mode: "flat", cents: 1_250_000 },
      200_000,
    );
    assert.equal(legacy.commissionPercentage, "0");
    assert.equal(legacy.commissionAmount, "12500.00");
  });

  it("guards divide-by-zero: 0 salary → 0% with the raw amount", () => {
    const legacy = deriveLegacyCommissionFields(
      { mode: "percent", cents: 500_000 },
      0,
    );
    assert.equal(legacy.commissionPercentage, "0");
    assert.equal(legacy.commissionAmount, "5000.00");
  });

  it("round-trips: resolve → derive reproduces the input rate", () => {
    const resolved = resolvePlacementFeeCents({
      feeMode: "percent",
      feeFlatCents: null,
      feePercentBps: 1875, // 18.75%
      annualSalaryDollars: 120_000,
      legacyCommissionAmountDollars: null,
      legacyCommissionPercentage: null,
    });
    const legacy = deriveLegacyCommissionFields(resolved, 120_000);
    assert.equal(Number(legacy.commissionPercentage).toFixed(2), "18.75");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// computeStageClosePatch — deal stage-transition close semantics
// ───────────────────────────────────────────────────────────────────────────

describe("computeStageClosePatch", () => {
  const NOW = new Date("2026-06-07T00:00:00.000Z");

  it("an open-stage move restamps stage/activity but does NOT close the deal", () => {
    const patch = computeStageClosePatch("proposal", "default", { isClosedWon: false, isClosedLost: false }, NOW);
    assert.equal(patch.stageKey, "proposal");
    assert.equal(patch.pipelineKey, "default");
    assert.equal(patch.lastActivityAt, NOW);
    assert.equal(patch.updatedAt, NOW);
    assert.equal("closedAt" in patch, false);
    assert.equal("isWon" in patch, false);
  });

  it("a closed-won move stamps closedAt + isWon=true", () => {
    const patch = computeStageClosePatch("active", "default", { isClosedWon: true, isClosedLost: false }, NOW);
    assert.equal(patch.closedAt, NOW);
    assert.equal(patch.isWon, true);
  });

  it("a closed-lost move stamps closedAt + isWon=false", () => {
    const patch = computeStageClosePatch("churned", "default", { isClosedWon: false, isClosedLost: true }, NOW);
    assert.equal(patch.closedAt, NOW);
    assert.equal(patch.isWon, false);
  });

  it("a null stage (stage row missing) is treated as a non-terminal move", () => {
    const patch = computeStageClosePatch("mystery", "custom", null, NOW);
    assert.equal(patch.stageKey, "mystery");
    assert.equal(patch.pipelineKey, "custom");
    assert.equal("closedAt" in patch, false);
    assert.equal("isWon" in patch, false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DEFAULT_BD_PIPELINE — funnel invariants the dashboard relies on
// ───────────────────────────────────────────────────────────────────────────

describe("DEFAULT_BD_PIPELINE invariants", () => {
  it("win probabilities are non-decreasing down the funnel until terminal", () => {
    // Exclude the closed-lost tail (churned = 0%, intentionally below).
    const openish = DEFAULT_BD_PIPELINE.filter((s) => !s.isClosedLost);
    for (let i = 1; i < openish.length; i++) {
      assert.ok(
        openish[i].winProbabilityBps >= openish[i - 1].winProbabilityBps,
        `${openish[i].stageKey} (${openish[i].winProbabilityBps}) < ${openish[i - 1].stageKey}`,
      );
    }
  });

  it("every win probability is a valid 0–10000 bps value", () => {
    for (const s of DEFAULT_BD_PIPELINE) {
      assert.ok(s.winProbabilityBps >= 0 && s.winProbabilityBps <= 10_000, s.stageKey);
    }
  });

  it("has exactly one closed-won stage at 100% and one closed-lost stage at 0%", () => {
    const won = DEFAULT_BD_PIPELINE.filter((s) => s.isClosedWon);
    const lost = DEFAULT_BD_PIPELINE.filter((s) => s.isClosedLost);
    assert.equal(won.length, 1);
    assert.equal(lost.length, 1);
    assert.equal(won[0].winProbabilityBps, 10_000);
    assert.equal(lost[0].winProbabilityBps, 0);
  });

  it("stage keys are unique", () => {
    const keys = DEFAULT_BD_PIPELINE.map((s) => s.stageKey);
    assert.equal(new Set(keys).size, keys.length);
  });
});
