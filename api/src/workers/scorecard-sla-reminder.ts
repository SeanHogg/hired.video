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
import { UsersRepository } from "../repositories/usersRepository.js";
import { getDb } from "../db/index.js";
import { sendGenericEmail } from "../services/adapters/email.js";
import type { WorkerDefinition, WorkerRunContext } from "./types.js";
import {
  planScorecardReminderSweep,
  type ReminderPlanInput,
} from "../services/scorecards/sla-reminder.js";
import type { NotificationInsert } from "../repositories/notificationsRepository.js";

const HOURLY_MS = 60 * 60 * 1000;
const REMIND_HORIZON_MS = 4 * HOURLY_MS;
const ESCALATE_AFTER_DUE_MS = 24 * HOURLY_MS;

async function run(ctx: WorkerRunContext): Promise<void> {
  const db = getDb();
  const repo = new ScorecardsRepository(db);
  const notifications = new NotificationsRepository(db);
  const users = new UsersRepository(db);
  const now = new Date();

  const overdue = await repo.findOverdueDraftSubmissions({
    now,
    remindWithinMs: REMIND_HORIZON_MS,
  });
  ctx.recordScanned(overdue.length);
  if (overdue.length === 0) return;

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

  // Escalation recipients: the kit's `escalateToUserId` if set, else fall
  // back to the evaluator — resolved for ALL escalations in one joined read
  // (was 3 sequential lookups per submission).
  const escalationRecipientById = await repo.findEscalationRecipients(
    plan.escalations.map((a) => a.id),
  );

  const actions: DispatchAction[] = [
    ...plan.reminders.map((a) => ({
      kind: "remind" as const,
      submissionId: a.id,
      recipientUserId: a.evaluatorUserId,
    })),
    ...plan.escalations.map((a) => ({
      kind: "escalate" as const,
      submissionId: a.id,
      recipientUserId: escalationRecipientById.get(a.id) ?? a.evaluatorUserId,
    })),
  ];
  if (actions.length === 0) return;

  // 1) Bell notifications for every action — ONE multi-row insert.
  await notifications.insertNotifications(
    actions.map((action) => {
      const copy = copyFor(action.kind);
      return {
        userId: action.recipientUserId,
        type: action.kind === "remind" ? "scorecard_reminder" : "scorecard_overdue_escalation",
        title: copy.title,
        message: copy.message,
        data: { submissionId: action.submissionId },
      } as NotificationInsert;
    }),
  );

  // 2) Mark reminded / escalated — one UPDATE per kind (was one per row).
  //    Done right after the bell rows land (and before best-effort email)
  //    so a mid-run crash can't re-notify already-notified submissions.
  await repo.updateSubmissions(plan.reminders.map((a) => a.id), { remindedAt: now });
  await repo.updateSubmissions(plan.escalations.map((a) => a.id), { escalatedAt: now });
  for (let i = 0; i < actions.length; i++) ctx.recordChanged();

  // 3) Email is best-effort — failures don't block the notification or the
  //    row updates, and an absent provider just logs a warning.
  //    `sendGenericEmail` no-ops + logs when no provider is configured, so
  //    the worker stays safe in tests + dev environments without creds.
  //    Recipient emails are loaded in ONE query (was a lookup per action).
  const recipients = await users
    .findManyByIds([...new Set(actions.map((a) => a.recipientUserId))])
    .catch(() => []);
  const emailById = new Map(recipients.filter((u) => u.email).map((u) => [u.id, u.email as string]));
  for (const action of actions) {
    try {
      const to = emailById.get(action.recipientUserId);
      if (to) {
        const copy = copyFor(action.kind);
        await sendGenericEmail(
          to,
          copy.title,
          `<p>${copy.message}</p>
           <p>Submission ID: <code>${action.submissionId}</code></p>
           <p>Open Hired.Video to complete it.</p>`,
        );
      }
    } catch (err: any) {
      ctx.recordFailure(action.submissionId, `email-dispatch: ${err?.message ?? err}`);
    }
  }
}

interface DispatchAction {
  kind: "remind" | "escalate";
  submissionId: string;
  recipientUserId: string;
}

function copyFor(kind: DispatchAction["kind"]): { title: string; message: string } {
  return kind === "remind"
    ? { title: "Scorecard due soon", message: "Your interview scorecard is due in the next 4 hours." }
    : {
        title: "Scorecard overdue — please submit",
        message: "Your interview scorecard is more than 24 hours overdue and has been escalated.",
      };
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
