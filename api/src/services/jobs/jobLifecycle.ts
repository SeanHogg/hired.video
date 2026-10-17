/**
 * Job lifecycle use cases owned by the poster: archive / unarchive (#154)
 * and clone. Used by routes/jobs/manage.ts.
 */
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import type { JobRow } from "../../repositories/jobsRepository.js";
import { DomainError } from "../../domains/errors.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";
import * as jobService from "../job/JobService.js";

/** Soft-delete (archived=true) or restore a job. Poster only. Hides from
 *  default listings, preserves slug + analytics history. */
export async function setJobArchived(userId: string, jobId: string, archived: boolean): Promise<JobRow> {
  const jobs = buildRepos(getDb()).jobs;
  const row = await jobs.findJobById(jobId);
  if (!row) throw new DomainError(404, "NOT_FOUND", "Job not found");
  if (row.postedByUserId !== userId) throw new DomainError(403, "FORBIDDEN", "Not your job");
  const updated = await jobs.updateJobById(jobId, { archivedAt: archived ? new Date() : null });
  bumpSearchVersion();
  return updated;
}

/** Duplicate a job the caller posted. Title gets " (Copy)" appended; the
 *  clone lands as inactive so the owner reviews + republishes intentionally. */
export async function cloneJob(userId: string, jobId: string): Promise<Awaited<ReturnType<typeof jobService.getJobById>>> {
  const jobs = buildRepos(getDb()).jobs;
  const original = await jobs.findJobById(jobId);
  if (!original || original.postedByUserId !== userId) {
    throw new DomainError(404, "NOT_FOUND", "Job not found or not owned by you");
  }
  // Drizzle keys we never copy: id (regenerated), createdAt/updatedAt (defaultNow),
  // sponsored billing fields (paid feature scoped to the original), and the
  // body-cleanse cursor (the clone re-enters the worker as a fresh row).
  const {
    id: _omitId,
    createdAt: _omitCreated,
    updatedAt: _omitUpdated,
    sponsored: _omitSponsored,
    sponsoredUntil: _omitSponsoredUntil,
    sponsoredRankBoost: _omitSponsoredRank,
    bodyCleansedAt: _omitCleansedAt,
    bodyCleanseStatus: _omitCleanseStatus,
    ...rest
  } = original;
  const clone = await jobs.insertJob({
    ...rest,
    postedByUserId: userId,
    title: `${original.title} (Copy)`,
    isActive: false,
  });
  return jobService.getJobById(clone.id);
}
