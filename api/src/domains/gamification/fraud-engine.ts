/**
 * Fraud engine v1. Stateless evaluator: given a user's recent ledger
 * activity, return any flags that should be raised. Detection is
 * intentionally simple in v1 — bulk-close detection on user-generated
 * tasks is the spec's named concern ("create 100 fake tasks and close
 * them all"). Phase 4 will broaden this with rapid-redemption, self-
 * referral, and IP/device clustering.
 *
 * Pure module; the caller (points engine / superadmin scheduled job)
 * fetches inputs and writes flags via the repository.
 */

export interface FraudInput {
  userId: string;
  /** Closed user-generated tasks per minute, last 30 minutes. The
   *  caller pre-aggregates from `pointsLedger` rows where
   *  action='task.complete.user'. */
  recentUserTaskClosesPerMinute: number[];
  /** Total user-generated tasks closed in the last hour. */
  recentUserTaskClosesLastHour: number;
  /** Number of distinct day-buckets across all earnings in the last
   *  24h. Detection heuristic for "burst earning followed by silence". */
  earningDayBuckets24h: number;
  /** Recent ledger snapshot for the evidence payload. */
  recentLedgerSample: Array<{ action: string; delta: number; at: Date }>;
}

export interface FraudFlagCandidate {
  kind: string;
  severity: "low" | "medium" | "high";
  /** When high, the points engine should auto-suspend and write the
   *  flag with `autoSuspended = true`. */
  autoSuspend: boolean;
  evidence: Record<string, unknown>;
  /** Human-readable summary for the superadmin review queue. */
  summary: string;
}

/**
 * V1 heuristics:
 *
 *   1. **Bulk-close burst.** ≥ 20 user-task completions inside any
 *      single rolling minute window → high; auto-suspend. This is the
 *      "create 100 fake tasks and close them all" pattern the user
 *      flagged.
 *
 *   2. **Sustained closure spike.** > 60 user-task completions in one
 *      hour → medium; flag for review but keep earning live (the gate
 *      already caps points for the first 100 tasks at zero, so the
 *      financial impact is small until the gate is open).
 *
 * Returns zero, one, or two flags. The caller decides what to write.
 */
export function evaluate(input: FraudInput): FraudFlagCandidate[] {
  const flags: FraudFlagCandidate[] = [];

  const peakPerMinute = input.recentUserTaskClosesPerMinute.length
    ? Math.max(...input.recentUserTaskClosesPerMinute)
    : 0;

  if (peakPerMinute >= 20) {
    flags.push({
      kind: "bulk_close_burst",
      severity: "high",
      autoSuspend: true,
      evidence: {
        peakPerMinute,
        windowMinutes: input.recentUserTaskClosesPerMinute.length,
        recentLedgerSample: input.recentLedgerSample.slice(0, 20),
      },
      summary: `Closed ${peakPerMinute} user-generated tasks in a single minute.`,
    });
  }

  if (input.recentUserTaskClosesLastHour > 60) {
    flags.push({
      kind: "sustained_closure_spike",
      severity: "medium",
      autoSuspend: false,
      evidence: {
        closesLastHour: input.recentUserTaskClosesLastHour,
        recentLedgerSample: input.recentLedgerSample.slice(0, 20),
      },
      summary: `Closed ${input.recentUserTaskClosesLastHour} user-generated tasks in the last hour.`,
    });
  }

  return flags;
}
