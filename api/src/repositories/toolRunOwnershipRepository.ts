/**
 * Tool-run entity ownership lookups (routes/tool-runs.ts).
 *
 * job_items has no `userId` column — owners are tracked via three paths:
 *   1. The recruiter/employer who posted it (`posted_by_user_id`)
 *   2. A job seeker who saved/tracked it (`saved_jobs`)
 *   3. A job seeker who applied to it (`job_applications`)
 * A tool-run targeting a job is allowed when the caller appears in any of
 * these — covers both sides of the marketplace from one entry point.
 *
 * A studio session (studio_projects) qualifies when the caller may act for
 * its owner — self, company member or delegated grant (canActFor).
 *
 * Regression guard: the prior `eq(jobItems.userId, …)` bug compiled to
 * `… AND  = $1` (missing column) — see routes/__tests__/tool-runs-ownership.
 */
import { and, eq, exists, or } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import { canActFor } from "../services/studio/workspace.js";

/** ONE query: the job row qualifies when posted by the user OR an EXISTS over
 *  saved_jobs / job_applications matches (was up to 3 sequential round-trips).
 *  Both child tables FK to job_items, so anchoring on the job row loses nothing. */
export async function ownsByJob(db: Db, userId: string, jobId: string): Promise<boolean> {
  const { jobItems, savedJobs, jobApplications } = schema;
  const rows = await db
    .select({ id: jobItems.id })
    .from(jobItems)
    .where(and(
      eq(jobItems.id, jobId),
      or(
        eq(jobItems.postedByUserId, userId),
        exists(
          db.select({ id: savedJobs.id })
            .from(savedJobs)
            .where(and(eq(savedJobs.jobId, jobItems.id), eq(savedJobs.userId, userId))),
        ),
        exists(
          db.select({ id: jobApplications.id })
            .from(jobApplications)
            .where(and(eq(jobApplications.jobId, jobItems.id), eq(jobApplications.userId, userId))),
        ),
      ),
    ))
    .limit(1);
  return rows.length > 0;
}

/** The caller may record and read runs on this studio session (/studio/<id>). */
export async function ownsByStudioProject(db: Db, userId: string, projectId: string): Promise<boolean> {
  const { studioProjects } = schema;
  const [project] = await db
    .select({ userId: studioProjects.userId, companyId: studioProjects.companyId })
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  return project ? canActFor(userId, project.userId, project.companyId, { db }) : false;
}
