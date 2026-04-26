/**
 * /api/jobs/:jobId/pipeline — recruiter kanban for one job posting.
 *
 * v1 surface:
 *   GET    /                  — list entries grouped by stage + per-stage counts
 *   POST   /                  — add a candidate (manual sourcing)
 *   PATCH  /:entryId/stage    — move to a different stage (logs a touchpoint)
 *   PATCH  /:entryId          — update notes / tags
 *   DELETE /:entryId          — remove from the pipeline
 *   GET    /reports           — per-stage counts + funnel + avg days-in-stage
 *
 * Authorisation: only recruiters / employers / admins who own the job (or
 * are part of its company) can read/write. Anonymous and job-seeker traffic
 * gets 403.
 */
import { Hono } from "hono";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import {
  PIPELINE_STAGES,
  PIPELINE_ADDED_FROM,
  PIPELINE_TOUCHPOINT_TYPES,
  type PipelineStage,
} from "../db/schema/jobpipeline.js";

export const jobPipelineRoutes = new Hono<{ Variables: Variables }>();

const STAGE_ENUM = z.enum(PIPELINE_STAGES);

const AddEntrySchema = z.object({
  candidateName: z.string().min(1).max(200),
  candidateEmail: z.string().email().max(320).optional().nullable(),
  candidatePhone: z.string().max(50).optional().nullable(),
  candidateLocation: z.string().max(200).optional().nullable(),
  candidateLinkedinUrl: z.string().url().optional().nullable(),
  candidateResumeUrl: z.string().url().optional().nullable(),
  candidateAvatarUrl: z.string().url().optional().nullable(),
  candidateUserId: z.string().uuid().optional().nullable(),
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
  ownerId: z.string().uuid().optional().nullable(),
});

async function assertCanManageJobPipeline(c: any, jobId: string) {
  const userId = c.var.user?.sub as string | undefined;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [job] = await db
    .select({ ownerId: schema.jobItems.postedByUserId })
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, jobId))
    .limit(1);

  if (!job) return c.json(error("NOT_FOUND", "Job not found"), 404);

  // Owner or super-admin can manage. Job items currently store company as
  // a denormalised string (no FK), so company-team co-management is deferred
  // until that schema lands.
  const isOwner = job.ownerId === userId;
  const isSuperAdmin = c.var.user?.isSuperAdmin === true;
  if (isOwner || isSuperAdmin) return null;

  return c.json(error("FORBIDDEN", "Only the job owner can manage the pipeline"), 403);
}

async function logTouchpoint(input: {
  entryId: string;
  type: (typeof PIPELINE_TOUCHPOINT_TYPES)[number];
  payload?: Record<string, unknown>;
  performedByUserId: string | null;
}) {
  const db = getDb();
  await db.insert(schema.pipelineTouchpoints).values({
    entryId: input.entryId,
    type: input.type,
    payload: input.payload ?? {},
    performedByUserId: input.performedByUserId,
  } as typeof schema.pipelineTouchpoints.$inferInsert);
}

// ---------------------------------------------------------------------------
// GET /api/jobs/:jobId/pipeline — entries grouped by stage
// ---------------------------------------------------------------------------
jobPipelineRoutes.get("/", async (c) => {
  const jobId = c.req.param("jobId");
  const denied = await assertCanManageJobPipeline(c, jobId);
  if (denied) return denied;

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.jobPipelineEntries)
    .where(eq(schema.jobPipelineEntries.jobId, jobId))
    .orderBy(desc(schema.jobPipelineEntries.stageChangedAt));

  // Group by stage (preserves PIPELINE_STAGES declaration order on the client).
  const grouped: Record<PipelineStage, typeof rows> = Object.fromEntries(
    PIPELINE_STAGES.map((s) => [s, [] as typeof rows]),
  ) as Record<PipelineStage, typeof rows>;
  for (const row of rows) {
    const stage = (row.stage as PipelineStage) ?? "applied";
    if (grouped[stage]) grouped[stage].push(row);
  }

  return c.json(
    success({
      stages: PIPELINE_STAGES.map((s) => ({
        stage: s,
        entries: grouped[s],
        count: grouped[s].length,
      })),
      total: rows.length,
    }),
    200,
  );
});

// ---------------------------------------------------------------------------
// POST /api/jobs/:jobId/pipeline — add a candidate
// ---------------------------------------------------------------------------
jobPipelineRoutes.post("/", async (c) => {
  const jobId = c.req.param("jobId");
  const denied = await assertCanManageJobPipeline(c, jobId);
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

  await logTouchpoint({
    entryId: created.id,
    type: "added",
    payload: { stage: created.stage, addedFrom: created.addedFrom },
    performedByUserId: userId,
  });

  return c.json(success(created), 201);
});

