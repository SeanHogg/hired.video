/**
 * /api/scorecards/visibility/* — hiring-manager scorecard-visibility config (#241).
 *
 * Two surfaces: a per-job override (`job_items.scorecard_hm_visibility`,
 * owner-scoped) and a company-wide default
 * (`company_profiles.scorecard_hm_visibility_default`, company-access). The
 * read gating lives in ScorecardsService.listSubmissions / getSubmission;
 * these routes are config-only.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { requireJobOwner } from "../../services/jobs/jobOwnership.js";
import { userCanAccessCompany } from "../../services/company/scope.js";
import { SCORECARD_HM_VISIBILITY_MODES } from "../../domains/scorecards/hmVisibility.js";
import {
  getJobHmVisibilityConfig,
  setJobHmVisibilityOverride,
  getCompanyHmVisibilityDefault,
  setCompanyHmVisibility,
} from "../../services/scorecards/hmVisibilityConfig.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";

const ModeSchema = z.object({ mode: z.enum(SCORECARD_HM_VISIBILITY_MODES) });
// Job override accepts null → clears the override so the job inherits the
// company default.
const JobModeSchema = z.object({ mode: z.enum(SCORECARD_HM_VISIBILITY_MODES).nullable() });

export const visibilityRoutes = new Hono<AppEnv>();

// GET /job/:jobId — the job's override + the inherited default + effective mode.
visibilityRoutes.get("/job/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  return c.json(success(await getJobHmVisibilityConfig(jobId)), 200);
});

// PUT /job/:jobId { mode: <enum>|null } — set or clear the per-job override.
visibilityRoutes.put("/job/:jobId", validateJson(JobModeSchema, (e) => error("VALIDATION_ERROR", "Invalid visibility mode", e.flatten()), { emptyBody: null }), async (c) => {
  const jobId = c.req.param("jobId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const body = c.req.valid("json");
  await setJobHmVisibilityOverride(jobId, body.mode);
  return c.json(success({ override: body.mode }), 200);
});

// GET /company/:companyId — the company-wide default.
visibilityRoutes.get("/company/:companyId", async (c) => {
  const userId = requireUser(c);
  const companyId = c.req.param("companyId");
  if (!(await userCanAccessCompany(userId, companyId))) {
    return c.json(error("FORBIDDEN", "No access to this company"), 403);
  }
  return c.json(success({ default: await getCompanyHmVisibilityDefault(companyId) }), 200);
});

// PUT /company/:companyId { mode } — set the company-wide default.
visibilityRoutes.put("/company/:companyId", validateJson(ModeSchema, (e) => error("VALIDATION_ERROR", "Invalid visibility mode", e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const companyId = c.req.param("companyId");
  if (!(await userCanAccessCompany(userId, companyId))) {
    return c.json(error("FORBIDDEN", "No access to this company"), 403);
  }
  const body = c.req.valid("json");
  await setCompanyHmVisibility(companyId, body.mode);
  return c.json(success({ default: body.mode }), 200);
});
