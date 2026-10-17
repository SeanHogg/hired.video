/** Seeker job applications (apply + list). */
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import type { ApplyJobDTO } from "../../../../shared/job.js";
import { invalidateIsolateKey } from "../../utils/isolate-cache.js";
import { c360FunnelCacheKey } from "../career360/cache-keys.js";
import { recordApply } from "../../repositories/jobApplicationTrackerRepository.js";
import { type JobServiceDeps, resolveDeps } from "./job-service-deps.js";
import { rowToJob } from "./job-entity.js";

const { jobItems, jobApplications } = schema;

export async function applyToJob(jobId: string, userId: string, application: ApplyJobDTO,
  deps?: Partial<JobServiceDeps>): Promise<{ applicationId: string }> {
  const d = resolveDeps(deps); const db = d.db;
  const applicationId = await recordApply(db, {
    userId,
    jobId,
    resumeId: typeof application.resumeId === "string" && application.resumeId ? application.resumeId : null,
    coverLetter: typeof application.coverLetter === "string" && application.coverLetter ? application.coverLetter : null,
  });
  // Applications fold into the Career 360 funnel's applied denominator — bust
  // its cached aggregate so the inner ring reflects the new apply at once (#2129b).
  invalidateIsolateKey(c360FunnelCacheKey(userId));
  return { applicationId };
}

export async function getApplications(userId: string) {
  const db = getDb();
  const rows = await db
    .select({ app: jobApplications, job: jobItems })
    .from(jobApplications)
    .leftJoin(jobItems, eq(jobApplications.jobId, jobItems.id))
    .where(eq(jobApplications.userId, userId))
    .orderBy(desc(jobApplications.appliedAt));
  return rows.map((r) => ({
    id: r.app.id,
    jobId: r.app.jobId,
    status: r.app.status,
    appliedAt: new Date(r.app.appliedAt).toISOString(),
    job: r.job ? rowToJob(r.job) : null,
  }));
}
