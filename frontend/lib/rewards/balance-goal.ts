// What the /rewards balance card counts toward. Pure so the pick rule is
// unit-tested: the Pro month (the offer we promote) when it's redeemable,
// otherwise the cheapest redeemable SKU.

import type { PointsRedemption } from "@/lib/services/points-service";

export interface BalanceGoal {
  label: string;
  cost: number;
}

export function balanceGoal(
  redemptions: readonly PointsRedemption[] | undefined,
): BalanceGoal | null {
  const available = (redemptions ?? []).filter((r) => r.available !== false && r.pointsCost > 0);
  if (available.length === 0) return null;
  const pro = available.find((r) => r.kind === "premium_month");
  const pick = pro ?? [...available].sort((a, b) => a.pointsCost - b.pointsCost)[0];
  return { label: pick.label, cost: pick.pointsCost };
}

/** 0–100 progress of `balance` toward `cost`. */
export function goalPercent(balance: number, cost: number): number {
  if (!(cost > 0)) return 100;
  const pct = (Math.max(0, balance) / cost) * 100;
  return Math.min(100, pct);
}
