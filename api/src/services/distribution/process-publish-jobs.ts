/**
 * The cron step for scheduled posts (#2047): wires the drainer's rules
 * (drain-publish-jobs.ts) to the queue table and the real send path. Called
 * from scheduled.ts on every 5-minute tick; when nothing is due it costs one
 * UPDATE (the claim) and returns. Its subrequest budget and per-destination
 * cost estimates live in subrequest-budget.ts.
 */
import * as jobs from "../../repositories/socialPublishJobRepository.js";
import { drainPublishJobs } from "./drain-publish-jobs.js";
import { producedRecord, sendPublishJob, type DistributionEnv } from "./send-publish-job.js";
import { invalidateJobLists } from "./schedule-publish-jobs.js";

/** When the posting-agent kill switch is off, the drainer skips agent jobs. */
export function agentExcludeSource(env?: DistributionEnv & { POSTING_AGENT_ENABLED?: string }): "agent" | undefined {
  return env?.POSTING_AGENT_ENABLED === "false" ? "agent" : undefined;
}

export async function processSocialPublishJobs(
  env: (DistributionEnv & { POSTING_AGENT_ENABLED?: string }) | undefined,
): Promise<void> {
  const summary = await drainPublishJobs({
    claim: (args) =>
      jobs.claimNextJob({
        ...args,
        excludeSource: agentExcludeSource(env),
      }),
    producedRecord: (job) => producedRecord(job),
    send: (job) => sendPublishJob(job, env),
    markDone: (id, ref, now) => jobs.markDone(id, ref, now),
    markRetry: (id, error, runAt, now) => jobs.markRetry(id, error, runAt, now),
    markFailed: (id, error, now) => jobs.markFailed(id, error, now),
    onSettled: (job) => invalidateJobLists(job.createdBy),
  });
  if (summary.claimed > 0) console.log("[scheduled] social publish jobs", summary);
}
