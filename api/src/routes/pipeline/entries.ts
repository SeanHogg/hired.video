/**
 * Pipeline board + entries — `/api/pipeline` (mounted via ./index.ts).
 *
 *   GET    /?jobId=&stage=        board grouped by stage. With `jobId` → that
 *                                 job's kanban (job-owner gate); without →
 *                                 cross-job kanban over every manageable job (#405)
 *   POST   /                      add a candidate (body carries `jobId`)
 *   GET    /reports?jobId=        per-stage counts + funnel + avg days-in-stage
 *   PATCH  /:entryId              update stage and/or notes / tags / owner
 *   DELETE /:entryId              remove an entry
 *   POST   /:entryId/touchpoint   log an outreach touchpoint
 *
 * Transport-only: persistence + side effects live in PipelineService; the
 * job-owner rule lives in jobOwnership.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import {
  PIPELINE_STAGES,
  PIPELINE_ADDED_FROM,
  PIPELINE_TOUCHPOINT_TYPES,
} from "../../../../shared/recruiter-pipeline.js";
import { requireJobOwner, resolveManageableJobIds } from "../../services/jobs/jobOwnership.js";
import * as pipelineService from "../../services/pipeline/PipelineService.js";
import { withGamification } from "../../domains/gamification/with-gamification.js";
import { cacheMiddleware } from "../../utils/cache-headers.js";
import { etagMiddleware } from "../../utils/etag.js";

export const pipelineEntryRoutes = new Hono<AppEnv>();

// Board reads are viewer-scoped kanban state. 30s is short enough that
// drag-drop updates land via the optimistic mutation path before the next
// refresh; ETag 304s the polled refresh when the board hasn't changed.
for (const path of ["/", "/reports"]) {
  pipelineEntryRoutes.use(path, cacheMiddleware({ scope: "private", maxAge: 30 }));
  pipelineEntryRoutes.use(path, etagMiddleware());
}

const STAGE_ENUM = z.enum(PIPELINE_STAGES);

const ListQuerySchema = z.object({
  stage: STAGE_ENUM.optional(),
  jobId: UuidLikeSchema.optional(),
});

const AddEntrySchema = z.object({
  jobId: UuidLikeSchema,
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

const UpdateEntrySchema = z
  .object({
    stage: STAGE_ENUM.optional(),
    rejectionReason: z.string().max(1000).optional(),
    notes: z.string().max(4000).optional().nullable(),
    tags: z.array(z.string()).optional(),
    ownerId: UuidLikeSchema.optional().nullable(),
  })
  .refine(
    (b) => b.stage !== undefined || b.notes !== undefined || b.tags !== undefined || b.ownerId !== undefined,
    { message: "Nothing to update" },
  );

const TouchpointSchema = z.object({
  type: z.enum(PIPELINE_TOUCHPOINT_TYPES),
  payload: z.record(z.string(), z.any()).optional(),
});

/** Load an entry and gate on its job's owner. Returns the row or the deny response. */
async function loadOwnedEntry(
  c: Context<AppEnv>,
  entryId: string,
): Promise<{ entry: pipelineService.PipelineEntryRow } | { denied: Response }> {
  const entry = await pipelineService.getEntry(entryId);
  if (!entry) return { denied: c.json(error("NOT_FOUND", "Pipeline entry not found"), 404) };
  const { denied } = await requireJobOwner(c, entry.jobId);
  if (denied) return { denied };
  return { entry };
}

// ---------------------------------------------------------------------------
// GET /?jobId=&stage= — the board, grouped by stage
// ---------------------------------------------------------------------------
pipelineEntryRoutes.get("/", async (c) => {
  const userId = c.var.user?.sub as string | undefined;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const parsed = ListQuerySchema.safeParse({ stage: c.req.query("stage"), jobId: c.req.query("jobId") });
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid filter", parsed.error.flatten()), 400);
  }

  let scope: string[];
  if (parsed.data.jobId) {
    const { denied } = await requireJobOwner(c, parsed.data.jobId);
    if (denied) return denied;
    scope = [parsed.data.jobId];
  } else {
    scope = await resolveManageableJobIds(userId);
  }

  const { rows, grouped, jobs } = await pipelineService.listBoardByStage(scope, { stage: parsed.data.stage });
  return c.json(
    success({
      stages: PIPELINE_STAGES.map((s) => ({ stage: s, entries: grouped[s], count: grouped[s].length })),
      total: rows.length,
      jobs,
    }),
    200,
  );
});

