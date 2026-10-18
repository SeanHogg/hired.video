/**
 * /api/people/* — CHRO People Operations (phase 1: Roster/Org-chart PO-1,
 * 1:1s PO-2). Every route runs behind `peopleOpsContext`, which resolves
 * the (tenant, segment) scope and enforces the paid gate before any
 * handler executes. Handlers read `c.var.peopleCtx` — they never re-derive
 * the company, so the segment filter can't be forgotten.
 */

import { Hono } from "hono";
import { z } from "zod";
import { success, error } from "../types/index.js";
import { EMPLOYMENT_TYPES } from "../../../shared/employment-types.js";
import {
  EMPLOYEE_STATUSES,
  ONE_ON_ONE_STATUSES,
  MEETING_TYPES,
  GOAL_STATUSES,
  GOAL_PRIORITIES,
} from "../../../shared/people-ops.js";
import { peopleOpsContext, type PeopleEnv } from "../middleware/peopleOps.js";
import {
  PeopleOpsService,
  defaultPeopleOpsServiceDeps,
  type RosterEmployee,
} from "../domains/people-ops/peopleOpsService.js";
import {
  objectivesRouter,
  companyMilestonesRouter,
  performanceReviewsRouter,
} from "./people-strategy.js";
import { pulseChecksRouter, checkInsRouter, teamHealthRouter } from "./people-engagement.js";
import {
  weeklySyncsRouter,
  scorecardsRouter,
  meetingIntelRouter,
  workflowsRouter,
} from "./people-cadence.js";
import { tcoRouter, rolesRouter, headcountPlansRouter, ptoRouter } from "./people-cost.js";
import { validateJson } from "./helpers/validate.js";

const buildService = () => new PeopleOpsService(defaultPeopleOpsServiceDeps());

/** Serialize an employee row for the wire: expose salary in dollars
 *  alongside the stored cents so the frontend never does cents math. */
function serializeEmployee(e: RosterEmployee) {
  return {
    ...e,
    salary: e.salaryCents == null ? null : e.salaryCents / 100,
  };
}

// ── Validation schemas ─────────────────────────────────────────────────────
const EmployeeWriteSchema = z.object({
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  email: z.string().email().max(320),
  phone: z.string().max(40).nullish(),
  position: z.string().max(200).optional(),
  department: z.string().max(120).optional(),
  location: z.string().max(200).nullish(),
  startDate: z.coerce.date().nullish(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  avatar: z.string().nullish(),
  skills: z.array(z.string().max(120)).max(100).optional(),
  notes: z.string().max(5000).nullish(),
  managerId: z.string().uuid().nullish(),
  performanceRating: z.number().min(0).max(5).nullish(),
  // Annual salary in dollars; stored as cents.
  salary: z.number().min(0).nullish(),
  equityShares: z.number().int().min(0).nullish(),
  isFounder: z.boolean().optional(),
});
const EmployeeUpdateSchema = EmployeeWriteSchema.partial();

const OneOnOneWriteSchema = z.object({
  supervisorId: z.string().uuid(),
  participantId: z.string().uuid(),
  scheduledDate: z.coerce.date(),
  duration: z.number().int().min(5).max(480).optional(),
  status: z.enum(ONE_ON_ONE_STATUSES).optional(),
  meetingType: z.enum(MEETING_TYPES).optional(),
  location: z.string().max(200).nullish(),
  meetingLink: z.string().max(1000).nullish(),
  notes: z.string().max(10000).nullish(),
});
const OneOnOneUpdateSchema = OneOnOneWriteSchema.partial();

const AgendaItemSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  status: z.enum(["pending", "discussed", "deferred"]).default("pending"),
});
const AgendaItemPatchSchema = AgendaItemSchema.partial();

const ActionItemsSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().min(1).max(300),
        description: z.string().max(2000).optional(),
        assigneeEmployeeId: z.string().uuid().optional(),
        dueDate: z.coerce.date().optional(),
      }),
    )
    .min(1)
    .max(50),
});

const KeyResultSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1).max(500),
  progress: z.number().min(0).max(100),
  targetValue: z.number().optional(),
  currentValue: z.number().optional(),
  unit: z.string().max(40).optional(),
});
const GoalWriteSchema = z.object({
  employeeId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).nullish(),
  status: z.enum(GOAL_STATUSES).optional(),
  priority: z.enum(GOAL_PRIORITIES).optional(),
  dueDate: z.coerce.date().nullish(),
  progress: z.number().int().min(0).max(100).optional(),
  category: z.string().max(120).nullish(),
  keyResults: z.array(KeyResultSchema).max(20).optional(),
  milestoneId: z.string().uuid().nullish(),
});
const GoalUpdateSchema = GoalWriteSchema.partial();

function salaryToCents(salary: number | null | undefined): number | null | undefined {
  if (salary === undefined) return undefined;
  if (salary === null) return null;
  return Math.round(salary * 100);
}

export const peopleRoutes = new Hono<PeopleEnv>();

// Resolve segment + enforce the paid gate on every route.
peopleRoutes.use("*", peopleOpsContext);

// ── Employees (PO-1) ──────────────────────────────────────────────────────
peopleRoutes.get("/employees/hierarchy", async (c) => {
  const tree = await buildService().getHierarchy(c.var.peopleCtx);
  return c.json(
    success(
      tree.map(function map(n): unknown {
        return { employee: serializeEmployee(n.employee), reports: n.reports.map(map) };
      }),
    ),
  );
});

peopleRoutes.get("/analytics/team-metrics", async (c) => {
  return c.json(success(await buildService().getTeamMetrics(c.var.peopleCtx)));
});

peopleRoutes.get("/employees", async (c) => {
  const rows = await buildService().listEmployees(c.var.peopleCtx, {
    department: c.req.query("department") || undefined,
    status: (c.req.query("status") as any) || undefined,
    employmentType: c.req.query("employmentType") || undefined,
    managerId: c.req.query("managerId") || undefined,
    q: c.req.query("q") || undefined,
  });
  return c.json(success(rows.map(serializeEmployee)));
});

peopleRoutes.post("/employees", validateJson(EmployeeWriteSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const { salary, ...rest } = body;
  const row = await buildService().createEmployee(
    c.var.peopleCtx,
    { ...rest, salaryCents: salaryToCents(salary) },
    c.var.userId,
  );
  return c.json(success(serializeEmployee(row)), 201);
});

peopleRoutes.get("/employees/:id", async (c) => {
  return c.json(success(serializeEmployee(await buildService().getEmployee(c.var.peopleCtx, c.req.param("id")))));
});

peopleRoutes.put("/employees/:id", validateJson(EmployeeUpdateSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const { salary, ...rest } = body;
  const row = await buildService().updateEmployee(
    c.var.peopleCtx,
    c.req.param("id"),
    { ...rest, salaryCents: salaryToCents(salary) },
    c.var.userId,
  );
  return c.json(success(serializeEmployee(row)));
});

peopleRoutes.delete("/employees/:id", async (c) => {
  await buildService().deleteEmployee(c.var.peopleCtx, c.req.param("id"), c.var.userId);
  return c.json(success({ deleted: true }));
});

// ── 1:1s (PO-2) ─────────────────────────────────────────────────────────────
peopleRoutes.get("/one-on-ones/templates", (c) =>
  c.json(success(buildService().getOneOnOneTemplates())),
);

peopleRoutes.get("/one-on-ones", async (c) => {
  const rows = await buildService().listOneOnOnes(c.var.peopleCtx, {
    supervisorId: c.req.query("supervisorId") || undefined,
    participantId: c.req.query("participantId") || undefined,
    status: (c.req.query("status") as any) || undefined,
    employeeId: c.req.query("employeeId") || undefined,
  });
  return c.json(success(rows));
});

peopleRoutes.post("/one-on-ones", validateJson(OneOnOneWriteSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  return c.json(
    success(await buildService().createOneOnOne(c.var.peopleCtx, body, c.var.userId)),
    201,
  );
});

peopleRoutes.get("/one-on-ones/:id", async (c) => {
  return c.json(success(await buildService().getOneOnOne(c.var.peopleCtx, c.req.param("id"))));
});

peopleRoutes.patch("/one-on-ones/:id", validateJson(OneOnOneUpdateSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  return c.json(
    success(await buildService().updateOneOnOne(c.var.peopleCtx, c.req.param("id"), body)),
  );
});

peopleRoutes.delete("/one-on-ones/:id", async (c) => {
  await buildService().deleteOneOnOne(c.var.peopleCtx, c.req.param("id"));
  return c.json(success({ deleted: true }));
});

