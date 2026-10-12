/**
 * Scorecard SLA reminder planning — pure scheduling logic (#1383).
 *
 * Given a set of overdue draft submissions, decide which need a 4h-warning
 * reminder and which need a 24h-past-due escalation. Pure functions so the
 * worker's behavior is testable without DB / email side-effects.
 *
 * Rules:
 *
 *   • REMIND if `now >= dueAt - horizonMs` AND no remind has been sent
 *     within the current cycle. We treat a remind as "current cycle" if
 *     `remindedAt >= dueAt - horizonMs` — re-sending one remind per cycle
 *     covers the case where the worker missed a tick.
 *
 *   • ESCALATE if `now >= dueAt + escalateAfterMs` AND `escalatedAt` is
 *     null. Escalation is one-shot — once the kit's escalateToUserId has
 *     been notified, we don't keep paging them. Setting `escalatedAt`
 *     idempotently is the responsibility of the worker.
 */

export interface ReminderPlanInput {
  id: string;
  evaluatorUserId: string;
  applicationId: string;
  dueAt: Date;
  remindedAt: Date | null;
  escalatedAt: Date | null;
}

export interface ReminderAction {
  id: string;
  evaluatorUserId: string;
  applicationId: string;
}

export interface ReminderPlan {
  reminders: ReminderAction[];
  escalations: ReminderAction[];
}

export interface ReminderDispatcher {
  (action: {
    kind: "remind" | "escalate";
    submissionId: string;
    recipientUserId: string;
  }): Promise<void>;
}

export function planScorecardReminderSweep(opts: {
  now: Date;
  horizonMs: number;
  escalateAfterMs: number;
  candidates: readonly ReminderPlanInput[];
}): ReminderPlan {
  const reminders: ReminderAction[] = [];
  const escalations: ReminderAction[] = [];
  const nowMs = opts.now.getTime();

  for (const sub of opts.candidates) {
    const dueMs = sub.dueAt.getTime();
    const remindEligibleAt = dueMs - opts.horizonMs;
    const escalateEligibleAt = dueMs + opts.escalateAfterMs;

    const remindedThisCycle =
      sub.remindedAt != null && sub.remindedAt.getTime() >= remindEligibleAt;
    if (!remindedThisCycle && nowMs >= remindEligibleAt) {
      reminders.push({
        id: sub.id,
        evaluatorUserId: sub.evaluatorUserId,
        applicationId: sub.applicationId,
      });
    }

    if (sub.escalatedAt == null && nowMs >= escalateEligibleAt) {
      escalations.push({
        id: sub.id,
        evaluatorUserId: sub.evaluatorUserId,
        applicationId: sub.applicationId,
      });
    }
  }

  return { reminders, escalations };
}
