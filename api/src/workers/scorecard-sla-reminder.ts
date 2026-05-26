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
import { NotificationsRepository } from "../repositories/notificationsRepository.js";
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
  const notifications = new NotificationsRepository(db);
  const now = new Date();

  const overdue = await repo.findOverdueDraftSubmissions({
    now,
    remindWithinMs: REMIND_HORIZON_MS,
  });
  ctx.recordScanned(overdue.length);
  if (overdue.length === 0) return;

  // Dispatch via the existing notifications repository — same channel
  // the recruiter coffee + connection flows use. Email is a separate
  // follow-on (see #1383 README entry — would layer a SendPulse call
  // alongside this insert, identical to the coffee-request pattern).
  const dispatch: ReminderDispatcher = async (action) => {
    const remind = action.kind === "remind";
    await notifications.insertNotification({
      userId: action.recipientUserId,
      type: remind ? "scorecard_reminder" : "scorecard_overdue_escalation",
      title: remind
        ? "Scorecard due soon"
        : "Scorecard overdue — please submit",
      message: remind
        ? "Your interview scorecard is due in the next 4 hours."
        : "Your interview scorecard is more than 24 hours overdue and has been escalated.",
      data: { submissionId: action.submissionId } as any,
    } as any);
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
    await dispatch({
      kind: "remind",
      submissionId: action.id,
      recipientUserId: action.evaluatorUserId,
    });
    await repo.updateSubmission(action.id, { remindedAt: now });
    ctx.recordChanged();
  }

  // Escalation recipients: the kit's `escalateToUserId` if set, else fall
  // back to the evaluator. Resolved per submission via the existing
  // submission → kit-stage → kit chain so we don't change the planner's
  // pure-function contract.
  const escalationRecipientById = new Map<string, string>();
  for (const action of plan.escalations) {
    const recipient = await resolveEscalationRecipient(
      repo,
      action.id,
      action.evaluatorUserId,
    );
    escalationRecipientById.set(action.id, recipient);
  }
  for (const action of plan.escalations) {
    const recipientUserId =
      escalationRecipientById.get(action.id) ?? action.evaluatorUserId;
    await dispatch({
      kind: "escalate",
      submissionId: action.id,
      recipientUserId,
    });
    await repo.updateSubmission(action.id, { escalatedAt: now });
    ctx.recordChanged();
  }
}

async function resolveEscalationRecipient(
  repo: ScorecardsRepository,
  submissionId: string,
  fallback: string,
): Promise<string> {
  const sub = await repo.findSubmissionById(submissionId);
  if (!sub?.kitStageId) return fallback;
  const stage = await repo.findStageById(sub.kitStageId);
  if (!stage) return fallback;
  const kit = await repo.findKitById(stage.kitId);
  return kit?.escalateToUserId ?? fallback;
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
