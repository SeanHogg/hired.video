/**
 * INTERVAL (/15) cron jobs. Each is gated so an idle invocation makes no
 * Postgres query:
 *
 *   - registered workers: KV `work:workers:next-due` (earliest cadence due
 *     time, rewritten only after a dispatch that ran something) + each
 *     queue-gated worker's work marker. Only when one is due does the
 *     dispatcher read worker_runs — ONE DISTINCT ON query for every worker.
 *   - explicit-scan backfill / paid-media report resume: idle back-off —
 *     a run that finds nothing defers the sweep to the next hour.
 *   - job-board scrape: :00/:30 only, skipped while the hourly reconcile
 *     has recorded zero active sources.
 */
import { logger } from "../../lib/logger.js";
import { getKvNamespace } from "../../utils/edge-cache.js";
import { workers as registeredWorkers } from "../../workers/registry.js";
import {
  findLastRunStarts,
  isWorkerDueAt,
  runWorker,
  workerNextDueMs,
  WORKER_DUE_GRACE_MS,
} from "../../workers/runner.js";
import type { WorkerDefinition } from "../../workers/types.js";
import { isHalfHourInterval } from "./cron-plan.js";
import { deferSweepToNextHour, dueQueues, isSweepDeferred, readWorkMarkers } from "./work-signals.js";
import { loadNextDueTimes, settleAllMarkers } from "./work-queues.js";

type Env = Record<string, string | undefined>;
const workerEnv = (): Env => (globalThis as { __ENV?: Env }).__ENV ?? {};

const WORKERS_NEXT_DUE_KEY = "work:workers:next-due";
/** KV flag written by the hourly reconcile: "0" = no active job-board
 *  sources, so the :00/:30 scrape can skip its query. */
export const SCRAPE_SOURCES_KEY = "work:scrape:active-sources";

/** Explicit-scan backfill batch (migration 0505) — one or more model calls
 *  per video, so small. */
export const EXPLICIT_SCAN_BATCH = 5;

async function kvGet(key: string): Promise<string | null | undefined> {
  const kv = getKvNamespace();
  if (!kv) return undefined;
  try {
    return await kv.get(key);
  } catch {
    return undefined;
  }
}

