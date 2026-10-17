/**
 * Seeker-side job tracker endpoints: bookmark, pipeline status, apply.
 *
 *   POST   /:id/save     save/bookmark a job
 *   DELETE /:id/save     remove saved job
 *   PATCH  /:id/status   update saved job pipeline status
 *   POST   /:id/apply    apply (+ auto-start screening when attached)
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import * as jobService from "../../services/job/JobService.js";
import { startApplyScreening, type ApplyScreening } from "../../services/jobs/jobScreening.js";
import { logger } from "../../lib/logger.js";
import { TRACKER_STATUSES, isStatus } from "../../../../shared/statuses.js";

export const jobTrackerRoutes = new Hono<AppEnv>();

jobTrackerRoutes.post("/:id/save", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  await jobService.saveJob(c.req.param("id"), userId);
  return c.json(success({ success: true }));
});

jobTrackerRoutes.delete("/:id/save", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  await jobService.unsaveJob(c.req.param("id"), userId);
  return c.json(success({ success: true }));
});

jobTrackerRoutes.patch("/:id/status", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => null);
  const status = body?.status;
  if (!isStatus(TRACKER_STATUSES, status)) {
    return c.json(error("VALIDATION_ERROR", `Invalid status. Must be one of: ${TRACKER_STATUSES.join(', ')}`), 400);
  }
  const updated = await jobService.updateSavedJobStatus(c.req.param("id"), userId, status, body?.notes);
  if (!updated) return c.json(error("NOT_FOUND", "Job not found in your tracker"), 404);
  return c.json(success({ status }));
});

/** POST /api/jobs/:id/apply — apply to a job.
 *
 *  When the job has a screening question set attached
 *  (jobItems.screeningQuestionSetId set + screeningRequired != 'none'),
 *  we materialise a studio_async_interviews row bound to the new
 *  application and return the magic-link token in `screening`. The frontend
 *  uses that to land the candidate on `/interview/:token` directly —
 *  no email round-trip — so the screening feels like the next step of the
 *  application, not a separate ask.
 */
jobTrackerRoutes.post("/:id/apply", async (c) => {
  const user = c.var.user;
  const userId = user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => null);
  const jobId = c.req.param("id");
  const { applicationId } = await jobService.applyToJob(jobId, userId, body ?? { resumeId: "" });

  // Award gamification points for the application. Fire-and-forget.
  const { withGamification } = await import("../../domains/gamification/with-gamification.js");
  await withGamification(c, "application-submitted", (game, role, uid) =>
    game.onApplicationSubmitted({
      userId: uid,
      role,
      applicationId,
      metadata: { jobId },
    }),
  );

  // Screening: if the job has a question set attached, spin up the interview
  // and hand back the token so the frontend can route the candidate into it
  // immediately. Failures here MUST NOT block the application — the recruiter
  // can still send the screening manually from MyInterviewAssignments.
  let screening: ApplyScreening = null;
  try {
    screening = await startApplyScreening({
      jobId,
      applicationId,
      candidateUserId: userId,
      candidateEmail: user?.email ?? "",
    });
  } catch (err) {
    logger.error("[apply] screening creation failed", err);
  }

  return c.json(success({ success: true, applicationId, screening }));
});
