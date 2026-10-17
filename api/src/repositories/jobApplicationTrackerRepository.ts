/**
 * JobApplicationTrackerRepository — the seeker's tracker lifecycle over the
 * ONE application owner, `job_applications` (W3-D2 item 2, migrations
 * 0621/0622). `saved_jobs` is the bookmark only: a saved job with no
 * application row is "tracked"; every later stage is the application's
 * `status` (APPLICATION_STATUSES, shared/statuses.ts).
 *
 * One application per (user, job) is the rule writers keep: the tracker
 * updates the newest row instead of inserting a second one.
 */
import { and, desc, eq, inArray, notExists, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import type { ApplicationStatus, TrackerStatus } from "../../../shared/statuses.js";

const { jobApplications, jobPipelineEntries } = schema;

export interface TrackerApplication {
  id: string;
  jobId: string;
  status: string;
  appliedAt: Date;
  statusChangedAt: Date | null;
}

/** Newest application per job for `userId`, keyed by jobId. One query. */
export async function findLatestApplicationsByJob(
  db: Db,
  userId: string,
  jobIds: readonly string[],
): Promise<Map<string, TrackerApplication>> {
  const out = new Map<string, TrackerApplication>();
  if (jobIds.length === 0) return out;
  const rows = await db
    .select({
      id: jobApplications.id,
      jobId: jobApplications.jobId,
      status: jobApplications.status,
      appliedAt: jobApplications.appliedAt,
      statusChangedAt: jobApplications.statusChangedAt,
    })
    .from(jobApplications)
    .where(and(eq(jobApplications.userId, userId), inArray(jobApplications.jobId, [...jobIds])))
    .orderBy(desc(jobApplications.appliedAt));
  for (const r of rows) {
    if (r.jobId && !out.has(r.jobId)) out.set(r.jobId, { ...r, jobId: r.jobId });
  }
  return out;
}

async function findLatestId(db: Db, userId: string, jobId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: jobApplications.id })
    .from(jobApplications)
    .where(and(eq(jobApplications.userId, userId), eq(jobApplications.jobId, jobId)))
    .orderBy(desc(jobApplications.appliedAt))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Move the seeker's tracker for (user, job) to `status`.
 *   - "tracked": the seeker says they have not applied — remove their
 *     self-reported application rows. Rows an employer pipeline references
 *     are real applications and are kept.
 *   - anything else: update the newest application row, or create it.
 */
export async function setTrackerStatus(
  db: Db,
  userId: string,
  jobId: string,
  status: TrackerStatus,
  now = new Date(),
): Promise<void> {
  if (status === "tracked") {
    await db.delete(jobApplications).where(
      and(
        eq(jobApplications.userId, userId),
        eq(jobApplications.jobId, jobId),
        notExists(
          db
            .select({ one: sql`1` })
            .from(jobPipelineEntries)
            .where(eq(jobPipelineEntries.jobApplicationId, jobApplications.id)),
        ),
      ),
    );
    return;
  }
  await upsertApplicationStatus(db, userId, jobId, status, now);
}

/** Set the (user, job) application's status, creating the row when absent.
 *  Returns the application id. */
export async function upsertApplicationStatus(
  db: Db,
  userId: string,
  jobId: string,
  status: ApplicationStatus,
  now = new Date(),
): Promise<string> {
  const existingId = await findLatestId(db, userId, jobId);
  if (existingId) {
    await db
      .update(jobApplications)
      .set({ status, statusChangedAt: now, updatedAt: now })
      .where(eq(jobApplications.id, existingId));
    return existingId;
  }
  const [created] = await db
    .insert(jobApplications)
    .values({ userId, jobId, status, appliedAt: now, statusChangedAt: now })
    .returning({ id: jobApplications.id });
  return created!.id;
}

/** Record a real apply (résumé / cover letter). Reuses the (user, job) row
 *  when one exists — a tracker-created "applied" row gains the materials —
 *  so one job never carries two applications. Returns the application id. */
export async function recordApply(
  db: Db,
  input: { userId: string; jobId: string; resumeId: string | null; coverLetter: string | null },
  now = new Date(),
): Promise<string> {
  const existingId = await findLatestId(db, input.userId, input.jobId);
  if (existingId) {
    await db
      .update(jobApplications)
      .set({
        ...(input.resumeId ? { resumeId: input.resumeId } : {}),
        ...(input.coverLetter ? { coverLetter: input.coverLetter } : {}),
        updatedAt: now,
      })
      .where(eq(jobApplications.id, existingId));
    return existingId;
  }
  const [created] = await db
    .insert(jobApplications)
    .values({
      userId: input.userId,
      jobId: input.jobId,
      resumeId: input.resumeId,
      coverLetter: input.coverLetter,
      status: "applied",
      appliedAt: now,
      statusChangedAt: now,
    })
    .returning({ id: jobApplications.id });
  return created!.id;
}
