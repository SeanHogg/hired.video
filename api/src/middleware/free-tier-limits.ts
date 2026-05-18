/**
 * Period-start helper for Free-tier monthly-window math.
 *
 * The Free-tier hard-limit guards (`checkTeamSize`,
 * `checkInterviewSessionsThisMonth`, studio video quota) used to live here
 * but were migrated to `servicesProcessor.enforce(c, eventType)` once the
 * catalog gained per-dimension `consumedSource` dispatch — adding a new
 * cap is now a one-row catalog edit, not a new function in this file.
 *
 * Only the period-start helper survives because other middleware
 * (token-budget, etc.) still wants the same UTC-month boundary the
 * catalog uses internally.
 *
 * Sibling modules:
 *   - `middleware/auth-gates.ts`     (requirePro, requireVideoAnalytics)
 *   - `middleware/token-budget.ts`   (checkTokenBudget, attachTokenBudget…)
 *   - `domains/services-processing/services-processor.ts` (enforce / meter)
 */

/**
 * Returns midnight UTC on day 1 of the calendar month containing `now`.
 * Exported so handlers needing the same window for separate aggregation
 * stay aligned.
 */
export function startOfMonthUtc(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
