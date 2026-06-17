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
      // Renamed from `first_task` → `get_it_done` in migration 0099.
      considerBadge("get_it_done", total >= 1);
      considerBadge("hundred_tasks", userCount >= 100);
      break;
    }

    // ─── Social feed ──────────────────────────────────────────────────
    case "resource.submitted": {
      considerBadge("resource_first", input.totalEarnsForAction >= 1);
      considerBadge("resources_10", input.totalEarnsForAction >= 10);
      break;
    }

    case "feed.post.created": {
      considerBadge("first_post", input.totalEarnsForAction >= 1);
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

    // ─── Learning loop ────────────────────────────────────────────────
    case "lesson.completed": {
      considerBadge("first_lesson_passed", input.totalEarnsForAction >= 1);
      break;
    }
    case "course.passed": {
      considerBadge("first_course_passed", input.totalEarnsForAction >= 1);
      considerBadge("courses_completed_5", input.totalEarnsForAction >= 5);
      break;
    }
    case "certificate.earned": {
      considerBadge("first_certificate_earned", input.totalEarnsForAction >= 1);
      break;
    }
    case "learning.path.completed": {
      considerBadge("first_path_completed", input.totalEarnsForAction >= 1);
      break;
    }
    case "course.published": {
      considerBadge("instructor_first_course", input.totalEarnsForAction >= 1);
      break;
    }

    // ─── Events (gap #1966) ───────────────────────────────────────────
    case "event.created": {
      considerBadge("event_host_first", input.totalEarnsForAction >= 1);
      break;
    }
    case "event.attended":
    case "event.registered": {
      considerBadge("event_attendee_first", input.totalEarnsForAction >= 1);
      break;
    }

    // ─── Bookings / sessions (gap #1966) ──────────────────────────────
    case "booking.session.completed": {
      considerBadge("session_host_first", input.totalEarnsForAction >= 1);
      considerBadge("session_host_10", input.totalEarnsForAction >= 10);
      break;
    }
    case "booking.session.booked": {
      considerBadge("session_booked_first", input.totalEarnsForAction >= 1);
      break;
    }

    // ─── Articles (gap #1966) ─────────────────────────────────────────
    case "article.published": {
      considerBadge("first_article", input.totalEarnsForAction >= 1);
      considerBadge("articles_10", input.totalEarnsForAction >= 10);
      break;
    }

    // ─── References (gap #1966) ───────────────────────────────────────
    case "reference.given": {
      considerBadge("reference_given_first", input.totalEarnsForAction >= 1);
      break;
    }
    case "reference.received": {
      considerBadge("reference_received_first", input.totalEarnsForAction >= 1);
      break;
    }

    // ─── Company reviews (gap #1966) ──────────────────────────────────
    case "company_review.posted": {
      considerBadge("first_company_review", input.totalEarnsForAction >= 1);
      break;
    }

    // ─── Peer resume feedback (gap #1952) ─────────────────────────────
    case "feedback.review.submitted": {
      considerBadge("feedback_first", input.totalEarnsForAction >= 1);
      considerBadge("mentor", input.totalEarnsForAction >= 5);
      break;
    }

    // ─── Educator / cohort / student (gap #1966) ──────────────────────
    case "cohort.created": {
      considerBadge("educator_first_cohort", input.totalEarnsForAction >= 1);
      break;
    }
    case "cohort.student.joined": {
      considerBadge("student_enrolled", input.totalEarnsForAction >= 1);
      break;
    }
    case "cohort.assignment.completed": {
      considerBadge("first_assignment_completed", input.totalEarnsForAction >= 1);
      break;
    }

    // ─── Creative studio "create" kinds (gap #1966) ───────────────────
    // A single creator badge keyed off any of the three publish actions
    // — distinct from the play.game.challenge consumption badge path.
    case "studio.game.published":
    case "studio.comic.published":
    case "studio.podcast.published": {
      considerBadge("studio_creator_first", input.totalEarnsForAction >= 1);
      break;
    }

    default:
      // Streak badges are awarded by the streak engine via the
      // milestone path — not this evaluator.
      break;
  }

  return toUnlock;
}
