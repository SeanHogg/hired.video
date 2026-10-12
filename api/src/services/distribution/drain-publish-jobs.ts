/**
 * The scheduled-post drainer (#2047) — run by the 5-minute cron
 * (scheduled.ts → processSocialPublishJobs) on every tick.
 *
 * Per run, bounded for Workers Free (10 ms CPU, 50 subrequests per
 * invocation, shared with every other sweep — subrequest-budget.ts):
 *   1. claim ONE due job at a time, atomically (FOR UPDATE SKIP LOCKED —
 *      overlapping runs never take the same job); a job whose run died
 *      while `running` is reclaimed after 15 minutes;
 *   2. each claim only considers destinations whose estimated cost still
 *      fits the run's subrequest budget, and the run stops once nothing
 *      fits or PUBLISH_JOBS_PER_RUN were taken — the rest wait a tick;
 *   3. send it, then record the outcome:
 *        sent                  → done, linked to what it produced
 *        retryable failure     → scheduled again after a backoff
 *                                (5 min, 10 min, …), until MAX attempts
 *        permanent failure /
 *        attempts exhausted    → failed, with the error kept
 *
 * Idempotency: a job on its second or later attempt first asks whether an
 * earlier attempt already produced its post (a publication / promotion
 * submission / feed post made since the job first started). If so it is
 * marked done and NOT sent again — a crash between "the network accepted
 * the post" and "the job was marked done" never double-posts.
 *
 * Every collaborator is injected (DrainDeps) so the rules above are
 * unit-tested without a DB or a network.
 */
import type { JobKindFilter, JobResultRef, PublishJob } from "../../repositories/socialPublishJobRepository.js";
import {
  DISTRIBUTION_DESTINATIONS,
  DISTRIBUTION_LANES,
  isLaneValidFor,
  type DistributionDestination,
  type DistributionLane,
} from "../../../../shared/social-publish-jobs.js";
import {
  affordableJobKinds,
  CLAIM_COST,
  PUBLISH_JOBS_PER_RUN,
  PUBLISH_SUBREQUEST_BUDGET,
  publishJobCost,
} from "./subrequest-budget.js";
import { computeRetryAt } from "../../../../shared/posting-agent.js";

export { PUBLISH_JOBS_PER_RUN };

/** Attempts before a job is given up on. */
export const MAX_PUBLISH_ATTEMPTS = 4;
/** A `running` job whose run hasn't finished in this long is reclaimed. */
export const STALE_RUNNING_MS = 15 * 60 * 1000;
/** First retry delay; doubles each attempt. */
export const RETRY_BASE_MS = 5 * 60 * 1000;

/** Every (destination, lane) a job can be. */
export const JOB_KINDS: ReadonlyArray<{ destination: DistributionDestination; lane: DistributionLane }> =
  DISTRIBUTION_DESTINATIONS.flatMap((destination) =>
    DISTRIBUTION_LANES.filter((lane) => isLaneValidFor(destination, lane)).map((lane) => ({ destination, lane })),
  );

/** The delay before attempt `attempt + 1`: 5 min, 10 min, 20 min, … */
export function retryDelayMs(attempt: number): number {
  return RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1);
}

/** A send failure. `permanent` = retrying can't help (not connected, no
 *  render, over the plan's cap, the project is gone). */
export class PublishJobError extends Error {
  constructor(
    message: string,
    public readonly permanent: boolean,
  ) {
    super(message);
    this.name = "PublishJobError";
  }
}

export interface DrainDeps {
  /** Claim the next due job of the given kinds (null = any), or null. */
  claim(args: { now: Date; staleBefore: Date; kinds: JobKindFilter }): Promise<PublishJob | null>;
  /** What an earlier attempt of `job` already produced, if anything. */
  producedRecord(job: PublishJob): Promise<JobResultRef | null>;
  /** Send the post. Throws PublishJobError (or anything — treated as retryable). */
  send(job: PublishJob): Promise<JobResultRef>;
  markDone(id: string, ref: JobResultRef, now: Date): Promise<void>;
  markRetry(id: string, error: string, runAt: Date, now: Date): Promise<void>;
  markFailed(id: string, error: string, now: Date): Promise<void>;
  /** After each job settles (cache invalidation). Never throws into the run. */
  onSettled?(job: PublishJob): void;
  /** Subrequests this run may spend (default PUBLISH_SUBREQUEST_BUDGET). */
  budget?: number;
}

export interface DrainSummary {
  claimed: number;
  sent: number;
  alreadySent: number;
  retrying: number;
  failed: number;
  /** Estimated subrequests left when the run stopped. */
  budgetLeft: number;
}

function messageOf(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 1000);
}

export async function drainPublishJobs(deps: DrainDeps, now: Date = new Date()): Promise<DrainSummary> {
  const summary: DrainSummary = { claimed: 0, sent: 0, alreadySent: 0, retrying: 0, failed: 0, budgetLeft: 0 };
  const staleBefore = new Date(now.getTime() - STALE_RUNNING_MS);
  let remaining = deps.budget ?? PUBLISH_SUBREQUEST_BUDGET;

  while (summary.claimed < PUBLISH_JOBS_PER_RUN) {
    const kinds = affordableJobKinds(JOB_KINDS, remaining);
    if (kinds.length === 0) break;
    const job = await deps.claim({ now, staleBefore, kinds: kinds.length === JOB_KINDS.length ? null : kinds });
    remaining -= CLAIM_COST;
    if (!job) break;
    summary.claimed++;
    remaining -= publishJobCost(job.destination as DistributionDestination, job.lane as DistributionLane);
    try {
      await runOne(job, deps, now, summary);
    } catch (err) {
      // Recording the outcome failed; the job stays `running` and is
      // reclaimed after STALE_RUNNING_MS, where the idempotency check runs.
      console.error(`[distribution] job ${job.id} outcome not recorded:`, messageOf(err));
    }
    try {
      deps.onSettled?.(job);
    } catch {
      // Cache invalidation is best-effort.
    }
  }
  summary.budgetLeft = Math.max(0, remaining);
  return summary;
}

async function runOne(job: PublishJob, deps: DrainDeps, now: Date, summary: DrainSummary): Promise<void> {
  // `attempts` was incremented by the claim: > 1 means an earlier attempt ran.
  if (job.attempts > 1) {
    const produced = await deps.producedRecord(job);
    if (produced) {
      await deps.markDone(job.id, produced, now);
      summary.alreadySent++;
      return;
    }
  }
  if (job.attempts > MAX_PUBLISH_ATTEMPTS) {
    await deps.markFailed(job.id, job.lastError ?? "Gave up after repeated attempts.", now);
    summary.failed++;
    return;
  }

  let ref: JobResultRef;
  try {
    ref = await deps.send(job);
  } catch (err) {
    const permanent = err instanceof PublishJobError && err.permanent;
    if (permanent || job.attempts >= MAX_PUBLISH_ATTEMPTS) {
      await deps.markFailed(job.id, messageOf(err), now);
      summary.failed++;
    } else {
      await deps.markRetry(job.id, messageOf(err), computeRetryAt(now, retryDelayMs(job.attempts)), now);
      summary.retrying++;
    }
    return;
  }
  await deps.markDone(job.id, ref, now);
  summary.sent++;
}
