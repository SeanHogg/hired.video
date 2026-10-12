/**
 * People-Ops Strategy surfaces — Strategic Objectives (+ outcomes + milestones,
 * PO-5), Company Milestones, and Performance Reviews (PO-3). Mounted under
 * /api/people/* behind peopleOpsContext (segment + paid gate already applied).
 */

import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { success, error } from "../types/index.js";
import type { PeopleEnv } from "../middleware/peopleOps.js";
import { crudRouter } from "./helpers/peopleCrud.js";
import { PeopleSegmentRepo } from "../repositories/peopleSegmentRepo.js";
import { getDb, schema } from "../db/index.js";
import {
  OBJECTIVE_CATEGORIES, OBJECTIVE_TIMEFRAMES, OBJECTIVE_STATUSES,
  OUTCOME_STATUSES, MILESTONE_STATUSES,
  COMPANY_MILESTONE_CATEGORIES, COMPANY_MILESTONE_STATUSES,
} from "../../../shared/people-ops.js";

const {
  peopleStrategicObjectives, peopleObjectiveOutcomes, peopleObjectiveMilestones,
  peopleCompanyMilestones, peoplePerformanceReviews,
} = schema;

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
export const objectivesRouter = crudRouter(peopleStrategicObjectives, ObjectiveSchema, ObjectiveSchema.partial(), {
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

// Nested children: outcomes + milestones for an objective (validate parent in-segment).
async function assertObjectiveInSegment(c: any, objectiveId: string): Promise<boolean> {
  const repo = new PeopleSegmentRepo(getDb(), peopleStrategicObjectives);
  return Boolean(await repo.findById(c.var.peopleCtx, objectiveId));
}

objectivesRouter.get("/:id/outcomes", async (c) => {
  const repo = new PeopleSegmentRepo(getDb(), peopleObjectiveOutcomes);
  const rows = await repo.list(c.var.peopleCtx, [eq(peopleObjectiveOutcomes.objectiveId, c.req.param("id"))]);
  return c.json(success(rows));
});
objectivesRouter.post("/:id/outcomes", async (c) => {
  if (!(await assertObjectiveInSegment(c, c.req.param("id")))) return c.json(error("NOT_FOUND", "Objective not found"), 404);
  const p = OutcomeSchema.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json(error("VALIDATION_ERROR", "Invalid body", p.error.flatten()), 400);
  const repo = new PeopleSegmentRepo(getDb(), peopleObjectiveOutcomes);
  return c.json(success(await repo.insert(c.var.peopleCtx, { ...p.data, objectiveId: c.req.param("id") })), 201);
});
objectivesRouter.get("/:id/milestones", async (c) => {
  const repo = new PeopleSegmentRepo(getDb(), peopleObjectiveMilestones);
  const rows = await repo.list(c.var.peopleCtx, [eq(peopleObjectiveMilestones.objectiveId, c.req.param("id"))]);
  return c.json(success(rows));
});
objectivesRouter.post("/:id/milestones", async (c) => {
  if (!(await assertObjectiveInSegment(c, c.req.param("id")))) return c.json(error("NOT_FOUND", "Objective not found"), 404);
  const p = ObjMilestoneSchema.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json(error("VALIDATION_ERROR", "Invalid body", p.error.flatten()), 400);
  const repo = new PeopleSegmentRepo(getDb(), peopleObjectiveMilestones);
  return c.json(success(await repo.insert(c.var.peopleCtx, { ...p.data, objectiveId: c.req.param("id") })), 201);
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
export const companyMilestonesRouter = crudRouter(peopleCompanyMilestones, CompanyMilestoneSchema, CompanyMilestoneSchema.partial(), {
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
export const performanceReviewsRouter = crudRouter(peoplePerformanceReviews, ReviewSchema, ReviewSchema.partial(), {
  employeeRefs: ["employeeId", "reviewerId"],
  coerceDates: ["scheduledDate", "completedDate"],
});
