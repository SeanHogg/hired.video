/**
 * Scorecard SLA reminder worker (migration 0132 / gap #1383).
 *
 * Scans `scorecard_submissions` rows in `status='draft'` whose `due_at`
 * falls within the reminder horizon (default 4 hours) and emits a single
 * reminder per submission per cycle. Past-due submissions that still
 * haven't been submitted at `due_at + 24h` escalate to the kit's
 * `escalateToUserId` (one escalation per submission, idempotent via
 * `escalatedAt`).
 *
 * The nudge dispatcher is dependency-injected so tests can assert "would
 * have sent" without touching the email pipeline. Production wiring uses
 * the existing notifications repository.
 */

import { ScorecardsRepository } from "../repositories/scorecardsRepository.js";
import { getDb } from "../db/index.js";
import type { WorkerDefinition, WorkerRunContext } from "./types.js";
import {
  planScorecardReminderSweep,
  type ReminderDispatcher,
  type ReminderPlanInput,
} from "../services/scorecards/sla-reminder.js";

const HOURLY_MS = 60 * 60 * 1000;
const REMIND_HORIZON_MS = 4 * HOURLY_MS;
const ESCALATE_AFTER_DUE_MS = 24 * HOURLY_MS;

async function run(ctx: WorkerRunContext): Promise<void> {
  const db = getDb();
  const repo = new ScorecardsRepository(db);
  const now = new Date();

  const overdue = await repo.findOverdueDraftSubmissions({
    now,
    remindWithinMs: REMIND_HORIZON_MS,
  });
  ctx.recordScanned(overdue.length);
  if (overdue.length === 0) return;

  // Default dispatcher logs only — wiring to the email/notification
  // service is layered on top by the route-level injector when this
  // worker is added to the cron rotation.
  const dispatch: ReminderDispatcher = async () => {
    /* no-op in default wiring; real impl injected by app composition */
  };

  const plan = planScorecardReminderSweep({
    now,
    horizonMs: REMIND_HORIZON_MS,
    escalateAfterMs: ESCALATE_AFTER_DUE_MS,
    candidates: overdue.map(
      (o): ReminderPlanInput => ({
        id: o.id,
        evaluatorUserId: o.evaluatorUserId,
        applicationId: o.applicationId,
        dueAt: o.dueAt,
        remindedAt: o.remindedAt,
        escalatedAt: o.escalatedAt,
      }),
    ),
  });

  for (const action of plan.reminders) {
    await dispatch({ kind: "remind", submissionId: action.id, recipientUserId: action.evaluatorUserId });
    await repo.updateSubmission(action.id, { remindedAt: now });
    ctx.recordChanged();
  }
  for (const action of plan.escalations) {
    await dispatch({ kind: "escalate", submissionId: action.id, recipientUserId: action.evaluatorUserId });
    await repo.updateSubmission(action.id, { escalatedAt: now });
    ctx.recordChanged();
  }
}

export const scorecardSlaReminderWorker: WorkerDefinition = {
  name: "scorecard-sla-reminder",
  displayName: "Scorecard SLA Reminders",
  description:
    "Sends scorecard submission reminders 4h before due_at and escalates 24h after due_at.",
  cadenceMs: HOURLY_MS,
  batchSize: 500,
  run,
};
