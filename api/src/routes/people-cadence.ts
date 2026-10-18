/**
 * People-Ops cadence + automation surfaces — Weekly Syncs (PO-7), team-metric
 * Scorecards (+ snapshots, PO-7), Meeting Intelligence (+ AI summarize, PO-9),
 * and Workflow Automation with a real execution engine (PO-10). The workflow
 * engine actually fires its actions (create_task produces a tasks-backed action
 * item); notify/slack/email actions are recorded as results (external delivery
 * wired with the integrations in #1816).
 */

import { z } from "zod";
import { success, error } from "../types/index.js";
import { crudRouter } from "./helpers/peopleCrud.js";
import { insertChild, listChildren } from "../services/people-ops/segmentStore.js";
import { summarizeMeetingTranscript, runWorkflow } from "../services/people-ops/cadence.js";
import { SYNC_STATUSES, SCORECARD_CATEGORIES, WORKFLOW_TRIGGER_TYPES } from "../../../shared/people-ops.js";
import { validateJson } from "./helpers/validate.js";

// ── Weekly syncs ─────────────────────────────────────────────────────────────
const AgendaItem = z.object({ title: z.string().min(1).max(300), description: z.string().max(1000).optional(), order: z.number().int().min(0), status: z.string().max(20).optional() });
const SyncMetric = z.object({ name: z.string().min(1).max(120), value: z.number(), unit: z.string().max(40).optional(), trend: z.string().max(20).optional() });
const SyncSchema = z.object({
  title: z.string().min(1).max(200),
  scheduledDate: z.coerce.date(),
  duration: z.number().int().min(5).max(480).optional(),
  status: z.enum(SYNC_STATUSES).optional(),
  meetingLink: z.string().max(1000).nullish(),
  agenda: z.array(AgendaItem).max(50).optional(),
  metrics: z.array(SyncMetric).max(50).optional(),
  notes: z.string().max(10000).nullish(),
});
export const weeklySyncsRouter = crudRouter("weeklySyncs", SyncSchema, SyncSchema.partial(), {
  stampCreatedBy: true,
  coerceDates: ["scheduledDate"],
});

// ── Team-metric scorecards (+ snapshots) ─────────────────────────────────────
const ScorecardSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  category: z.enum(SCORECARD_CATEGORIES).optional(),
  metrics: z.array(z.object({ id: z.string().min(1), name: z.string().min(1).max(120), unit: z.string().max(40).optional(), targetValue: z.number().optional(), order: z.number().int().min(0) })).max(50).optional(),
  isActive: z.boolean().optional(),
});
export const scorecardsRouter = crudRouter("scorecards", ScorecardSchema, ScorecardSchema.partial(), { stampCreatedBy: true });

const SnapshotSchema = z.object({ period: z.coerce.date(), values: z.record(z.string(), z.number()), notes: z.string().max(2000).nullish() });
scorecardsRouter.get("/:id/snapshots", async (c) =>
  c.json(success(await listChildren(c.var.peopleCtx, "scorecardSnapshots", "scorecardId", c.req.param("id"), "period"))));
scorecardsRouter.post("/:id/snapshots", validateJson(SnapshotSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const row = await insertChild(c.var.peopleCtx, "scorecards", "scorecardSnapshots", "scorecardId", c.req.param("id"), {
    ...body, period: new Date(body.period), createdBy: c.var.userId,
  });
  if (!row) return c.json(error("NOT_FOUND", "Scorecard not found"), 404);
  return c.json(success(row), 201);
});

// ── Meeting intelligence (+ AI summarize) ────────────────────────────────────
const TranscriptSchema = z.object({
  title: z.string().min(1).max(300),
  meetingType: z.string().max(24).optional(),
  transcript: z.string().min(1).max(200000),
  participants: z.array(z.string().max(200)).max(100).optional(),
  duration: z.number().int().min(0).nullish(),
  recordedAt: z.coerce.date().optional(),
});
export const meetingIntelRouter = crudRouter("meetingTranscripts", TranscriptSchema, TranscriptSchema.partial(), {
  coerceDates: ["recordedAt"],
});

meetingIntelRouter.post("/:id/summarize", async (c) =>
  c.json(success(await summarizeMeetingTranscript(c.var.peopleCtx, c.req.param("id"), c.var.userId, c.env, c.var.user ?? null))));

// ── Workflow automation (+ real execution engine) ────────────────────────────
const WorkflowActionDef = z.object({ type: z.string().min(1).max(40), config: z.record(z.string(), z.unknown()).default({}), order: z.number().int().min(0) });
const WorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  triggerType: z.enum(WORKFLOW_TRIGGER_TYPES).optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
  actions: z.array(WorkflowActionDef).max(20).optional(),
  isActive: z.boolean().optional(),
});
export const workflowsRouter = crudRouter("workflowTriggers", WorkflowSchema, WorkflowSchema.partial(), { stampCreatedBy: true });

workflowsRouter.get("/:id/executions", async (c) =>
  c.json(success(await listChildren(c.var.peopleCtx, "workflowExecutions", "triggerId", c.req.param("id"), "startedAt"))));

// The engine: runs the trigger's ordered actions, records a workflow_execution.
workflowsRouter.post("/:id/run", async (c) =>
  c.json(success(await runWorkflow(c.var.peopleCtx, c.req.param("id"), c.var.userId))));
