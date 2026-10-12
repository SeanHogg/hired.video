/**
 * People-Ops talent-cost surfaces — Employee TCO (settings + calculator +
 * scenario, TA-4), Headcount Planning (role definitions + plans + summary,
 * TA-5), and PTO (TA-6). The TCO calculator preserves the source formula
 * (loaded multiplier + recruiting 1/12 + training 0.5/12 amortized factors).
 */

import { z } from "zod";
import { Hono } from "hono";
import { success, error } from "../types/index.js";
import type { PeopleEnv } from "../middleware/peopleOps.js";
import { crudRouter } from "./helpers/peopleCrud.js";
import { PeopleSegmentRepo } from "../repositories/peopleSegmentRepo.js";
import { getDb, schema } from "../db/index.js";
import { PTO_TYPES, PTO_STATUSES, DEFAULT_TCO_ASSUMPTIONS, computeRunwayImpactDays } from "../../../shared/people-ops.js";

const { peopleTcoSettings, peopleRoleDefinitions, peopleHeadcountPlans, peoplePtoRequests } = schema;

// ── TCO settings + calculator (TA-4) ─────────────────────────────────────────
export const tcoRouter = new Hono<PeopleEnv>();

const AssumptionsSchema = z.object({
  payrollTaxesPct: z.number().min(0).max(2),
  benefitsPct: z.number().min(0).max(2),
  perksPct: z.number().min(0).max(2),
  overheadPct: z.number().min(0).max(2),
  // Runway inputs (minor units); null clears them.
  cashOnHandCents: z.number().int().min(0).nullish(),
  monthlyBurnCents: z.number().int().min(0).nullish(),
});

async function getAssumptions(ctx: any) {
  const repo = new PeopleSegmentRepo(getDb(), peopleTcoSettings);
  const row = await repo.findOne(ctx);
  return {
    row,
    pct: row
      ? { payrollTaxesPct: row.payrollTaxesPct, benefitsPct: row.benefitsPct, perksPct: row.perksPct, overheadPct: row.overheadPct }
      : { ...DEFAULT_TCO_ASSUMPTIONS },
    runway: {
      cashOnHandCents: (row?.cashOnHandCents as number | null | undefined) ?? null,
      monthlyBurnCents: (row?.monthlyBurnCents as number | null | undefined) ?? null,
    },
  };
}

/** Fully-loaded annual cost of a salary, preserving the source formula. */
function loadedCost(annualSalary: number, pct: { payrollTaxesPct: number; benefitsPct: number; perksPct: number; overheadPct: number }) {
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

tcoRouter.get("/assumptions", async (c) => {
  const { pct, runway } = await getAssumptions(c.var.peopleCtx);
  return c.json(success({ ...pct, ...runway }));
});
tcoRouter.put("/assumptions", async (c) => {
  const p = AssumptionsSchema.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json(error("VALIDATION_ERROR", "Invalid body", p.error.flatten()), 400);
  const repo = new PeopleSegmentRepo(getDb(), peopleTcoSettings);
  const existing = await repo.findOne(c.var.peopleCtx);
  const row = existing ? await repo.update(c.var.peopleCtx, existing.id, p.data) : await repo.insert(c.var.peopleCtx, p.data);
  return c.json(success(row));
});
tcoRouter.post("/calculate", async (c) => {
  const p = z.object({ annualSalary: z.number().min(0) }).safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json(error("VALIDATION_ERROR", "Invalid body"), 400);
  const { pct } = await getAssumptions(c.var.peopleCtx);
  return c.json(success(loadedCost(p.data.annualSalary, pct)));
});
tcoRouter.post("/scenario", async (c) => {
  const p = z.object({ salaries: z.array(z.number().min(0)).min(1).max(500) }).safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json(error("VALIDATION_ERROR", "Invalid body"), 400);
  const { pct } = await getAssumptions(c.var.peopleCtx);
  const breakdowns = p.data.salaries.map((s) => loadedCost(s, pct));
  const totalLoaded = breakdowns.reduce((a, b) => a + b.totalLoadedCost, 0);
  return c.json(success({ headcount: breakdowns.length, totalLoadedCost: totalLoaded, monthlyBurn: Math.round(totalLoaded / 12), breakdowns }));
});

// ── Headcount planning (TA-5) ────────────────────────────────────────────────
const RoleSchema = z.object({
  title: z.string().min(1).max(200),
  department: z.string().max(120).optional(),
  level: z.string().max(60).nullish(),
  baseSalaryCents: z.number().int().min(0).optional(),
  equityShares: z.number().int().min(0).nullish(),
  isActive: z.boolean().optional(),
});
export const rolesRouter = crudRouter(peopleRoleDefinitions, RoleSchema, RoleSchema.partial());

const PlanSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  startDate: z.coerce.date().nullish(),
  endDate: z.coerce.date().nullish(),
  fiscalYear: z.string().max(12).nullish(),
  totalHeadcount: z.number().int().min(0).optional(),
  totalCostCents: z.number().int().min(0).optional(),
  departmentBreakdown: z.record(z.string(), z.number()).optional(),
  plannedHires: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
});
export const headcountPlansRouter = crudRouter(peopleHeadcountPlans, PlanSchema, PlanSchema.partial(), {
  stampCreatedBy: true,
  coerceDates: ["startDate", "endDate"],
});

headcountPlansRouter.get("/:id/summary", async (c) => {
  const repo = new PeopleSegmentRepo(getDb(), peopleHeadcountPlans);
  const [plan, { runway }] = await Promise.all([
    repo.findById(c.var.peopleCtx, c.req.param("id")),
    getAssumptions(c.var.peopleCtx),
  ]);
  if (!plan) return c.json(error("NOT_FOUND", "Plan not found"), 404);
  const hires = (plan.plannedHires as Record<string, unknown>[]) ?? [];
  const totalHireCost = hires.reduce((a, h) => a + Number(h.recruitingCostCents ?? 0) + Number(h.onboardingCostCents ?? 0), 0);
  const monthlyCostCents = plan.totalCostCents ? Math.round(plan.totalCostCents / 12) : 0;
  return c.json(success({
    plan,
    plannedHireCount: hires.length,
    monthlyCostCents,
    totalHireCostCents: totalHireCost,
    byDepartment: plan.departmentBreakdown,
    // Native runway math (shared/people-ops.ts) from the segment's cash +
    // burn inputs on the TCO settings; null until those are entered.
    runwayImpactDays: computeRunwayImpactDays({ ...runway, addedMonthlyCostCents: monthlyCostCents }),
  }));
});

// ── PTO (TA-6) ───────────────────────────────────────────────────────────────
const PtoSchema = z.object({
  employeeId: z.string().uuid(),
  type: z.enum(PTO_TYPES).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  days: z.number().min(0).max(366).optional(),
  status: z.enum(PTO_STATUSES).optional(),
  notes: z.string().max(2000).nullish(),
});
export const ptoRouter = crudRouter(peoplePtoRequests, PtoSchema, PtoSchema.partial(), {
  employeeRefs: ["employeeId"],
  coerceDates: ["startDate", "endDate"],
});

ptoRouter.patch("/:id", async (c) => {
  const p = z.object({ status: z.enum(PTO_STATUSES), notes: z.string().max(2000).optional() }).safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json(error("VALIDATION_ERROR", "Invalid body", p.error.flatten()), 400);
  const repo = new PeopleSegmentRepo(getDb(), peoplePtoRequests);
  const row = await repo.update(c.var.peopleCtx, c.req.param("id"), p.data);
  return row ? c.json(success(row)) : c.json(error("NOT_FOUND", "Not found"), 404);
});
