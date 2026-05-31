/**
 * People-Ops engagement surfaces — Pulse Checks (+ responses), Scheduled
 * Check-ins (+ responses), and the Team Health composite (PO-6, PO-8). The
 * check-in dispatch cron computes next_scheduled_at; the runner is wired in
 * scheduled.ts (#1815 build requirement).
 */

import { z } from "zod";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { success, error } from "../types/index.js";
import type { PeopleEnv } from "../middleware/peopleOps.js";
import { crudRouter } from "./helpers/peopleCrud.js";
import { PeopleSegmentRepo } from "../repositories/peopleSegmentRepo.js";
import { getDb, schema } from "../db/index.js";
import { PULSE_FREQUENCIES, PULSE_QUESTION_TYPES } from "../../../shared/people-ops.js";
import { computeTeamHealth } from "../domains/people-ops/teamHealth.js";

const {
  peoplePulseChecks, peoplePulseResponses,
  peopleScheduledCheckIns, peopleCheckInResponses,
} = schema;

const QuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1).max(500),
  type: z.enum(PULSE_QUESTION_TYPES),
  options: z.array(z.string().max(120)).max(20).optional(),
  required: z.boolean().optional(),
});

// ── Pulse checks (+ responses) ───────────────────────────────────────────────
const PulseSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  frequency: z.enum(PULSE_FREQUENCIES).optional(),
  questions: z.array(QuestionSchema).max(30).optional(),
  isActive: z.boolean().optional(),
});
export const pulseChecksRouter = crudRouter(peoplePulseChecks, PulseSchema, PulseSchema.partial(), { stampCreatedBy: true });

const ResponseSchema = z.object({
  employeeId: z.string().uuid().nullish(),
  responses: z.record(z.string(), z.unknown()),
  sentiment: z.number().min(-1).max(1).nullish(),
});
pulseChecksRouter.get("/:id/responses", async (c) => {
  const repo = new PeopleSegmentRepo(getDb(), peoplePulseResponses);
  return c.json(success(await repo.list(c.var.peopleCtx, [eq(peoplePulseResponses.pulseCheckId, c.req.param("id"))])));
});
pulseChecksRouter.post("/:id/responses", async (c) => {
  const parent = new PeopleSegmentRepo(getDb(), peoplePulseChecks);
  if (!(await parent.findById(c.var.peopleCtx, c.req.param("id")))) return c.json(error("NOT_FOUND", "Pulse check not found"), 404);
  const p = ResponseSchema.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json(error("VALIDATION_ERROR", "Invalid body", p.error.flatten()), 400);
  const repo = new PeopleSegmentRepo(getDb(), peoplePulseResponses);
  return c.json(success(await repo.insert(c.var.peopleCtx, { ...p.data, pulseCheckId: c.req.param("id") })), 201);
});

// ── Scheduled check-ins (+ responses) ────────────────────────────────────────
const CheckInSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  frequency: z.enum(PULSE_FREQUENCIES).optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullish(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timezone: z.string().max(64).optional(),
  questions: z.array(QuestionSchema).max(30).optional(),
  isActive: z.boolean().optional(),
});
export const checkInsRouter = crudRouter(peopleScheduledCheckIns, CheckInSchema, CheckInSchema.partial(), { stampCreatedBy: true });

checkInsRouter.get("/:id/responses", async (c) => {
  const repo = new PeopleSegmentRepo(getDb(), peopleCheckInResponses);
  return c.json(success(await repo.list(c.var.peopleCtx, [eq(peopleCheckInResponses.checkInId, c.req.param("id"))])));
});
checkInsRouter.post("/:id/responses", async (c) => {
  const parent = new PeopleSegmentRepo(getDb(), peopleScheduledCheckIns);
  if (!(await parent.findById(c.var.peopleCtx, c.req.param("id")))) return c.json(error("NOT_FOUND", "Check-in not found"), 404);
  const p = ResponseSchema.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json(error("VALIDATION_ERROR", "Invalid body", p.error.flatten()), 400);
  const repo = new PeopleSegmentRepo(getDb(), peopleCheckInResponses);
  return c.json(success(await repo.insert(c.var.peopleCtx, { ...p.data, checkInId: c.req.param("id") })), 201);
});

// ── Team Health composite (PO-8) — shared computeTeamHealth (used by embed too)
export const teamHealthRouter = new Hono<PeopleEnv>();
teamHealthRouter.get("/", async (c) => c.json(success(await computeTeamHealth(c.var.peopleCtx))));
