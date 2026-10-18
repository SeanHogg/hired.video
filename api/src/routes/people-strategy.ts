/**
 * People-Ops Strategy surfaces — Strategic Objectives (+ outcomes + milestones,
 * PO-5), Company Milestones, and Performance Reviews (PO-3). Mounted under
 * /api/people/* behind peopleOpsContext (segment + paid gate already applied).
 */

import { z } from "zod";
import { success, error } from "../types/index.js";
import { crudRouter } from "./helpers/peopleCrud.js";
import { insertChild, listChildren } from "../services/people-ops/segmentStore.js";
import {
  OBJECTIVE_CATEGORIES, OBJECTIVE_TIMEFRAMES, OBJECTIVE_STATUSES,
  OUTCOME_STATUSES, MILESTONE_STATUSES,
  COMPANY_MILESTONE_CATEGORIES, COMPANY_MILESTONE_STATUSES,
} from "../../../shared/people-ops.js";
import { validateJson } from "./helpers/validate.js";

// ── Strategic objectives (+ nested outcomes & milestones) ────────────────────
const ObjectiveSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).nullish(),
  category: z.enum(OBJECTIVE_CATEGORIES).optional(),
  timeframe: z.enum(OBJECTIVE_TIMEFRAMES).optional(),
  startDate: z.coerce.date().nullish(),
  endDate: z.coerce.date().nullish(),
  status: z.enum(OBJECTIVE_STATUSES).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  ownerId: z.string().uuid().nullish(),
  progress: z.number().int().min(0).max(100).optional(),
});
export const objectivesRouter = crudRouter("strategicObjectives", ObjectiveSchema, ObjectiveSchema.partial(), {
  stampCreatedBy: true,
  coerceDates: ["startDate", "endDate"],
});

const OutcomeSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).nullish(),
  targetValue: z.number().nullish(),
  currentValue: z.number().nullish(),
  unit: z.string().max(40).nullish(),
  status: z.enum(OUTCOME_STATUSES).optional(),
  dueDate: z.coerce.date().nullish(),
});
const ObjMilestoneSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).nullish(),
  dueDate: z.coerce.date().nullish(),
  status: z.enum(MILESTONE_STATUSES).optional(),
});

// Nested children: outcomes + milestones for an objective (parent validated in-segment).
objectivesRouter.get("/:id/outcomes", async (c) =>
  c.json(success(await listChildren(c.var.peopleCtx, "objectiveOutcomes", "objectiveId", c.req.param("id")))));
objectivesRouter.post("/:id/outcomes", validateJson(OutcomeSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const row = await insertChild(c.var.peopleCtx, "strategicObjectives", "objectiveOutcomes", "objectiveId", c.req.param("id"), c.req.valid("json"));
  if (!row) return c.json(error("NOT_FOUND", "Objective not found"), 404);
  return c.json(success(row), 201);
});
objectivesRouter.get("/:id/milestones", async (c) =>
  c.json(success(await listChildren(c.var.peopleCtx, "objectiveMilestones", "objectiveId", c.req.param("id")))));
objectivesRouter.post("/:id/milestones", validateJson(ObjMilestoneSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const row = await insertChild(c.var.peopleCtx, "strategicObjectives", "objectiveMilestones", "objectiveId", c.req.param("id"), c.req.valid("json"));
  if (!row) return c.json(error("NOT_FOUND", "Objective not found"), 404);
  return c.json(success(row), 201);
});

// ── Company milestones ───────────────────────────────────────────────────────
const CompanyMilestoneSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).nullish(),
  category: z.enum(COMPANY_MILESTONE_CATEGORIES).optional(),
  targetDate: z.coerce.date().nullish(),
  completedDate: z.coerce.date().nullish(),
  status: z.enum(COMPANY_MILESTONE_STATUSES).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  objectiveId: z.string().uuid().nullish(),
});
export const companyMilestonesRouter = crudRouter("companyMilestones", CompanyMilestoneSchema, CompanyMilestoneSchema.partial(), {
  stampCreatedBy: true,
  coerceDates: ["targetDate", "completedDate"],
});

// ── Performance reviews (PO-3) ───────────────────────────────────────────────
const ReviewSchema = z.object({
  employeeId: z.string().uuid(),
  reviewerId: z.string().uuid().nullish(),
  reviewType: z.enum(["quarterly", "annual", "mid_year", "probation", "three_sixty"]).optional(),
  status: z.enum(["draft", "scheduled", "in_progress", "completed", "overdue", "cancelled"]).optional(),
  scheduledDate: z.coerce.date().nullish(),
  completedDate: z.coerce.date().nullish(),
  periodLabel: z.string().max(60).nullish(),
  rating: z.number().min(0).max(5).nullish(),
  strengths: z.string().max(5000).nullish(),
  areasForImprovement: z.string().max(5000).nullish(),
  comments: z.string().max(5000).nullish(),
});
export const performanceReviewsRouter = crudRouter("performanceReviews", ReviewSchema, ReviewSchema.partial(), {
  employeeRefs: ["employeeId", "reviewerId"],
  coerceDates: ["scheduledDate", "completedDate"],
});
