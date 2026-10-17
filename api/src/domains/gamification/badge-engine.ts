/**
 * Badge engine. Listens for award outcomes coming out of `PointsEngine`
 * and unlocks any badge the user just qualified for. Idempotent — the
 * underlying `points_repo.awardBadge` is `ON CONFLICT DO NOTHING`, and
 * the points-engine's `onBadgeUnlock` hook is the one path that writes
 * the `badge_bonus` ledger row, so re-running for an already-earned
 * badge is a no-op.
 *
 * Rules live in `badge-rules.ts` (per-action registry) and are pure — given a snapshot of "what just
 * happened" + counters, return the list of badge slugs to unlock. No
 * I/O. Wiring lives in `GamificationService` which invokes
 * `evaluateBadges()` after each successful award and feeds the result
 * through `PointsEngine.opts.onBadgeUnlock` so the existing badge-row +
 * `badge_bonus` ledger flow handles the actual write.
 */

import type { PointsCountersRow } from "../../repositories/pointsRepository.js";
import { getBadgeRules } from "./badge-rules.js";

export interface BadgeEvaluationInput {
  /** The action that just earned (post-engine, so role + caps + gate
   *  have already filtered). */
  action: string;
  /** Snapshot of the user's counters AFTER the engine bumped them. */
  counters: PointsCountersRow | null;
  /** Lifetime-earned action count for this specific action key. The
   *  engine computes this when the caller can't easily provide it; we
   *  take it as an argument to keep the engine pure. */
  totalEarnsForAction: number;
  /** Slugs already on the user's wall — used to skip "would-award" work
   *  for badges they already hold. */
  alreadyEarnedSlugs: ReadonlySet<string>;
}

/**
 * Return the list of badge slugs the user has newly qualified for.
 * Empty when nothing changes.
 *
 * Order matters: lower-tier badges are evaluated first so the
 * `badge_bonus` ledger rows land in the same order the user crossed
 * the thresholds.
 */
export function evaluateBadges(input: BadgeEvaluationInput): string[] {
  const ctx = { counters: input.counters, totalEarnsForAction: input.totalEarnsForAction };
  return getBadgeRules(input.action)
    .filter((rule) => rule.qualifies(ctx) && !input.alreadyEarnedSlugs.has(rule.slug))
    .map((rule) => rule.slug);
}
