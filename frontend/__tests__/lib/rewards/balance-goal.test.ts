import { describe, expect, it } from "vitest";
import { balanceGoal, goalPercent } from "@/lib/rewards/balance-goal";
import type { PointsRedemption } from "@/lib/services/points-service";

const sku = (over: Partial<PointsRedemption>): PointsRedemption => ({
  id: "ai_credits_100k",
  kind: "ai_credits",
  label: "100K tokens",
  pointsCost: 500,
  ...over,
});

describe("balanceGoal", () => {
  it("prefers the Pro month when it is redeemable", () => {
    const goal = balanceGoal([
      sku({}),
      sku({ id: "premium_month_1", kind: "premium_month", label: "1 free month of Pro", pointsCost: 10000 }),
    ]);
    expect(goal).toEqual({ label: "1 free month of Pro", cost: 10000 });
  });

  it("falls back to the cheapest redeemable SKU when Pro is unavailable", () => {
    const goal = balanceGoal([
      sku({ id: "premium_month_1", kind: "premium_month", label: "1 free month of Pro", pointsCost: 10000, available: false }),
      sku({ id: "ai_credits_2m", label: "2M tokens", pointsCost: 7500 }),
      sku({}),
    ]);
    expect(goal).toEqual({ label: "100K tokens", cost: 500 });
  });

  it("returns null for an empty or fully unavailable catalog", () => {
    expect(balanceGoal(undefined)).toBeNull();
    expect(balanceGoal([])).toBeNull();
    expect(balanceGoal([sku({ kind: "gift_card", available: false })])).toBeNull();
  });
});

describe("goalPercent", () => {
  it("clamps to 0..100", () => {
    expect(goalPercent(2340, 10000)).toBeCloseTo(23.4);
    expect(goalPercent(-5, 10000)).toBe(0);
    expect(goalPercent(12000, 10000)).toBe(100);
  });

  it("treats a zero or invalid cost as complete", () => {
    expect(goalPercent(10, 0)).toBe(100);
    expect(goalPercent(10, Number.NaN)).toBe(100);
  });
});
