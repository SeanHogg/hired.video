/**
 * /api/jobs/:jobId/pipeline — recruiter kanban CRUD for one job.
 *
 * Routes are transport-only; business logic lives in PipelineService.
 * Share-link routes for the public hiring-manager portal are in
 * pipeline-share.ts (sibling aggregate, separate router).
 */
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import {
  PIPELINE_STAGES,
  PIPELINE_ADDED_FROM,
  PIPELINE_TOUCHPOINT_TYPES,
} from "../../../shared/recruiter-pipeline.js";
import { requireJobOwner } from "../services/jobs/jobOwnership.js";
import * as pipelineService from "../services/pipeline/PipelineService.js";
import { withGamification } from "../domains/gamification/with-gamification.js";
import { cacheMiddleware } from "../utils/cache-headers.js";
import { etagMiddleware } from "../utils/etag.js";

export const jobPipelineRoutes = new Hono<AppEnv>();

// Pipeline reads are recruiter-scoped per-job kanban state. 30s is short
// enough that drag-drop updates land via the optimistic mutation path
// before the next refresh; the cache only short-circuits between page
// navigations (Pipeline → Job → back). ETag 304s the polled refresh
// when the kanban hasn't changed.
jobPipelineRoutes.use("/*", cacheMiddleware({ scope: "private", maxAge: 30 }));
jobPipelineRoutes.use("/*", etagMiddleware());

const STAGE_ENUM = z.enum(PIPELINE_STAGES);

const AddEntrySchema = z.object({
  candidateName: z.string().min(1).max(200),
  candidateEmail: z.string().email().max(320).optional().nullable(),
  candidatePhone: z.string().max(50).optional().nullable(),
  candidateLocation: z.string().max(200).optional().nullable(),
  candidateLinkedinUrl: z.string().url().optional().nullable(),
  candidateResumeUrl: z.string().url().optional().nullable(),
  candidateAvatarUrl: z.string().url().optional().nullable(),
  candidateUserId: UuidLikeSchema.optional().nullable(),
  stage: STAGE_ENUM.default("applied"),
  addedFrom: z.enum(PIPELINE_ADDED_FROM).default("manual"),
  notes: z.string().max(4000).optional().nullable(),
  tags: z.array(z.string()).optional(),
});

const UpdateStageSchema = z.object({
  stage: STAGE_ENUM,
  rejectionReason: z.string().max(1000).optional(),
});

const UpdateEntrySchema = z.object({
  notes: z.string().max(4000).optional().nullable(),
  tags: z.array(z.string()).optional(),
  ownerId: UuidLikeSchema.optional().nullable(),
});

const TouchpointSchema = z.object({
  type: z.enum(PIPELINE_TOUCHPOINT_TYPES),
  payload: z.record(z.string(), z.any()).optional(),
});

