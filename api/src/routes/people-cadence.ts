/**
 * People-Ops cadence + automation surfaces — Weekly Syncs (PO-7), team-metric
 * Scorecards (+ snapshots, PO-7), Meeting Intelligence (+ AI summarize, PO-9),
 * and Workflow Automation with a real execution engine (PO-10). The workflow
 * engine actually fires its actions (create_task produces a tasks-backed action
 * item); notify/slack/email actions are recorded as results (external delivery
 * wired with the integrations in #1816).
 */

import { z } from "zod";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { success, error } from "../types/index.js";
import type { PeopleEnv } from "../middleware/peopleOps.js";
import { crudRouter } from "./helpers/peopleCrud.js";
import { PeopleSegmentRepo } from "../repositories/peopleSegmentRepo.js";
import { getDb, schema } from "../db/index.js";
import { SYNC_STATUSES, SCORECARD_CATEGORIES, WORKFLOW_TRIGGER_TYPES } from "../../../shared/people-ops.js";
import { PeopleActionItemsRepository } from "../repositories/peopleActionItemsRepository.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";

const {
  peopleWeeklySyncs, peopleScorecards, peopleScorecardSnapshots,
  peopleMeetingTranscripts, peopleWorkflowTriggers, peopleWorkflowExecutions,
} = schema;

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
export const weeklySyncsRouter = crudRouter(peopleWeeklySyncs, SyncSchema, SyncSchema.partial(), {
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
export const scorecardsRouter = crudRouter(peopleScorecards, ScorecardSchema, ScorecardSchema.partial(), { stampCreatedBy: true });

const SnapshotSchema = z.object({ period: z.coerce.date(), values: z.record(z.string(), z.number()), notes: z.string().max(2000).nullish() });
scorecardsRouter.get("/:id/snapshots", async (c) => {
  const repo = new PeopleSegmentRepo(getDb(), peopleScorecardSnapshots);
  return c.json(success(await repo.list(c.var.peopleCtx, [eq(peopleScorecardSnapshots.scorecardId, c.req.param("id"))], peopleScorecardSnapshots.period)));
});
scorecardsRouter.post("/:id/snapshots", async (c) => {
  const parent = new PeopleSegmentRepo(getDb(), peopleScorecards);
  if (!(await parent.findById(c.var.peopleCtx, c.req.param("id")))) return c.json(error("NOT_FOUND", "Scorecard not found"), 404);
  const p = SnapshotSchema.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json(error("VALIDATION_ERROR", "Invalid body", p.error.flatten()), 400);
  const repo = new PeopleSegmentRepo(getDb(), peopleScorecardSnapshots);
  return c.json(success(await repo.insert(c.var.peopleCtx, { ...p.data, period: new Date(p.data.period), createdBy: c.var.user.sub })), 201);
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
export const meetingIntelRouter = crudRouter(peopleMeetingTranscripts, TranscriptSchema, TranscriptSchema.partial(), {
  coerceDates: ["recordedAt"],
});

meetingIntelRouter.post("/:id/summarize", async (c) => {
  const repo = new PeopleSegmentRepo(getDb(), peopleMeetingTranscripts);
  const row = await repo.findById(c.var.peopleCtx, c.req.param("id"));
  if (!row) return c.json(error("NOT_FOUND", "Transcript not found"), 404);
  if (!hasAnyLLMProviderKey(c.env as any)) {
    return c.json(error("UNAVAILABLE", "AI is not configured"), 503);
  }
  try {
    const llm = createLLMClient(c.env as any, (c as any).var?.user ?? null);
    const { content } = await llm.callText("ops_meeting_summary", {
      useCase: "chat",
      systemPrompt:
        "You are a CHRO meeting-intelligence assistant. Given a transcript, return STRICT JSON: " +
        '{"summary": string, "keyPoints": string[], "actionItems": string[], "decisions": string[]}. No prose outside the JSON.',
      userMessage: String(row.transcript).slice(0, 24000),
    });
    let parsed: any = {};
    try { parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, "").trim()); } catch { parsed = { summary: content }; }
    const updated = await repo.update(c.var.peopleCtx, row.id, {
      summary: parsed.summary ?? null,
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : null,
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : null,
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : null,
      processedAt: new Date(),
    });
    // Mirror extracted action items into the canonical tasks-backed store.
    if (Array.isArray(parsed.actionItems) && parsed.actionItems.length) {
      const items = new PeopleActionItemsRepository(getDb());
      await items.insertMany(
        c.var.peopleCtx,
        parsed.actionItems.slice(0, 50).map((title: string) => ({ title: String(title).slice(0, 300), createdBy: c.var.user.sub, sourceType: "meeting" as const })),
      );
    }
    return c.json(success(updated));
  } catch {
    return c.json(error("AI_ERROR", "Could not summarize the transcript"), 502);
  }
});

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
export const workflowsRouter = crudRouter(peopleWorkflowTriggers, WorkflowSchema, WorkflowSchema.partial(), { stampCreatedBy: true });

workflowsRouter.get("/:id/executions", async (c) => {
  const repo = new PeopleSegmentRepo(getDb(), peopleWorkflowExecutions);
  return c.json(success(await repo.list(c.var.peopleCtx, [eq(peopleWorkflowExecutions.triggerId, c.req.param("id"))], peopleWorkflowExecutions.startedAt)));
});

// The engine: runs the trigger's ordered actions, records a workflow_execution.
workflowsRouter.post("/:id/run", async (c) => {
  const ctx = c.var.peopleCtx;
  const triggers = new PeopleSegmentRepo(getDb(), peopleWorkflowTriggers);
  const trigger = await triggers.findById(ctx, c.req.param("id"));
  if (!trigger) return c.json(error("NOT_FOUND", "Workflow not found"), 404);

  const execRepo = new PeopleSegmentRepo(getDb(), peopleWorkflowExecutions);
  const exec = await execRepo.insert(ctx, { triggerId: trigger.id, status: "running" });

  const results: { action: string; ok: boolean; detail?: string }[] = [];
  try {
    const actions = (trigger.actions as { type: string; config: Record<string, unknown>; order: number }[]).slice().sort((a, b) => a.order - b.order);
    const itemsRepo = new PeopleActionItemsRepository(getDb());
    for (const a of actions) {
      if (a.type === "create_task") {
        await itemsRepo.insert(ctx, {
          title: String(a.config.title ?? `${trigger.name} task`).slice(0, 300),
          description: a.config.description ? String(a.config.description) : null,
          createdBy: c.var.user.sub,
          sourceType: "manual",
        });
        results.push({ action: a.type, ok: true });
      } else {
        // notify / slack_message / send_email / send_notification / escalate /
        // create_meeting — recorded; external delivery lands with the
        // integrations work (#1816).
        results.push({ action: a.type, ok: true, detail: "recorded (delivery pending integrations)" });
      }
    }
    await execRepo.update(ctx, exec.id, { status: "succeeded", completedAt: new Date(), results: { actions: results } });
    await triggers.update(ctx, trigger.id, { lastTriggeredAt: new Date() });
    return c.json(success({ executionId: exec.id, status: "succeeded", results }));
  } catch (e) {
    await execRepo.update(ctx, exec.id, { status: "failed", completedAt: new Date(), errorMessage: e instanceof Error ? e.message : "error", results: { actions: results } });
    return c.json(error("WORKFLOW_FAILED", "Workflow execution failed"), 500);
  }
});
