import { jobBodyCleanseWorker } from "./job-body-cleanse.js";
import { recruiterAgentFollowupWorker } from "./recruiter-agent-followup.js";
import { assessmentNormsWorker } from "./assessment-norms-recompute.js";
import { scorecardSlaReminderWorker } from "./scorecard-sla-reminder.js";
import { streakAtRiskReminderWorker } from "./streak-at-risk-reminder.js";
import type { WorkerDefinition } from "./types.js";

// Registered batch workers. Adding a new one is dropping a definition
// in here — scheduled.ts iterates this on every cron tick (gated by
// each worker's cadenceMs) and the admin UI lists everything that's
// here, even workers that haven't run yet.
export const workers: readonly WorkerDefinition[] = [
  jobBodyCleanseWorker,
  recruiterAgentFollowupWorker,
  assessmentNormsWorker,
  scorecardSlaReminderWorker,
  streakAtRiskReminderWorker,
];

export function getWorker(name: string): WorkerDefinition | undefined {
  return workers.find((w) => w.name === name);
}
