import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type { WorkerDefinition, WorkerRunContext, WorkerStatus, WorkerTrigger } from "./types.js";

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
    console.error(`[worker:${worker.name}] run ${runId} crashed:`, err);
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

// Cron-tick gate: returns true if `cadenceMs` has elapsed since the
// last run of this worker, so it should fire on the current tick.
// Manual triggers bypass this entirely.
export async function isWorkerDue(worker: WorkerDefinition, now: Date = new Date()): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ startedAt: schema.workerRuns.startedAt })
    .from(schema.workerRuns)
    .where(eq(schema.workerRuns.workerName, worker.name))
    .orderBy(sql`started_at desc`)
    .limit(1);

  if (!row) return true;
  const ageMs = now.getTime() - new Date(row.startedAt).getTime();
  return ageMs >= worker.cadenceMs;
}
