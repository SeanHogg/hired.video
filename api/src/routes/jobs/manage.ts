/**
 * Job posting CRUD + poster lifecycle:
 *
 *   POST   /                           create (requireJobPoster, #1915)
 *   POST   /:id/archive | /:id/unarchive   soft-delete / restore (#154)
 *   GET    /:id/metrics/time-to-hire   manager-only hiring-velocity metric
 *   GET    /:id                        job detail (with viewerCanManage)
 *   PUT    /:id                        update
 *   DELETE /:id                        delete
 *   POST   /:id/clone                  duplicate (lands inactive)
 *
 * Mounted LAST: `GET|PUT|DELETE /:id` must not shadow the single-segment
 * statics registered by the other sub-routers.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import * as jobService from "../../services/job/JobService.js";
import { cloneJob, setJobArchived } from "../../services/jobs/jobLifecycle.js";
import { requireJobPoster } from "../../middleware/job-poster-gate.js";
import { isSuperAdmin } from "../../middleware/superAdmin.js";
import { CreateJobSchema, UpdateJobSchema } from "./schemas.js";
import { jobViewerOf, withDomainErrors } from "./http.js";

export const jobManageRoutes = new Hono<AppEnv>();

/** Archive hides from default listings, preserves slug + analytics history. */
jobManageRoutes.post("/:id/archive", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return withDomainErrors(c, async () => c.json(success(await setJobArchived(userId, c.req.param("id"), true)), 200));
});

jobManageRoutes.post("/:id/unarchive", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return withDomainErrors(c, async () => c.json(success(await setJobArchived(userId, c.req.param("id"), false)), 200));
});

jobManageRoutes.post("/", requireJobPoster, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateJobSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const created = await jobService.createJob(parsed.data, userId);

  // Gamification: credit the employer author for posting a job. The caller
  // IS the author here, so withGamification (JWT role + userId) is correct.
  // RefId = the new job id makes the award idempotent across retries.
  // Best-effort — never blocks or fails the create.
  const { withGamification } = await import("../../domains/gamification/with-gamification.js");
  await withGamification(c, "job-posted", (game, role, uidEarner) =>
    game.onJobPosted({ userId: uidEarner, role, jobId: created.id }),
  );

  return c.json(success(created), 201);
});

jobManageRoutes.get("/:id/metrics/time-to-hire", async (c) => {
  const id = c.req.param("id");
  // Require the same manager check the job detail uses; the metric
  // includes per-pipeline timing that competitors price as a Greenhouse-
  // tier feature, so we don't surface it to non-managers.
  const job = await jobService.getJobById(id, undefined, jobViewerOf(c));
  if (!job) return c.json(error("NOT_FOUND", "Job not found"), 404);
  if (!job.viewerCanManage) {
    return c.json(error("FORBIDDEN", "Only the job's manager can view hiring metrics"), 403);
  }
  const { computeTimeToHire } = await import("../../services/job/time-to-hire.js");
  const metric = await computeTimeToHire(id);
  return c.json(success(metric));
});

jobManageRoutes.get("/:id", async (c) => {
  // Pass viewer context so the DTO carries the backend's `viewerCanManage`
  // verdict. The frontend uses this flag (not its own role check) to gate
  // Edit Job + Candidates/Reports — without it, the frontend rule drifts
  // from `requireJobOwner` and non-owners see manage UI that 403s on use.
  const job = await jobService.getJobById(c.req.param("id"), undefined, jobViewerOf(c));
  if (!job) {
    return c.json(error("NOT_FOUND", "Job not found"), 404);
  }
  return c.json(success(job));
});

jobManageRoutes.put("/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateJobSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const updated = await jobService.updateJob(c.req.param("id"), parsed.data, userId);
  if (!updated) {
    return c.json(error("NOT_FOUND", "Job not found"), 404);
  }

  return c.json(success(updated));
});

jobManageRoutes.delete("/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const isAdmin = isSuperAdmin(c.var.user);
  const deleted = await jobService.deleteJob(c.req.param("id"), userId, isAdmin);
  if (!deleted) return c.json(error("NOT_FOUND", "Job not found or not owned by you"), 404);
  return c.json(success(null, "Job deleted"));
});

/** Mirrors the resume + studio-project clone pattern so every owner-created
 *  entity supports the universal Clone action. */
jobManageRoutes.post("/:id/clone", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return withDomainErrors(c, async () => c.json(success(await cloneJob(userId, c.req.param("id"))), 201));
});
