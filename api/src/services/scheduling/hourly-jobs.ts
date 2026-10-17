/**
 * HOURLY cron (hh:02) — runs every job `hourlyJobsFor(now)` selects, in
 * order. The every-hour ones (marker reconcile, config snapshot, posting
 * agent, off-platform metrics) share the Neon wake-up the hourly workers
 * already cause; the daily / weekly / monthly ones run in their hour.
 */
import { getDb } from "../../db/index.js";
import { logger } from "../../lib/logger.js";
import { buildRepos } from "../../repositories/index.js";
import { WorkQueueRepository } from "../../repositories/workQueueRepository.js";
import { hourlyJobsFor, type HourlyJob } from "./cron-plan.js";
import { reconcileWorkMarkers } from "./work-queues.js";
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

const HOURLY_RUNNERS: Record<HourlyJob, (now: Date) => Promise<void>> = {
  "reconcile-markers": reconcile,
  "config-snapshot": configSnapshot,
  "posting-agent": postingAgent,
  "external-post-metrics": externalPostMetrics,
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
