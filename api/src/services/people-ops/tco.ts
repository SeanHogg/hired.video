/**
 * People-Ops talent-cost use cases (TA-4/TA-5) — the segment's TCO assumptions
 * (one row per segment, defaults until saved), the fully-loaded cost formula
 * (loaded multiplier + recruiting 1/12 + training 0.5/12 amortized factors),
 * and the headcount-plan summary with native runway math.
 */

import { DEFAULT_TCO_ASSUMPTIONS, computeRunwayImpactDays } from "../../../../shared/people-ops.js";
import type { SegmentScope } from "../../repositories/peopleEmployeesRepository.js";
import { segmentStore } from "./segmentStore.js";

export interface TcoPct {
  payrollTaxesPct: number;
  benefitsPct: number;
  perksPct: number;
  overheadPct: number;
}

export interface TcoRunway {
  cashOnHandCents: number | null;
  monthlyBurnCents: number | null;
}

/** The segment's assumptions (defaults when unsaved) + runway inputs. */
export async function getTcoAssumptions(ctx: SegmentScope): Promise<{ pct: TcoPct; runway: TcoRunway }> {
  const row = await segmentStore("tcoSettings").findOne(ctx);
  return {
    pct: row
      ? { payrollTaxesPct: row.payrollTaxesPct, benefitsPct: row.benefitsPct, perksPct: row.perksPct, overheadPct: row.overheadPct }
      : { ...DEFAULT_TCO_ASSUMPTIONS },
    runway: {
      cashOnHandCents: (row?.cashOnHandCents as number | null | undefined) ?? null,
      monthlyBurnCents: (row?.monthlyBurnCents as number | null | undefined) ?? null,
    },
  };
}

/** Upsert the segment's single TCO settings row. */
export async function saveTcoAssumptions(ctx: SegmentScope, values: Record<string, unknown>): Promise<any> {
  const repo = segmentStore("tcoSettings");
  const existing = await repo.findOne(ctx);
  return existing ? repo.update(ctx, existing.id, values) : repo.insert(ctx, values);
}

/** Fully-loaded annual cost of a salary, preserving the source formula. */
export function loadedCost(annualSalary: number, pct: TcoPct) {
  const payrollTaxes = annualSalary * pct.payrollTaxesPct;
  const benefits = annualSalary * pct.benefitsPct;
  const perks = annualSalary * pct.perksPct;
  const overhead = annualSalary * pct.overheadPct;
  const recruiting = annualSalary * (1 / 12); // one-time, amortized over first year
  const training = annualSalary * (0.5 / 12);
  const total = annualSalary + payrollTaxes + benefits + perks + overhead + recruiting + training;
  return {
    annualSalary, payrollTaxes, benefits, perks, overhead, recruiting, training,
    totalLoadedCost: Math.round(total),
    monthlyLoadedCost: Math.round(total / 12),
  };
}

/** Headcount plan summary, or null when the plan is missing / out of segment. */
export async function headcountPlanSummary(ctx: SegmentScope, planId: string) {
  const [plan, { runway }] = await Promise.all([
    segmentStore("headcountPlans").findById(ctx, planId),
    getTcoAssumptions(ctx),
  ]);
  if (!plan) return null;
  const hires = (plan.plannedHires as Record<string, unknown>[]) ?? [];
  const totalHireCost = hires.reduce((a, h) => a + Number(h.recruitingCostCents ?? 0) + Number(h.onboardingCostCents ?? 0), 0);
  const monthlyCostCents = plan.totalCostCents ? Math.round(plan.totalCostCents / 12) : 0;
  return {
    plan,
    plannedHireCount: hires.length,
    monthlyCostCents,
    totalHireCostCents: totalHireCost,
    byDepartment: plan.departmentBreakdown,
    // Native runway math (shared/people-ops.ts) from the segment's cash +
    // burn inputs on the TCO settings; null until those are entered.
    runwayImpactDays: computeRunwayImpactDays({ ...runway, addedMonthlyCostCents: monthlyCostCents }),
  };
}
