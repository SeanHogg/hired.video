/**
 * Hiring-manager scorecard-visibility config (#241) — the per-job override
 * (`job_items.scorecard_hm_visibility`) and the company-wide default
 * (`company_profiles.scorecard_hm_visibility_default`). Plain PK lookups /
 * single-column updates; access checks live in the caller.
 */
import { eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { jobItems, companyProfiles } = schema;

/** The job's raw override + its company id (null when the job is missing). */
export async function findJobHmVisibility(
  db: Db,
  jobId: string,
): Promise<{ override: string | null; companyId: string | null } | null> {
  const [job] = await db
    .select({ v: jobItems.scorecardHmVisibility, companyId: jobItems.companyId })
    .from(jobItems)
    .where(eq(jobItems.id, jobId))
    .limit(1);
  return job ? { override: (job.v as string | null) ?? null, companyId: job.companyId ?? null } : null;
}

/** The company's raw default (null when unset or the company is missing). */
export async function findCompanyHmVisibilityDefault(db: Db, companyId: string): Promise<string | null> {
  const [co] = await db
    .select({ d: companyProfiles.scorecardHmVisibilityDefault })
    .from(companyProfiles)
    .where(eq(companyProfiles.id, companyId))
    .limit(1);
  return co?.d ?? null;
}

export async function setJobHmVisibility(db: Db, jobId: string, mode: string | null, now: Date): Promise<void> {
  await db
    .update(jobItems)
    .set({ scorecardHmVisibility: mode, updatedAt: now })
    .where(eq(jobItems.id, jobId));
}

export async function setCompanyHmVisibilityDefault(db: Db, companyId: string, mode: string): Promise<void> {
  await db
    .update(companyProfiles)
    .set({ scorecardHmVisibilityDefault: mode })
    .where(eq(companyProfiles.id, companyId));
}
