/** Seeker tracker: saved-job bookmarks + their pipeline stage. */
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { invalidateIsolateKey } from "../../utils/isolate-cache.js";
import { c360FunnelCacheKey } from "../career360/cache-keys.js";
import type { TrackerStatus } from "../../../../shared/statuses.js";
import {
  findLatestApplicationsByJob,
  setTrackerStatus,
} from "../../repositories/jobApplicationTrackerRepository.js";
import { type JobServiceDeps, resolveDeps } from "./job-service-deps.js";
import { type JobEntity, rowToJob } from "./job-entity.js";

const { jobItems, savedJobs } = schema;

export async function saveJob(jobId: string, userId: string,
  deps?: Partial<JobServiceDeps>): Promise<void> {
  const d = resolveDeps(deps); const db = d.db;
  await db.insert(savedJobs).values({ userId, jobId }).onConflictDoNothing();
}

export async function unsaveJob(jobId: string, userId: string,
  deps?: Partial<JobServiceDeps>): Promise<void> {
  const d = resolveDeps(deps); const db = d.db;
  await db.delete(savedJobs).where(and(eq(savedJobs.jobId, jobId), eq(savedJobs.userId, userId)));
}

export async function getSavedJobs(userId: string): Promise<(JobEntity & { pipelineStatus?: string; appliedAt?: string; statusChangedAt?: string })[]> {
  const db = getDb();
  const rows = await db
    .select({ job: jobItems, saved: savedJobs })
    .from(savedJobs)
    .innerJoin(jobItems, eq(savedJobs.jobId, jobItems.id))
    .where(eq(savedJobs.userId, userId))
    .orderBy(desc(savedJobs.createdAt));
  // The tracker stage is the application's (job_applications owns it,
  // W3-D2); a saved job with no application is "tracked".
  const apps = await findLatestApplicationsByJob(db, userId, rows.map((r) => r.job.id));
  return rows.map((r) => {
    const app = apps.get(r.job.id);
    return {
      ...rowToJob(r.job),
      pipelineStatus: app?.status ?? 'tracked',
      appliedAt: app?.appliedAt ? new Date(app.appliedAt).toISOString() : undefined,
      statusChangedAt: app?.statusChangedAt ? new Date(app.statusChangedAt).toISOString() : undefined,
    };
  });
}

export async function updateSavedJobStatus(jobId: string, userId: string, status: TrackerStatus, notes?: string,
  deps?: Partial<JobServiceDeps>): Promise<boolean> {
  const d = resolveDeps(deps); const db = d.db;
  const now = new Date();
  // The job must be in the seeker's tracker (bookmark row).
  const [saved] = await db
    .update(savedJobs)
    .set({ updatedAt: now, ...(notes !== undefined ? { notes } : {}) })
    .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)))
    .returning({ id: savedJobs.id });
  if (!saved) return false;
  await setTrackerStatus(db, userId, jobId, status, now);
  // Cross-track: a tracker stage change moves the Career 360 inner-ring
  // funnel — drop its cached aggregate so the ring refreshes immediately
  // instead of waiting out the 120s TTL (#2129b).
  invalidateIsolateKey(c360FunnelCacheKey(userId));
  return true;
}
