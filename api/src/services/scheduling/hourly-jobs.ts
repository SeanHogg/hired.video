/**
 * HOURLY cron (hh:02) — runs every job `hourlyJobsFor(now)` selects, in
 * order. Every hour: the config snapshot (KV-deduped, no query when the
 * release is unchanged) and the marker-gated hourly queues (posting agent,
 * off-platform metrics — KV reads only unless a marker is due). On the
 * reconcile hours: the marker reconcile. The daily / weekly / monthly jobs
 * run in their hour. So an idle non-reconcile hour never wakes Neon.
 */
import { getDb } from "../../db/index.js";
import { logger } from "../../lib/logger.js";
import { buildRepos } from "../../repositories/index.js";
import { WorkQueueRepository } from "../../repositories/workQueueRepository.js";
import { hourlyJobsFor, type HourlyJob } from "./cron-plan.js";
import { loadNextDueTimes, reconcileWorkMarkers, settleAllMarkers } from "./work-queues.js";
import { dueQueues, HOURLY_QUEUES, readWorkMarkers, type WorkQueue } from "./work-signals.js";
import { refreshScrapeSourcesFlag } from "./interval-jobs.js";
import {
  runArticleEngagementPayout,
  runDailyMaintenance,
  runGeocoderRefreshJob,
  runModelCatalogDrift,
  runMonthlyUsageClose,
  runPartnerPoolClose,
  runPayoutRelease,
  runPlacementStageEvents,
  runSeedSuperAdmin,
} from "./calendar-jobs.js";

type Env = Record<string, string | undefined>;
const workerEnv = (): Env => (globalThis as { __ENV?: Env }).__ENV ?? {};

/** Repair every KV work marker from Postgres + refresh the scrape flag. */
async function reconcile(now: Date): Promise<void> {
  await reconcileWorkMarkers(now);
  await refreshScrapeSourcesFlag(await new WorkQueueRepository(getDb()).countActiveJobBoardSources());
}

/** Production capabilities on the live release (deduped per release). */
async function configSnapshot(): Promise<void> {
  const { recordConfigSnapshot } = await import("../observability/config-snapshot.js");
  if (await recordConfigSnapshot(buildRepos(getDb()).audit)) logger.info("[scheduled] config snapshot recorded");
}

/** AI Posting Agent (#2300) — expire drafts, plan posts for due users. */
async function postingAgent(): Promise<void> {
  const { processPostingAgent } = await import("../distribution/process-posting-agent.js");
  await processPostingAgent(workerEnv() as never);
}

/** Off-platform reach sync (#2048), ≤ 6 posts per run. */
async function externalPostMetrics(): Promise<void> {
  const { processExternalPostMetrics } = await import("../distribution/metrics/sync-post-metrics.js");
  await processExternalPostMetrics(workerEnv() as never);
}

const HOURLY_QUEUE_RUNNERS: Record<(typeof HOURLY_QUEUES)[number], () => Promise<void>> = {
  "posting-agent": postingAgent,
  "post-metrics": externalPostMetrics,
};

/** Run each hourly queue whose KV marker is due, then re-derive the
 *  markers in one query. No due marker → KV reads only, no Postgres.
 *  KV unavailable (dev / outage) → every hourly queue runs, as before. */
export async function runHourlyQueues(now: Date = new Date()): Promise<WorkQueue[]> {
  const markers = await readWorkMarkers(HOURLY_QUEUES);
  const due = dueQueues(markers, now.getTime(), HOURLY_QUEUES) as Array<(typeof HOURLY_QUEUES)[number]>;
  if (due.length === 0) return [];
  for (const queue of due) {
    try {
      await HOURLY_QUEUE_RUNNERS[queue]();
    } catch (err) {
      logger.error(`[scheduled] hourly queue ${queue} failed`, err);
    }
  }
  if (markers) {
    try {
      const all = await readWorkMarkers();
      await settleAllMarkers(all, await loadNextDueTimes(), Date.now());
    } catch (err) {
      logger.error("[scheduled] hourly queue marker settle failed", err);
    }
  }
  return due;
}

const HOURLY_RUNNERS: Record<HourlyJob, (now: Date) => Promise<void>> = {
  "reconcile-markers": reconcile,
  "config-snapshot": configSnapshot,
  "hourly-queues": async (now) => {
    await runHourlyQueues(now);
  },
  "seed-superadmin": runSeedSuperAdmin,
  maintenance: runDailyMaintenance,
  "model-catalog-drift": runModelCatalogDrift,
  "geocoder-refresh": runGeocoderRefreshJob,
  "placement-stage-events": runPlacementStageEvents,
  "monthly-usage-close": runMonthlyUsageClose,
  "partner-pool-close": runPartnerPoolClose,
  "article-engagement-payout": runArticleEngagementPayout,
  "payout-release": runPayoutRelease,
};

/** Sequential: each job is isolated (one failure never stops the rest) and
 *  the heavy daily passes never overlap. */
export async function runHourlyJobs(now: Date = new Date()): Promise<void> {
  for (const job of hourlyJobsFor(now)) {
    try {
      await HOURLY_RUNNERS[job](now);
    } catch (err) {
      logger.error(`[scheduled] hourly job ${job} failed`, err);
    }
  }
}