// ---------------------------------------------------------------------------
// POST / — add a candidate (manual sourcing)
// ---------------------------------------------------------------------------
pipelineEntryRoutes.post("/", async (c) => {
  const parsed = AddEntrySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid pipeline entry", parsed.error.flatten()), 400);
  }
  const { denied } = await requireJobOwner(c, parsed.data.jobId);
  if (denied) return denied;

  const created = await pipelineService.addEntry({
    ...parsed.data,
    ownerId: c.var.user?.sub as string,
  } as Parameters<typeof pipelineService.addEntry>[0]);
  return c.json(success(created), 201);
});

// ---------------------------------------------------------------------------
// GET /reports?jobId= — per-stage counts + funnel + avg days-in-stage
// ---------------------------------------------------------------------------
pipelineEntryRoutes.get("/reports", async (c) => {
  const jobId = c.req.query("jobId");
  if (!jobId) return c.json(error("VALIDATION_ERROR", "jobId is required"), 400);
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  return c.json(success(await pipelineService.buildReport(jobId)), 200);
});

// ---------------------------------------------------------------------------
// PATCH /:entryId — stage and/or notes / tags / owner. Stage side effects
// (touchpoint, rejection metadata, offer award) fire only on a real change.
// ---------------------------------------------------------------------------
pipelineEntryRoutes.patch("/:entryId", async (c) => {
  const entryId = c.req.param("entryId");
  const parsed = UpdateEntrySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid entry update", parsed.error.flatten()), 400);
  }
  const owned = await loadOwnedEntry(c, entryId);
  if ("denied" in owned) return owned.denied;

  const { stage, rejectionReason, notes, tags, ownerId } = parsed.data;
  let result: pipelineService.PipelineEntryRow | null = owned.entry;

  if (stage !== undefined && stage !== owned.entry.stage) {
    const moved = await pipelineService.moveStage({
      jobId: owned.entry.jobId,
      entryId,
      toStage: stage,
      rejectionReason: rejectionReason ?? null,
      performedByUserId: c.var.user?.sub as string,
    });
    if (!moved.found) return c.json(error("NOT_FOUND", "Pipeline entry not found"), 404);
    result = moved.updated as pipelineService.PipelineEntryRow;
    // #1118 — moving a candidate to "offer" = the employer extending an
    // offer. Credits the actor; refId = entry so a re-move doesn't re-pay.
    // (The "hired" transition is awarded via the scorecard hire-decision path.)
    if (stage === "offer") {
      await withGamification(c, "offer-extended", (game, role, uidEarner) =>
        game.onOfferExtended({ userId: uidEarner, role, offerId: entryId }),
      );
    }
  }

  if (notes !== undefined || tags !== undefined || ownerId !== undefined) {
    result = await pipelineService.updateEntryFields(entryId, { notes, tags, ownerId });
    if (!result) return c.json(error("NOT_FOUND", "Pipeline entry not found"), 404);
  }

  return c.json(success(result), 200);
});

// ---------------------------------------------------------------------------
// DELETE /:entryId
// ---------------------------------------------------------------------------
pipelineEntryRoutes.delete("/:entryId", async (c) => {
  const owned = await loadOwnedEntry(c, c.req.param("entryId"));
  if ("denied" in owned) return owned.denied;

  const removedId = await pipelineService.deleteEntry(owned.entry.id);
  if (!removedId) return c.json(error("NOT_FOUND", "Pipeline entry not found"), 404);
  return c.json(success({ id: removedId }), 200);
});

// ---------------------------------------------------------------------------
// POST /:entryId/touchpoint — log an outreach touchpoint (email / sms / etc)
// ---------------------------------------------------------------------------
pipelineEntryRoutes.post("/:entryId/touchpoint", async (c) => {
  const parsed = TouchpointSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid touchpoint", parsed.error.flatten()), 400);
  }
  const owned = await loadOwnedEntry(c, c.req.param("entryId"));
  if ("denied" in owned) return owned.denied;

  await pipelineService.logTouchpoint({
    entryId: owned.entry.id,
    type: parsed.data.type,
    payload: parsed.data.payload,
    performedByUserId: c.var.user?.sub as string,
  });
  return c.json(success({ logged: true }), 200);
});
