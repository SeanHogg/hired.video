/**
 * Backwards-compatibility barrel for the tier-enforcement middleware.
 *
 * The original 270-line file was split into focused modules:
 *
 *   - middleware/auth-gates.ts        — requirePro, requireVideoAnalytics
 *   - middleware/token-budget.ts      — checkTokenBudget, attachTokenBudget,
 *                                        requireTokenBudget, checkAIUsage
 *
 * The per-period count gates (`checkTeamSize`, `checkInterviewSessionsThisMonth`,
 * studio video quota) now route through `servicesProcessor.enforce(c, eventType)`
 * — see `domains/services-processing/services-processor.ts`. Adding a new
 * dimension is a one-row catalog edit; the gate reads from the right table
 * automatically via `EntitlementSpec.consumedSource`.
 */

export { requirePro, requireVideoAnalytics } from "./auth-gates.js";
export {
  checkTokenBudget,
  checkAIUsage,
  attachTokenBudget,
  requireTokenBudget,
} from "./token-budget.js";
export { startOfMonthUtc } from "./free-tier-limits.js";
