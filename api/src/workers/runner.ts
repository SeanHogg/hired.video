import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type { WorkerDefinition, WorkerRunContext, WorkerStatus, WorkerTrigger } from "./types.js";
import { logger } from "../lib/logger.js";

// Cap the size of the `details` jsonb so a worker that fails on every row
// can't blow up the row beyond what Postgres jsonb can comfortably hold.
const MAX_FAILURES_PERSISTED = 50;
const MAX_SAMPLES_PERSISTED = 10;

export interface WorkerRunSummary {
  runId: string;
  status: WorkerStatus;
  itemsScanned: number;
  itemsChanged: number;
  itemsSkipped: number;
  itemsFailed: number;
  errorMessage: string | null;
}

interface FailureEntry {
  itemId: string;
  message: string;
  extra?: Record<string, unknown>;
  at: string;
}

// Run one worker. Opens a worker_runs row, calls worker.run(ctx),
// persists the final tallies and details, returns a summary. Used by
// both the cron tick (scheduled.ts) and the manual-trigger admin
// endpoint.
export async function runWorker(
  worker: WorkerDefinition,
  trigger: WorkerTrigger,
  triggeredBy: string | null,
): Promise<WorkerRunSummary> {
  const db = getDb();
  const startedAt = new Date();

  const failures: FailureEntry[] = [];
  const samples: Record<string, unknown>[] = [];
  let scanned = 0;
  let changed = 0;
  let skipped = 0;
  let failed = 0;

  const [row] = await db
    .insert(schema.workerRuns)
    .values({
      workerName: worker.name,
      status: "running",
      trigger,
      triggeredBy: triggeredBy ?? undefined,
      startedAt,
    } as never)
    .returning({ id: schema.workerRuns.id });

  const runId = row!.id;

  const ctx: WorkerRunContext = {
    runId,
    trigger,
    triggeredBy,
    recordScanned: (n = 1) => { scanned += n; },
    recordChanged: () => { changed += 1; },
    recordSkipped: () => { skipped += 1; },
    recordFailure: (itemId, message, extra) => {
      failed += 1;
      if (failures.length < MAX_FAILURES_PERSISTED) {
        failures.push({ itemId, message, extra, at: new Date().toISOString() });
      }
    },
    recordSample: (sample) => {
      if (samples.length < MAX_SAMPLES_PERSISTED) samples.push(sample);
    },
  };

  let status: WorkerStatus;
  let errorMessage: string | null = null;

  try {
    await worker.run(ctx);
    if (failed === 0) {
      status = "success";
    } else if (changed > 0 || skipped > 0) {
      status = "partial";
    } else {
      status = "error";
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    status = "error";
    logger.error(`[worker:${worker.name}] run crashed`, { worker: worker.name, runId, error: err });
  }

  const completedAt = new Date();
  const details = {
    failures,
    samples,
    truncated: {
      failures: failed > MAX_FAILURES_PERSISTED,
      samples: samples.length === MAX_SAMPLES_PERSISTED,
    },
  };

  await db
    .update(schema.workerRuns)
    .set({
      status,
      itemsScanned: scanned,
      itemsChanged: changed,
      itemsSkipped: skipped,
      itemsFailed: failed,
      errorMessage,
      details,
      completedAt,
    } as never)
    .where(eq(schema.workerRuns.id, runId));

  return {
    runId,
    status,
    itemsScanned: scanned,
    itemsChanged: changed,
    itemsSkipped: skipped,
    itemsFailed: failed,
    errorMessage,
  };
}

/** Cron ticks fire a few seconds either side of the minute; a worker whose
 *  previous run started at hh:00:04 must still count as due at the next
 *  hh:00:01 tick, or every hourly worker would drift a whole interval. */
export const WORKER_DUE_GRACE_MS = 2 * 60 * 1000;

/** Latest `started_at` per worker name, in ONE query (DISTINCT ON over
 *  worker_runs (worker_name, started_at DESC)). Workers that never ran are
 *  absent from the map. Replaces one ORDER BY … LIMIT 1 query per worker. */
export async function findLastRunStarts(names: readonly string[]): Promise<Map<string, Date>> {
  if (names.length === 0) return new Map();
  const db = getDb();
  const rows: Array<{ workerName: string; startedAt: Date }> = await db
    .selectDistinctOn([schema.workerRuns.workerName], {
      workerName: schema.workerRuns.workerName,
      startedAt: schema.workerRuns.startedAt,
    })
    .from(schema.workerRuns)
    .where(inArray(schema.workerRuns.workerName, [...names]))
    .orderBy(schema.workerRuns.workerName, desc(schema.workerRuns.startedAt));
  return new Map(rows.map((r) => [r.workerName, new Date(r.startedAt)]));
}

/** When `worker` is next due given its last cron/manual start (epoch ms).
 *  Never ran → due now. */
export function workerNextDueMs(worker: WorkerDefinition, lastStartedAt: Date | undefined, nowMs: number): number {
  if (!lastStartedAt) return nowMs;
  return lastStartedAt.getTime() + worker.cadenceMs;
}

/** Cron-tick gate: true once `cadenceMs` (less the tick grace) has elapsed
 *  since the worker's last run. Manual triggers bypass this entirely. */
export function isWorkerDueAt(worker: WorkerDefinition, lastStartedAt: Date | undefined, nowMs: number): boolean {
  return workerNextDueMs(worker, lastStartedAt, nowMs) - WORKER_DUE_GRACE_MS <= nowMs;
}