async function kvPutIfChanged(key: string, value: string, previous: string | null | undefined): Promise<void> {
  if (previous === value) return;
  const kv = getKvNamespace();
  if (!kv) return;
  await kv.put(key, value).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Registered batch workers
// ---------------------------------------------------------------------------

export async function processRegisteredWorkers(now: Date = new Date()): Promise<void> {
  const nowMs = now.getTime();
  const cadenceWorkers = registeredWorkers.filter((w) => !w.workQueue);
  const queueWorkers = registeredWorkers.filter((w) => w.workQueue);

  const [nextDueRaw, markers] = await Promise.all([
    kvGet(WORKERS_NEXT_DUE_KEY),
    queueWorkers.length > 0 ? readWorkMarkers(queueWorkers.map((w) => w.workQueue!)) : Promise.resolve(null),
  ]);
  const cadenceDue = nextDueRaw == null || Number(nextDueRaw) - WORKER_DUE_GRACE_MS <= nowMs;
  const dueQueueNames = new Set(markers ? dueQueues(markers, nowMs, queueWorkers.map((w) => w.workQueue!)) : queueWorkers.map((w) => w.workQueue!));
  const candidates: WorkerDefinition[] = [
    ...(cadenceDue ? cadenceWorkers : []),
    ...queueWorkers.filter((w) => dueQueueNames.has(w.workQueue!)),
  ];
  if (candidates.length === 0) return;

  const lastStarts = await findLastRunStarts(candidates.map((w) => w.name));
  const ran = new Map<string, Date>();
  for (const worker of candidates) {
    if (!isWorkerDueAt(worker, lastStarts.get(worker.name), nowMs)) continue;
    try {
      ran.set(worker.name, new Date());
      const summary = await runWorker(worker, "cron", null);
      logger.info(
        `[scheduled] ran worker ${worker.name}: ${summary.status} ` +
          `scanned=${summary.itemsScanned} changed=${summary.itemsChanged} failed=${summary.itemsFailed}`,
      );
    } catch (err) {
      logger.error(`[scheduled] worker ${worker.name} dispatch failed`, err);
    }
  }

  if (cadenceDue) {
    const nextMs = Math.min(
      ...cadenceWorkers.map((w) => workerNextDueMs(w, ran.get(w.name) ?? lastStarts.get(w.name), nowMs)),
    );
    if (Number.isFinite(nextMs)) await kvPutIfChanged(WORKERS_NEXT_DUE_KEY, String(nextMs), nextDueRaw);
  }
  if (markers && queueWorkers.some((w) => ran.has(w.name))) {
    try {
      await settleAllMarkers(markers, await loadNextDueTimes(), Date.now());
    } catch (err) {
      logger.error("[scheduled] worker queue marker settle failed", err);
    }
  }
}

// ---------------------------------------------------------------------------
// Idle-back-off sweeps
// ---------------------------------------------------------------------------

/** Home-wall explicit-scan backfill (migration 0505): public videos written
 *  without a request context / changed since their last scan get scanned
 *  here. Unscanned videos stay off the wall (fail closed) until then. */
export async function processExplicitScanBackfill(): Promise<void> {
  if (await isSweepDeferred("explicit-scan")) return;
  const { backfillVideoScans } = await import("../moderation/explicit/review.js");
  const { createExplicitScanDeps } = await import("../moderation/explicit/deps.js");
  const { scanned } = await backfillVideoScans(createExplicitScanDeps(workerEnv() as never), EXPLICIT_SCAN_BATCH);
  if (scanned > 0) logger.info(`[scheduled] explicit-scan backfill scanned ${scanned} videos`);
  else await deferSweepToNextHour("explicit-scan");
}

/** Pending Microsoft Ads reports (submit → poll → download): each open
 *  report advances one step per run, at most 3 per run. */
export async function processPaidMediaReportResume(): Promise<void> {
  if (await isSweepDeferred("paid-media-reports")) return;
  const { resumePendingInsightReports } = await import("../paid-media/sync.js");
  const { checked } = await resumePendingInsightReports({ env: workerEnv() as never }, 3);
  if (checked === 0) await deferSweepToNextHour("paid-media-reports");
}

// ---------------------------------------------------------------------------
// Job-board scrape
// ---------------------------------------------------------------------------

export async function processJobBoardScrape(now: Date = new Date()): Promise<void> {
  if (!isHalfHourInterval(now)) return;
  if ((await kvGet(SCRAPE_SOURCES_KEY)) === "0") return;
  const { scrapeAllActiveSources } = await import("../job/scraper.js");
  await scrapeAllActiveSources();
}

/** Hourly: record whether any job-board source is active, so the :00/:30
 *  scrape can skip its query when none is. Written only when it changes. */
export async function refreshScrapeSourcesFlag(activeSources: number): Promise<void> {
  const value = activeSources > 0 ? "1" : "0";
  await kvPutIfChanged(SCRAPE_SOURCES_KEY, value, await kvGet(SCRAPE_SOURCES_KEY));
}

export async function runIntervalJobs(now: Date = new Date()): Promise<void> {
  const jobs: Array<[string, () => Promise<void>]> = [
    ["registered workers", () => processRegisteredWorkers(now)],
    ["explicit-scan backfill", processExplicitScanBackfill],
    ["paid-media report resume", processPaidMediaReportResume],
    ["job-board scrape", () => processJobBoardScrape(now)],
  ];
  await Promise.all(
    jobs.map(([name, run]) => run().catch((err) => logger.error(`[scheduled] ${name} failed`, err))),
  );
}