// ---------------------------------------------------------------------------
// PATCH /api/jobs/:jobId/pipeline/:entryId/stage — move stage
// ---------------------------------------------------------------------------
jobPipelineRoutes.patch("/:entryId/stage", async (c) => {
  const jobId = c.req.param("jobId");
  const entryId = c.req.param("entryId");
  const denied = await assertCanManageJobPipeline(c, jobId);
  if (denied) return denied;

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateStageSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid stage update", parsed.error.flatten()), 400);
  }

  const userId = c.var.user?.sub as string;
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.jobPipelineEntries)
    .where(and(eq(schema.jobPipelineEntries.id, entryId), eq(schema.jobPipelineEntries.jobId, jobId)))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Pipeline entry not found"), 404);

  const now = new Date();
  const isReject = parsed.data.stage === "rejected";
  const [updated] = await db
    .update(schema.jobPipelineEntries)
    .set({
      stage: parsed.data.stage,
      stageChangedAt: now,
      updatedAt: now,
      rejectedAt: isReject ? now : existing.rejectedAt,
      rejectionReason: isReject ? parsed.data.rejectionReason ?? null : existing.rejectionReason,
    } as Partial<typeof schema.jobPipelineEntries.$inferInsert>)
    .where(eq(schema.jobPipelineEntries.id, entryId))
    .returning();

  await logTouchpoint({
    entryId,
    type: isReject ? "rejected" : "stage_change",
    payload: {
      from: existing.stage,
      to: parsed.data.stage,
      ...(isReject && parsed.data.rejectionReason ? { reason: parsed.data.rejectionReason } : {}),
    },
    performedByUserId: userId,
  });

  return c.json(success(updated), 200);
});

// ---------------------------------------------------------------------------
// PATCH /api/jobs/:jobId/pipeline/:entryId — update notes / tags / owner
// ---------------------------------------------------------------------------
jobPipelineRoutes.patch("/:entryId", async (c) => {
  const jobId = c.req.param("jobId");
  const entryId = c.req.param("entryId");
  const denied = await assertCanManageJobPipeline(c, jobId);
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
    .where(and(eq(schema.jobPipelineEntries.id, entryId), eq(schema.jobPipelineEntries.jobId, jobId)))
    .returning();

  if (!updated) return c.json(error("NOT_FOUND", "Pipeline entry not found"), 404);
  return c.json(success(updated), 200);
});

// ---------------------------------------------------------------------------
// DELETE /api/jobs/:jobId/pipeline/:entryId
// ---------------------------------------------------------------------------
jobPipelineRoutes.delete("/:entryId", async (c) => {
  const jobId = c.req.param("jobId");
  const entryId = c.req.param("entryId");
  const denied = await assertCanManageJobPipeline(c, jobId);
  if (denied) return denied;

  const db = getDb();
  const [removed] = await db
    .delete(schema.jobPipelineEntries)
    .where(and(eq(schema.jobPipelineEntries.id, entryId), eq(schema.jobPipelineEntries.jobId, jobId)))
    .returning({ id: schema.jobPipelineEntries.id });

  if (!removed) return c.json(error("NOT_FOUND", "Pipeline entry not found"), 404);
  return c.json(success({ id: removed.id }), 200);
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:jobId/pipeline/reports — per-stage counts + funnel
// ---------------------------------------------------------------------------
jobPipelineRoutes.get("/reports", async (c) => {
  const jobId = c.req.param("jobId");
  const denied = await assertCanManageJobPipeline(c, jobId);
  if (denied) return denied;

  const db = getDb();
  const stageCountsRaw = await db
    .select({ stage: schema.jobPipelineEntries.stage, n: count() })
    .from(schema.jobPipelineEntries)
    .where(eq(schema.jobPipelineEntries.jobId, jobId))
    .groupBy(schema.jobPipelineEntries.stage);

  const byStage: Record<string, number> = {};
  for (const row of stageCountsRaw) byStage[row.stage as string] = Number(row.n);

  // Average days-in-current-stage per stage (for "stuck" detection).
  const avgDaysRaw = await db
    .select({
      stage: schema.jobPipelineEntries.stage,
      avgDays: sql<number>`AVG(EXTRACT(EPOCH FROM (NOW() - ${schema.jobPipelineEntries.stageChangedAt})) / 86400)`,
    })
    .from(schema.jobPipelineEntries)
    .where(eq(schema.jobPipelineEntries.jobId, jobId))
    .groupBy(schema.jobPipelineEntries.stage);

  const avgDaysByStage: Record<string, number> = {};
  for (const row of avgDaysRaw) avgDaysByStage[row.stage as string] = Number(row.avgDays ?? 0);

  const total = Object.values(byStage).reduce((a, b) => a + b, 0);
  const rejected = byStage["rejected"] ?? 0;
  const hired = byStage["hired"] ?? 0;
  const active = total - rejected - hired;

  return c.json(
    success({
      total,
      active,
      rejected,
      hired,
      stages: PIPELINE_STAGES.map((stage) => ({
        stage,
        count: byStage[stage] ?? 0,
        avgDaysInStage: Number((avgDaysByStage[stage] ?? 0).toFixed(1)),
      })),
    }),
    200,
  );
});
