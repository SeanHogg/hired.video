// Generic batch-worker framework. Each worker scans rows in some
// table and processes them in batches. Runs are persisted to the
// `worker_runs` table for SuperAdmin observability and cadence
// gating. See migration 0080.

export type WorkerStatus = "running" | "success" | "partial" | "error";
export type WorkerTrigger = "cron" | "manual";

export interface WorkerRunContext {
  // The persisted worker_runs.id — workers can reference this when
  // attaching per-item failures via ctx.recordFailure().
  runId: string;
  trigger: WorkerTrigger;
  // The SuperAdmin who clicked "run now", if trigger === "manual".
  triggeredBy: string | null;
  // Workers report progress via these methods. The runner tallies.
  recordChanged(): void;
  recordSkipped(): void;
  recordScanned(n?: number): void;
  recordFailure(itemId: string, message: string, extra?: Record<string, unknown>): void;
  // Optional sample diff or note attached to the run, capped server-side.
  recordSample(sample: Record<string, unknown>): void;
}

export interface WorkerDefinition {
  // Stable identifier — used in URLs, cron gate, and the worker_runs row.
  // [a-z0-9-_]
  name: string;
  displayName: string;
  description: string;
  // Cadence between cron-triggered runs. The /5 cron tick checks
  // `now - max(started_at) >= cadenceMs` per worker; manual triggers
  // ignore this.
  cadenceMs: number;
  batchSize: number;
  run: (ctx: WorkerRunContext) => Promise<void>;
}
