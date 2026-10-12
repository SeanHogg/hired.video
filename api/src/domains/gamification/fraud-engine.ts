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

  // ── Phase 4 inputs ─────────────────────────────────────────────────

  /** USD-cents value of all redemptions in the last 24h. Detects
   *  "cash out every dollar the instant points are earned". */
  redemptionsLast24hValueCents?: number;
  /** Distinct user accounts that share the same `signup_ip` as this
   *  user. >= 5 looks like a sybil ring. */
  accountsOnSignupIp?: number;
  /** Distinct accounts sharing this user's recent device fingerprint
   *  (extension/app device id). */
  accountsOnDeviceFingerprint?: number;
  /** Stripe refunds + chargebacks since the user's first earning
   *  event. High counts after redemption look like refund-then-redeem
   *  abuse. */
  refundsSinceFirstEarn?: number;
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

  // ─── Phase 4: redemption-side heuristics ─────────────────────────────

  // Rapid redemption: > $200 cashed out in a 24h window is unusual for
  // a legitimate job-seeker and the natural shape of refund-then-redeem
  // abuse. Medium severity — flag for SA review, don't auto-suspend so
  // legit power users don't get locked out.
  if ((input.redemptionsLast24hValueCents ?? 0) > 20_000) {
    flags.push({
      kind: "rapid_redemption",
      severity: "medium",
      autoSuspend: false,
      evidence: {
        valueCents24h: input.redemptionsLast24hValueCents,
      },
      summary: `Redeemed $${((input.redemptionsLast24hValueCents ?? 0) / 100).toFixed(2)} in the last 24h.`,
    });
  }

  // Sybil: many accounts on the same signup IP. >= 5 = high; auto-
  // suspend the *current* user (the existing fraud-flag path takes
  // care of suspension; we leave the other accounts to the SA review
  // who can suspend them via the user lookup endpoint).
  if ((input.accountsOnSignupIp ?? 0) >= 5) {
    flags.push({
      kind: "sybil_signup_ip",
      severity: "high",
      autoSuspend: true,
      evidence: { accountsOnSignupIp: input.accountsOnSignupIp },
      summary: `Signup IP shared by ${input.accountsOnSignupIp} other accounts.`,
    });
  }

  // Device clustering: 3+ accounts on a single fingerprint without IP
  // overlap (NAT / shared wifi makes IPs noisier than device ids).
  if ((input.accountsOnDeviceFingerprint ?? 0) >= 3) {
    flags.push({
      kind: "device_cluster",
      severity: "medium",
      autoSuspend: false,
      evidence: { accountsOnDeviceFingerprint: input.accountsOnDeviceFingerprint },
      summary: `Device fingerprint shared by ${input.accountsOnDeviceFingerprint} accounts.`,
    });
  }

  // Refund-then-redeem: the user issued > 1 refund after their first
  // earn — i.e. they're undoing the very purchases that gave them
  // points. High severity; auto-suspend until SA reviews.
  if ((input.refundsSinceFirstEarn ?? 0) >= 2) {
    flags.push({
      kind: "refund_then_redeem",
      severity: "high",
      autoSuspend: true,
      evidence: { refundsSinceFirstEarn: input.refundsSinceFirstEarn },
      summary: `${input.refundsSinceFirstEarn} refunds recorded since the user's first earning event.`,
    });
  }

  return flags;
}
