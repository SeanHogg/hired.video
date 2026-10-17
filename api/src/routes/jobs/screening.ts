/**
 * Job screening attachment endpoints (use cases in services/jobs/jobScreening.ts):
 *
 *   GET  /:id/screening/preview           candidate-safe aggregate stats (public)
 *   GET  /:id/screening                   full attachment (owner)
 *   PUT  /:id/screening                   attach/detach a question set (owner)
 *   GET  /:id/screening/backfill-preview  applicants missing a screening (owner)
 *   POST /:id/screening/backfill          late-attach backfill, #1236 (owner)
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { requireJobOwner } from "../../services/jobs/jobOwnership.js";
import {
  backfillApplicantScreening,
  countApplicantsMissingScreening,
  getScreeningAttachment,
  getScreeningPreview,
  setJobScreening,
} from "../../services/jobs/jobScreening.js";
import { JobScreeningSchema } from "./schemas.js";
import { withDomainErrors } from "./http.js";

export const jobScreeningRoutes = new Hono<AppEnv>();

/** Public-ish: aggregate stats only (count, total expected minutes,
 *  prep/retake config) so the apply page can warn the candidate without
 *  leaking the actual question text in advance. */
jobScreeningRoutes.get("/:id/screening/preview", (c) =>
  withDomainErrors(c, async () => c.json(success(await getScreeningPreview(c.req.param("id"))))),
);

/** Returns `{ questionSetId, screeningRequired, set }` for the job edit
 *  page's "Screening" tab. */
jobScreeningRoutes.get("/:id/screening", async (c) => {
  const jobId = c.req.param("id");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;
  return withDomainErrors(c, async () => c.json(success(await getScreeningAttachment(jobId))));
});

/** Body: `{ questionSetId: string | null, screeningRequired: 'none' | 'optional' | 'required' }`. */
jobScreeningRoutes.put("/:id/screening", async (c) => {
  const jobId = c.req.param("id");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const body = await c.req.json().catch(() => null);
  const parsed = JobScreeningSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid screening payload", { issues: parsed.error.flatten() }), 400);
  }
  return withDomainErrors(c, async () =>
    c.json(success(await setJobScreening(jobId, {
      questionSetId: parsed.data.questionSetId ?? null,
      screeningRequired: parsed.data.screeningRequired,
    }))),
  );
});

/** Used by [JobScreeningCard] to render "Send screening to N existing
 *  applicants" when a recruiter attaches a set after the job has been live. */
jobScreeningRoutes.get("/:id/screening/backfill-preview", async (c) => {
  const jobId = c.req.param("id");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;
  return c.json(success(await countApplicantsMissingScreening(jobId)));
});

/** For every existing applicant without a screening interview, materialise
 *  one via `createScreeningInterviewFromApply` and the magic-link emailer. */
jobScreeningRoutes.post("/:id/screening/backfill", async (c) => {
  const jobId = c.req.param("id");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;
  return c.json(success(await backfillApplicantScreening(jobId)));
});
