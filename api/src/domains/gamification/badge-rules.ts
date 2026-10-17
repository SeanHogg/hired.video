/**
 * Badge rule registry — the per-action map `evaluateBadges()` reads.
 *
 * Each action key maps to an ordered list of `{ slug, qualifies }`
 * predicates. Order matters: lower-tier badges come first so the
 * `badge_bonus` ledger rows land in the order the user crossed the
 * thresholds. Predicates are pure (no I/O).
 *
 * Adding a badge rule = one entry here; the engine never changes.
 * Streak badges are NOT here — the streak engine awards them via the
 * milestone path.
 *
 * Lives beside (not inside) `rules.ts` — that file is the points
 * catalog; this one is badge qualification only.
 */

import type { PointsCountersRow } from "../../repositories/pointsRepository.js";

export interface BadgeRuleContext {
  counters: PointsCountersRow | null;
  totalEarnsForAction: number;
}

export interface BadgeRule {
  slug: string;
  qualifies: (ctx: BadgeRuleContext) => boolean;
}

/** `totalEarnsForAction >= n` — the shape almost every rule takes. */
const earnsAtLeast = (slug: string, n: number): BadgeRule => ({
  slug,
  qualifies: (ctx) => ctx.totalEarnsForAction >= n,
});

const first = (slug: string): BadgeRule => earnsAtLeast(slug, 1);

// ─── Tasks ──────────────────────────────────────────────────────────
const TASK_RULES: BadgeRule[] = [
  // Renamed from `first_task` → `get_it_done` in migration 0099.
  {
    slug: "get_it_done",
    qualifies: (ctx) =>
      (ctx.counters?.systemTaskCompletions ?? 0) + (ctx.counters?.userTaskCompletions ?? 0) >= 1,
  },
  { slug: "hundred_tasks", qualifies: (ctx) => (ctx.counters?.userTaskCompletions ?? 0) >= 100 },
];

const AI_TOOL_RULES: BadgeRule[] = [first("ai_tool_first")];
const PURCHASE_RULES: BadgeRule[] = [first("purchase_first")];
const EVENT_ATTENDEE_RULES: BadgeRule[] = [first("event_attendee_first")];
// A single creator badge keyed off any of the three publish actions —
// distinct from the play.game.challenge consumption badge path.
const STUDIO_CREATOR_RULES: BadgeRule[] = [first("studio_creator_first")];

export const BADGE_RULES: Readonly<Record<string, readonly BadgeRule[]>> = {
  "task.complete.system": TASK_RULES,
  "task.complete.user": TASK_RULES,

  // ─── Social feed ──────────────────────────────────────────────────
  "resource.submitted": [first("resource_first"), earnsAtLeast("resources_10", 10)],
  "feed.post.created": [first("first_post")],

  // ─── Applications ─────────────────────────────────────────────────
  "application.submitted": [
    first("first_application"),
    earnsAtLeast("applications_10", 10),
    earnsAtLeast("applications_50", 50),
  ],

  // ─── AI tools ─────────────────────────────────────────────────────
  "ai.tool.used": AI_TOOL_RULES,
  "resume.tailored": AI_TOOL_RULES,
  "cover_letter.generated": AI_TOOL_RULES,

  // ─── Purchases ────────────────────────────────────────────────────
  "purchase.token_pack": PURCHASE_RULES,
  "purchase.subscription": PURCHASE_RULES,
  "purchase.any": PURCHASE_RULES,

  // ─── Learning loop ────────────────────────────────────────────────
  "lesson.completed": [first("first_lesson_passed")],
  "course.passed": [first("first_course_passed"), earnsAtLeast("courses_completed_5", 5)],
  "certificate.earned": [first("first_certificate_earned")],
  "learning.path.completed": [first("first_path_completed")],
  "course.published": [first("instructor_first_course")],

  // ─── Events (gap #1966) ───────────────────────────────────────────
  "event.created": [first("event_host_first")],
  "event.attended": EVENT_ATTENDEE_RULES,
  "event.registered": EVENT_ATTENDEE_RULES,

  // ─── Bookings / sessions (gap #1966) ──────────────────────────────
  "booking.session.completed": [first("session_host_first"), earnsAtLeast("session_host_10", 10)],
  "booking.session.booked": [first("session_booked_first")],

  // ─── Articles (gap #1966) ─────────────────────────────────────────
  "article.published": [first("first_article"), earnsAtLeast("articles_10", 10)],

  // ─── References (gap #1966) ───────────────────────────────────────
  "reference.given": [first("reference_given_first")],
  "reference.received": [first("reference_received_first")],

  // ─── Company reviews (gap #1966) ──────────────────────────────────
  "company_review.posted": [first("first_company_review")],

  // ─── Peer resume feedback (gap #1952) ─────────────────────────────
  "feedback.review.submitted": [first("feedback_first"), earnsAtLeast("mentor", 5)],

  // ─── Educator / cohort / student (gap #1966) ──────────────────────
  "cohort.created": [first("educator_first_cohort")],
  "cohort.student.joined": [first("student_enrolled")],
  "cohort.assignment.completed": [first("first_assignment_completed")],

  // ─── Creative studio "create" kinds (gap #1966) ───────────────────
  "studio.game.published": STUDIO_CREATOR_RULES,
  "studio.comic.published": STUDIO_CREATOR_RULES,
  "studio.podcast.published": STUDIO_CREATOR_RULES,
};

/** Rules for an action, or [] when the action unlocks no badges. */
export function getBadgeRules(action: string): readonly BadgeRule[] {
  return Object.prototype.hasOwnProperty.call(BADGE_RULES, action) ? BADGE_RULES[action] : [];
}
