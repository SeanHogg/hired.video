/**
 * Generic background job queue processor (#3) — extracted from scheduled.ts.
 *
 * Each job is still claimed (status=processing, attempts+1) individually
 * right before it runs: that per-job claim is what bounds retries of a
 * poison job that kills the Worker, and keeps not-yet-started jobs
 * `pending` (not stranded in `processing`) if the tick dies mid-batch.
 * Successful completions — the common case — are flushed as ONE
 * `inArray` UPDATE at the end of the tick (in `finally`) instead of one
 * UPDATE per job. Failures keep their own per-job write (each carries its
 * own error + retry/failed decision).
 */

import { getDb, schema } from "../../db/index.js";
import { getEmailProvider } from "../adapters/email.js";
import { scoreAllCandidatesForJob, scoreAllJobsForCandidate } from "../company/recruiter-match.js";
import { DripQueuesRepository } from "../../repositories/dripQueuesRepository.js";
import { logger } from "../../lib/logger.js";

const JOBS_PER_TICK = 50;

/** Returns how many pending jobs were attempted (0 = queue empty). */
export async function processJobQueue(): Promise<number> {
  const repo = new DripQueuesRepository(getDb());
  const now = new Date();

  const pending = await repo.listPendingJobs(JOBS_PER_TICK);
  if (pending.length === 0) return 0;

  const completed: string[] = [];
  try {
    for (const job of pending) {
      try {
        // Mark as processing (per job — see header)
        await repo.markJobProcessing(job.id, job.attempts + 1, now);
        await dispatchQueueJob(job);
        completed.push(job.id);
      } catch (err: any) {
        const failed = job.attempts + 1 >= job.maxAttempts;
        await repo
          .markJobFailedAttempt(job.id, failed, String(err?.message ?? err), now)
          .catch((e) => logger.error("[scheduled] failed to record job failure", { jobId: job.id, error: e }));
      }
    }
  } finally {
    await repo.markJobsCompleted(completed, now);
  }

  logger.info("[scheduled] Processed background jobs", { count: pending.length });
  return pending.length;
}

async function dispatchQueueJob(job: typeof schema.queueJobToProcess.$inferSelect): Promise<void> {
  const payload = job.payload as Record<string, unknown>;
  switch (job.type) {
    case "send_email": {
      const provider = getEmailProvider();
      if (!provider) throw new Error("No email provider configured");
      await provider.send({
        to: String(payload.to),
        subject: String(payload.subject),
        html: String(payload.html ?? payload.body ?? ""),
      });
      break;
    }
    case "recruiter_score_candidates": {
      const { recruiterId, jobId } = payload;
      if (!recruiterId || !jobId) throw new Error("Missing recruiterId or jobId");
      const result = await scoreAllCandidatesForJob(String(recruiterId), String(jobId));
      logger.info("[scheduled] Scored candidates for job", { jobId, scored: result.scored, skipped: result.skipped });
      break;
    }
    case "recruiter_score_jobs": {
      const { recruiterId: rId, candidateId: cId } = payload;
      if (!rId || !cId) throw new Error("Missing recruiterId or candidateId");
      const result = await scoreAllJobsForCandidate(String(rId), String(cId));
      logger.info("[scheduled] Scored jobs for candidate", { candidateId: cId, scored: result.scored, skipped: result.skipped });
      break;
    }
    default:
      // Unknown job types are logged but not failed — allows future types to drain gracefully
      logger.warn("[scheduled] Unknown job type", { jobType: job.type });
  }
}
