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
import { segmentStore } from "../services/people-ops/segmentStore.js";
import { getTcoAssumptions, saveTcoAssumptions, loadedCost, headcountPlanSummary } from "../services/people-ops/tco.js";
import { PTO_TYPES, PTO_STATUSES } from "../../../shared/people-ops.js";
import { validateJson } from "./helpers/validate.js";

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

tcoRouter.get("/assumptions", async (c) => {
  const { pct, runway } = await getTcoAssumptions(c.var.peopleCtx);
  return c.json(success({ ...pct, ...runway }));
});
tcoRouter.put("/assumptions", validateJson(AssumptionsSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  return c.json(success(await saveTcoAssumptions(c.var.peopleCtx, c.req.valid("json"))));
});
tcoRouter.post("/calculate", validateJson(z.object({ annualSalary: z.number().min(0) }), () => error("VALIDATION_ERROR", "Invalid body"), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const { pct } = await getTcoAssumptions(c.var.peopleCtx);
  return c.json(success(loadedCost(body.annualSalary, pct)));
});
tcoRouter.post("/scenario", validateJson(z.object({ salaries: z.array(z.number().min(0)).min(1).max(500) }), () => error("VALIDATION_ERROR", "Invalid body"), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const { pct } = await getTcoAssumptions(c.var.peopleCtx);
  const breakdowns = body.salaries.map((s) => loadedCost(s, pct));
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
export const rolesRouter = crudRouter("roleDefinitions", RoleSchema, RoleSchema.partial());

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
export const headcountPlansRouter = crudRouter("headcountPlans", PlanSchema, PlanSchema.partial(), {
  stampCreatedBy: true,
  coerceDates: ["startDate", "endDate"],
});

headcountPlansRouter.get("/:id/summary", async (c) => {
  const summary = await headcountPlanSummary(c.var.peopleCtx, c.req.param("id"));
  if (!summary) return c.json(error("NOT_FOUND", "Plan not found"), 404);
  return c.json(success(summary));
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
export const ptoRouter = crudRouter("ptoRequests", PtoSchema, PtoSchema.partial(), {
  employeeRefs: ["employeeId"],
  coerceDates: ["startDate", "endDate"],
});

ptoRouter.patch("/:id", validateJson(z.object({ status: z.enum(PTO_STATUSES), notes: z.string().max(2000).optional() }), (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const row = await segmentStore("ptoRequests").update(c.var.peopleCtx, c.req.param("id"), body);
  return row ? c.json(success(row)) : c.json(error("NOT_FOUND", "Not found"), 404);
});