// ---------------------------------------------------------------------------
// GET / — entries grouped by stage
// ---------------------------------------------------------------------------
jobPipelineRoutes.get("/", async (c) => {
  const jobId = c.req.param("jobId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const { rows, grouped } = await pipelineService.listEntriesByStage(jobId);
  return c.json(
    success({
      stages: PIPELINE_STAGES.map((s) => ({ stage: s, entries: grouped[s], count: grouped[s].length })),
      total: rows.length,
    }),
    200,
  );
});

// ---------------------------------------------------------------------------
// POST / — add a candidate (manual sourcing)
// ---------------------------------------------------------------------------
jobPipelineRoutes.post("/", async (c) => {
  const jobId = c.req.param("jobId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const body = await c.req.json().catch(() => null);
  const parsed = AddEntrySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid pipeline entry", parsed.error.flatten()), 400);
  }

  const userId = c.var.user?.sub as string;
  const db = getDb();
  const [created] = await db
    .insert(schema.jobPipelineEntries)
    .values({
      jobId,
      ownerId: userId,
      ...parsed.data,
      tags: parsed.data.tags ?? [],
    } as typeof schema.jobPipelineEntries.$inferInsert)
    .returning();

  await pipelineService.logTouchpoint({
    entryId: created.id,
    type: "added",
    payload: { stage: created.stage, addedFrom: created.addedFrom },
    performedByUserId: userId,
  });

  return c.json(success(created), 201);
});

// ---------------------------------------------------------------------------
// PATCH /:entryId/stage — move stage (auto-logs touchpoint)
// ---------------------------------------------------------------------------
jobPipelineRoutes.patch("/:entryId/stage", async (c) => {
  const jobId = c.req.param("jobId");
  const entryId = c.req.param("entryId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateStageSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid stage update", parsed.error.flatten()), 400);
  }

  const userId = c.var.user?.sub as string;
  const { updated, found } = await pipelineService.moveStage({
    jobId,
    entryId,
    toStage: parsed.data.stage,
    rejectionReason: parsed.data.rejectionReason ?? null,
    performedByUserId: userId,
  });
  if (!found) return c.json(error("NOT_FOUND", "Pipeline entry not found"), 404);
  // #1118 — moving a candidate to the "offer" stage = the employer extending
  // an offer. Credits the actor (job owner = employer); refId = entry so a
  // re-move into offer doesn't re-pay. (The "hired" transition is awarded via
  // the scorecard hire-decision path, so it's intentionally not duplicated here.)
  if (parsed.data.stage === "offer") {
    await withGamification(c, "offer-extended", (game, role, uidEarner) =>
      game.onOfferExtended({ userId: uidEarner, role, offerId: entryId }),
    );
  }
  return c.json(success(updated), 200);
});

// ---------------------------------------------------------------------------
// PATCH /:entryId — update notes / tags / owner
// ---------------------------------------------------------------------------
jobPipelineRoutes.patch("/:entryId", async (c) => {
  const jobId = c.req.param("jobId");
  const entryId = c.req.param("entryId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateEntrySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid entry update", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [updated] = await db
    .update(schema.jobPipelineEntries)
    .set({
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags } : {}),
      ...(parsed.data.ownerId !== undefined ? { ownerId: parsed.data.ownerId } : {}),
      updatedAt: new Date(),
    } as Partial<typeof schema.jobPipelineEntries.$inferInsert>)
    .where(
      and(
        eq(schema.jobPipelineEntries.id, entryId),
        eq(schema.jobPipelineEntries.jobId, jobId),
      ),
    )
    .returning();

  if (!updated) return c.json(error("NOT_FOUND", "Pipeline entry not found"), 404);
  return c.json(success(updated), 200);
});

// ---------------------------------------------------------------------------
// DELETE /:entryId
// ---------------------------------------------------------------------------
jobPipelineRoutes.delete("/:entryId", async (c) => {
  const jobId = c.req.param("jobId");
  const entryId = c.req.param("entryId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const db = getDb();
  const [removed] = await db
    .delete(schema.jobPipelineEntries)
    .where(
      and(
        eq(schema.jobPipelineEntries.id, entryId),
        eq(schema.jobPipelineEntries.jobId, jobId),
      ),
    )
    .returning({ id: schema.jobPipelineEntries.id });

  if (!removed) return c.json(error("NOT_FOUND", "Pipeline entry not found"), 404);
  return c.json(success({ id: removed.id }), 200);
});

// ---------------------------------------------------------------------------
// GET /reports — per-stage counts + funnel + avg days-in-stage
// ---------------------------------------------------------------------------
jobPipelineRoutes.get("/reports", async (c) => {
  const jobId = c.req.param("jobId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  return c.json(success(await pipelineService.buildReport(jobId)), 200);
});

// ---------------------------------------------------------------------------
// POST /:entryId/touchpoint — log an outreach touchpoint (email / sms / etc)
// ---------------------------------------------------------------------------
jobPipelineRoutes.post("/:entryId/touchpoint", async (c) => {
  const jobId = c.req.param("jobId");
  const entryId = c.req.param("entryId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const body = await c.req.json().catch(() => null);
  const parsed = TouchpointSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid touchpoint", parsed.error.flatten()), 400);
  }
  const userId = c.var.user?.sub as string;
  await pipelineService.logTouchpoint({
    entryId,
    type: parsed.data.type,
    payload: parsed.data.payload,
    performedByUserId: userId,
  });
  return c.json(success({ logged: true }), 200);
});
