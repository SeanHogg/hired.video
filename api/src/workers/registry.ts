import { jobBodyCleanseWorker } from "./job-body-cleanse.js";
import type { WorkerDefinition } from "./types.js";

// Registered batch workers. Adding a new one is dropping a definition
// in here — scheduled.ts iterates this on every cron tick (gated by
// each worker's cadenceMs) and the admin UI lists everything that's
// here, even workers that haven't run yet.
export const workers: readonly WorkerDefinition[] = [
  jobBodyCleanseWorker,
];

export function getWorker(name: string): WorkerDefinition | undefined {
  return workers.find((w) => w.name === name);
}
