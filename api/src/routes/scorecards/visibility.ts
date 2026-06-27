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
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";
import { requireJobOwner } from "../../services/jobs/jobOwnership.js";
import { userCanAccessCompany } from "../../services/company/scope.js";
import {
  SCORECARD_HM_VISIBILITY_MODES,
  resolveHmVisibility,
  parseHmVisibility,
} from "../../domains/scorecards/hmVisibility.js";

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

  const db = getDb();
  const [job] = await db
    .select({ v: schema.jobItems.scorecardHmVisibility, companyId: schema.jobItems.companyId })
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, jobId))
    .limit(1);
  let companyDefault: string | null = null;
  if (job?.companyId) {
    const [co] = await db
      .select({ d: schema.companyProfiles.scorecardHmVisibilityDefault })
      .from(schema.companyProfiles)
      .where(eq(schema.companyProfiles.id, job.companyId))
      .limit(1);
    companyDefault = co?.d ?? null;
  }
  const override = (job?.v as string | null) ?? null;
  return c.json(
    success({
      override,
      companyDefault: parseHmVisibility(companyDefault),
      effective: resolveHmVisibility(override, companyDefault),
    }),
    200,
  );
});

// PUT /job/:jobId { mode: <enum>|null } — set or clear the per-job override.
visibilityRoutes.put("/job/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const parsed = JobModeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid visibility mode", parsed.error.flatten()), 400);
  }
  const db = getDb();
  await db
    .update(schema.jobItems)
    .set({ scorecardHmVisibility: parsed.data.mode, updatedAt: new Date() } as any)
    .where(eq(schema.jobItems.id, jobId));
  return c.json(success({ override: parsed.data.mode }), 200);
});

// GET /company/:companyId — the company-wide default.
visibilityRoutes.get("/company/:companyId", async (c) => {
  const userId = c.var.user?.sub as string | undefined;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const companyId = c.req.param("companyId");
  if (!(await userCanAccessCompany(userId, companyId))) {
    return c.json(error("FORBIDDEN", "No access to this company"), 403);
  }
  const db = getDb();
  const [co] = await db
    .select({ d: schema.companyProfiles.scorecardHmVisibilityDefault })
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.id, companyId))
    .limit(1);
  return c.json(success({ default: parseHmVisibility(co?.d) }), 200);
});

// PUT /company/:companyId { mode } — set the company-wide default.
visibilityRoutes.put("/company/:companyId", async (c) => {
  const userId = c.var.user?.sub as string | undefined;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const companyId = c.req.param("companyId");
  if (!(await userCanAccessCompany(userId, companyId))) {
    return c.json(error("FORBIDDEN", "No access to this company"), 403);
  }
  const parsed = ModeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid visibility mode", parsed.error.flatten()), 400);
  }
  const db = getDb();
  await db
    .update(schema.companyProfiles)
    .set({ scorecardHmVisibilityDefault: parsed.data.mode } as any)
    .where(eq(schema.companyProfiles.id, companyId));
  return c.json(success({ default: parsed.data.mode }), 200);
});
