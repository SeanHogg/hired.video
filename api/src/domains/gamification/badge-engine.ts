/**
 * Badge engine. Listens for award outcomes coming out of `PointsEngine`
 * and unlocks any badge the user just qualified for. Idempotent — the
 * underlying `points_repo.awardBadge` is `ON CONFLICT DO NOTHING`, and
 * the points-engine's `onBadgeUnlock` hook is the one path that writes
 * the `badge_bonus` ledger row, so re-running for an already-earned
 * badge is a no-op.
 *
 * Rules are intentionally pure — given a snapshot of "what just
 * happened" + counters, return the list of badge slugs to unlock. No
 * I/O. Wiring lives in `GamificationService` which invokes
 * `evaluateBadges()` after each successful award and feeds the result
 * through `PointsEngine.opts.onBadgeUnlock` so the existing badge-row +
 * `badge_bonus` ledger flow handles the actual write.
 */

import type { PointsCountersRow } from "../../repositories/pointsRepository.js";

export interface BadgeEvaluationInput {
  /** The action that just earned (post-engine, so role + caps + gate
   *  have already filtered). */
  action: string;
  /** Delta that was awarded; zero when the action was capped/gated
   *  (still a signal that the user *did* the action). */
  delta: number;
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
  const toUnlock: string[] = [];
  const earned = input.alreadyEarnedSlugs;

  const considerBadge = (slug: string, condition: boolean) => {
    if (condition && !earned.has(slug)) toUnlock.push(slug);
  };

  switch (input.action) {
    // ─── Tasks ────────────────────────────────────────────────────────
    case "task.complete.system":
    case "task.complete.user": {
      const systemCount = input.counters?.systemTaskCompletions ?? 0;
      const userCount = input.counters?.userTaskCompletions ?? 0;
      const total = systemCount + userCount;
      considerBadge("first_task", total >= 1);
      considerBadge("hundred_tasks", userCount >= 100);
      break;
    }

    // ─── Applications ─────────────────────────────────────────────────
    case "application.submitted": {
      considerBadge("first_application", input.totalEarnsForAction >= 1);
      considerBadge("applications_10", input.totalEarnsForAction >= 10);
      considerBadge("applications_50", input.totalEarnsForAction >= 50);
      break;
    }

    // ─── AI tools ─────────────────────────────────────────────────────
    case "ai.tool.used":
    case "resume.tailored":
    case "cover_letter.generated": {
      considerBadge("ai_tool_first", input.totalEarnsForAction >= 1);
      break;
    }

    // ─── Purchases ────────────────────────────────────────────────────
    case "purchase.token_pack":
    case "purchase.subscription":
    case "purchase.any": {
      considerBadge("purchase_first", input.totalEarnsForAction >= 1);
      break;
    }

    default:
      // Streak badges are awarded by the streak engine via the
      // milestone path — not this evaluator.
      break;
  }

  return toUnlock;
}
