/**
 * /api/pipeline/all — cross-job recruiter kanban (#405).
 *
 * Aggregates every pipeline entry across the jobs the viewer can manage,
 * grouped by stage, so a recruiter sees all candidates across all their
 * company's jobs in one board instead of clicking into each job's
 * `/jobs/:id?tab=candidates` individually (the Loxo / Bullhorn / Greenhouse
 * cross-job pipeline). Per-job CRUD (move / remove / add) stays on the
 * existing `/api/jobs/:jobId/pipeline` routes — each cross-job card carries
 * its own `jobId`, so mutations route there.
 *
 * Transport-only; scoping + masking live in jobOwnership + PipelineService.
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { PIPELINE_STAGES } from "../../../shared/recruiter-pipeline.js";
import { resolveManageableJobIds } from "../services/jobs/jobOwnership.js";
import * as pipelineService from "../services/pipeline/PipelineService.js";
import { cacheMiddleware } from "../utils/cache-headers.js";
import { etagMiddleware } from "../utils/etag.js";

export const crossJobPipelineRoutes = new Hono<AppEnv>();

// Same caching posture as the per-job kanban: private (viewer-scoped) +
// short maxAge so optimistic move/remove lands before the next poll, with
// an ETag 304 when the board is unchanged.
crossJobPipelineRoutes.use("/all", cacheMiddleware({ scope: "private", maxAge: 30 }));
crossJobPipelineRoutes.use("/all", etagMiddleware());

const QuerySchema = z.object({
  stage: z.enum(PIPELINE_STAGES).optional(),
  jobId: UuidLikeSchema.optional(),
});

// ---------------------------------------------------------------------------
// GET /all?stage=&jobId= — entries grouped by stage across every manageable job
// ---------------------------------------------------------------------------
crossJobPipelineRoutes.get("/all", async (c) => {
  const userId = c.var.user?.sub as string | undefined;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const parsed = QuerySchema.safeParse({
    stage: c.req.query("stage"),
    jobId: c.req.query("jobId"),
  });
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid filter", parsed.error.flatten()), 400);
  }

  const jobIds = await resolveManageableJobIds(userId);
  const { rows, grouped, jobs } = await pipelineService.listCrossJobEntriesByStage(jobIds, parsed.data);

  return c.json(
    success({
      stages: PIPELINE_STAGES.map((s) => ({ stage: s, entries: grouped[s], count: grouped[s].length })),
      total: rows.length,
      jobs,
    }),
    200,
  );
});
