/**
 * Backwards-compatibility barrel for the tier-enforcement middleware.
 *
 * The original 270-line file was split into three SRP-clean modules.
 * Existing imports (`from ".../tierEnforcement.js"`) still resolve via
 * this barrel; new code should import from the focused modules:
 *
 *   - middleware/auth-gates.ts        — requirePro, requireVideoAnalytics
 *   - middleware/token-budget.ts      — checkTokenBudget, attachTokenBudget,
 *                                        requireTokenBudget, checkAIUsage
 *   - middleware/free-tier-limits.ts  — checkTeamSize,
 *                                        checkInterviewSessionsThisMonth,
 *                                        startOfMonthUtc
 */

export { requirePro, requireVideoAnalytics } from "./auth-gates.js";
export {
  checkTokenBudget,
  checkAIUsage,
  attachTokenBudget,
  requireTokenBudget,
} from "./token-budget.js";
export {
  checkTeamSize,
  checkInterviewSessionsThisMonth,
  startOfMonthUtc,
} from "./free-tier-limits.js";