peopleRoutes.post("/one-on-ones/:id/agenda-items", validateJson(AgendaItemSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  return c.json(
    success(await buildService().addAgendaItem(c.var.peopleCtx, c.req.param("id"), body)),
    201,
  );
});

peopleRoutes.patch("/one-on-ones/:id/agenda-items/:index", validateJson(AgendaItemPatchSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const index = Number.parseInt(c.req.param("index"), 10);
  if (!Number.isInteger(index) || index < 0) {
    return c.json(error("VALIDATION_ERROR", "Invalid agenda index"), 400);
  }
  const body = c.req.valid("json");
  return c.json(
    success(
      await buildService().updateAgendaItem(c.var.peopleCtx, c.req.param("id"), index, body),
    ),
  );
});

peopleRoutes.delete("/one-on-ones/:id/agenda-items/:index", async (c) => {
  const index = Number.parseInt(c.req.param("index"), 10);
  if (!Number.isInteger(index) || index < 0) {
    return c.json(error("VALIDATION_ERROR", "Invalid agenda index"), 400);
  }
  return c.json(
    success(await buildService().deleteAgendaItem(c.var.peopleCtx, c.req.param("id"), index)),
  );
});

peopleRoutes.post("/one-on-ones/:id/action-items", validateJson(ActionItemsSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const rows = await buildService().addOneOnOneActionItems(
    c.var.peopleCtx,
    c.req.param("id"),
    c.var.userId,
    body.items,
  );
  return c.json(success(rows), 201);
});

// ── Goals / OKRs (PO-4) ──────────────────────────────────────────────────────
peopleRoutes.get("/goals", async (c) => {
  const rows = await buildService().listGoals(c.var.peopleCtx, {
    employeeId: c.req.query("employeeId") || undefined,
    status: (c.req.query("status") as any) || undefined,
    category: c.req.query("category") || undefined,
  });
  return c.json(success(rows));
});

peopleRoutes.post("/goals", validateJson(GoalWriteSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  return c.json(success(await buildService().createGoal(c.var.peopleCtx, body)), 201);
});

peopleRoutes.get("/goals/:id", async (c) => {
  return c.json(success(await buildService().getGoal(c.var.peopleCtx, c.req.param("id"))));
});

peopleRoutes.put("/goals/:id", validateJson(GoalUpdateSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  return c.json(success(await buildService().updateGoal(c.var.peopleCtx, c.req.param("id"), body)));
});

peopleRoutes.delete("/goals/:id", async (c) => {
  await buildService().deleteGoal(c.var.peopleCtx, c.req.param("id"));
  return c.json(success({ deleted: true }));
});

// ── Action items ─────────────────────────────────────────────────────────────
peopleRoutes.get("/action-items", async (c) => {
  const rows = await buildService().listActionItems(c.var.peopleCtx, {
    status: (c.req.query("status") as any) || undefined,
    sourceType: (c.req.query("sourceType") as any) || undefined,
    oneOnOneId: c.req.query("oneOnOneId") || undefined,
    assigneeEmployeeId: c.req.query("assigneeEmployeeId") || undefined,
  });
  return c.json(success(rows));
});

// ── Cluster sub-routers (PO-3, PO-5..PO-11, TA-4..6) ─────────────────────────
// Mounted after peopleOpsContext (applied via use("*") above), so each inherits
// the resolved segment + paid gate and reads c.var.peopleCtx.
peopleRoutes.route("/strategic-objectives", objectivesRouter);
peopleRoutes.route("/milestones", companyMilestonesRouter);
peopleRoutes.route("/performance-reviews", performanceReviewsRouter);
peopleRoutes.route("/pulse-checks", pulseChecksRouter);
peopleRoutes.route("/scheduled-check-ins", checkInsRouter);
peopleRoutes.route("/team-health", teamHealthRouter);
peopleRoutes.route("/weekly-syncs", weeklySyncsRouter);
peopleRoutes.route("/scorecards", scorecardsRouter);
peopleRoutes.route("/meeting-intelligence", meetingIntelRouter);
peopleRoutes.route("/workflows", workflowsRouter);
peopleRoutes.route("/tco", tcoRouter);
peopleRoutes.route("/headcount/roles", rolesRouter);
peopleRoutes.route("/headcount/plans", headcountPlansRouter);
peopleRoutes.route("/pto", ptoRouter);

export default peopleRoutes;
