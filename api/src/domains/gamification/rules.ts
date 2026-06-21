/**
 * Points rules catalog. Single source of truth for "what does each
 * platform action earn?". Every action key here is a stable contract;
 * call sites reference the key, not the points value.
 *
 * Design constraints baked into this file:
 *
 *  • Role-aware. Each rule lists which roles can earn from it. The
 *    engine no-ops actions for users whose role isn't in the rule's
 *    `roles` array (memory: [[feedback_role_means_user_role]]).
 *  • System vs user-generated. `task.complete.system` always earns;
 *    `task.complete.user` is gated until the user has closed ≥ 100
 *    user-generated tasks (anti-fraud).
 *  • Daily caps. Some actions (AI tool usage, session login) cap their
 *    daily points to prevent farming.
 *  • V1 = job_seeker only. Recruiter / employer catalogs land in V2
 *    (tracked in the Gap Register).
 *
 * Adding a rule:
 *   1. Pick a dot-namespaced action key.
 *   2. Add the entry below.
 *   3. Call PointsEngine.awardForAction(actionKey, ctx) from the place
 *      the action actually happens (route handler, webhook, etc.).
 */

import { USER_ROLES, type UserRole } from "../../../../shared/user-roles.js";

/** General content/engagement actions any non-staff "earner" role can score
 *  (profile, daily session, social, reviews, events, …). Extracted because
 *  the literal triple was repeated across ~30 rules (DRY); `creator` joins it
 *  now that Creator is a first-class scoring role (#1998). Role-SPECIFIC
 *  rules (resume actions = job_seeker only, sourcing = recruiter only, etc.)
 *  keep their own narrower `roles` arrays. */
export const GENERAL_EARNING_ROLES: UserRole[] = [
  USER_ROLES.JOB_SEEKER,
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
  USER_ROLES.CREATOR,
];

/** Coarse buckets surfaced in the user-facing activity feed. */
export type PointsCategory =
  | "earn"
  | "redeem"
  | "adjust"
  | "reverse"
  | "streak_bonus"
  | "badge_bonus";

export interface PointsRule {
  /** Stable dot-namespaced key. Stored on the ledger row's `action`. */
  key: string;
  /** Human label rendered in the activity feed. */
  label: string;
  /** Roles that can earn this. Empty array = all roles. */
  roles: UserRole[];
  /** Points awarded per qualifying event (before caps). */
  points: number;
  /** Coarse family — currently always "earn" for catalog rules;
   *  redemption/adjust/reverse rows are written outside the catalog. */
  category: PointsCategory;
  /** When set, the engine awards at most this many points per UTC day. */
  dailyCapPoints?: number;
  /** When true, this rule requires the 100-completed-user-tasks gate
   *  before it pays out. Only `task.complete.user` uses this today;
   *  any future "user-content earning" action should set it as well. */
  requiresUserTaskGate?: boolean;
  /** Optional source label persisted on the ledger row; defaults to
   *  the first segment of the action key (`task`, `ai`, etc.). */
  source?: string;
}

/**
 * Action keys. Constants so call sites can `awardForAction(ACTIONS.X)`
 * instead of stringly-typed magic.
 */
export const ACTIONS = {
  // Tasks
  TASK_COMPLETE_SYSTEM: "task.complete.system",
  TASK_COMPLETE_USER: "task.complete.user",

  // Applications + active job hunting (job_seeker)
  APPLICATION_SUBMITTED: "application.submitted",
  RESUME_TAILORED: "resume.tailored",
  COVER_LETTER_GENERATED: "cover_letter.generated",

  // Engagement / sessions
  SESSION_DAILY: "session.daily",
  SAVED_SEARCH_RUN: "saved_search.run",

  // AI tools
  AI_TOOL_USED: "ai.tool.used",

  // Purchases
  PURCHASE_TOKEN_PACK: "purchase.token_pack",
  PURCHASE_SUBSCRIPTION: "purchase.subscription",
  PURCHASE_ANY: "purchase.any",

  // Recruiter
  CANDIDATE_SOURCED: "recruiter.candidate.sourced",
  CANDIDATE_SUBMITTED: "recruiter.candidate.submitted",
  CANDIDATE_PLACED: "recruiter.candidate.placed",
  BID_WON: "recruiter.bid.won",

  // Employer
  JOB_POSTED: "employer.job.posted",
  CANDIDATE_VIEWED: "employer.candidate.viewed",
  SCORECARD_COMPLETED: "employer.scorecard.completed",
  OFFER_EXTENDED: "employer.offer.extended",
  HIRE_CONFIRMED: "employer.hire.confirmed",

  // Social feed
  FEED_POST_CREATED: "feed.post.created",

  // Community contributions (location resource directory). Eligible for
  // every scoring role — anyone can surface a helpful local resource.
  RESOURCE_SUBMITTED: "resource.submitted",

  // Learning loop (courses + paths + certificates). Eligible for all
  // three scoring roles so a recruiter watching compliance training and
  // an employer completing onboarding both earn alongside job_seekers.
  LESSON_COMPLETED: "lesson.completed",
  COURSE_PASSED: "course.passed",
  CERTIFICATE_EARNED: "certificate.earned",
  LEARNING_PATH_COMPLETED: "learning.path.completed",
  COURSE_PUBLISHED: "course.published",

  // Streak milestones (written by the streak engine, not callers)
  STREAK_BONUS: "streak.bonus",

  // Badge unlock bonuses (written by the badge engine in phase 2)
  BADGE_UNLOCKED: "badge.unlocked",

  // 3D world play (gap #1635 — challenge completions earn points)
  PLAY_GAME_CHALLENGE: "play.game.challenge",

  // ── New surfaces (gap #1966) ────────────────────────────────────────

  // Events. Eligible for all scoring roles — anyone can host or attend.
  // An `EventBadge` UI component already exists to surface these.
  EVENT_CREATED: "event.created",
  EVENT_REGISTERED: "event.registered",
  EVENT_ATTENDED: "event.attended",

  // Bookings / sessions (host completes a session; guest books one).
  BOOKING_SESSION_COMPLETED: "booking.session.completed",
  BOOKING_SESSION_BOOKED: "booking.session.booked",

  // Articles (author publishes).
  ARTICLE_PUBLISHED: "article.published",

  // References (one user gives, the subject receives).
  REFERENCE_GIVEN: "reference.given",
  REFERENCE_RECEIVED: "reference.received",

  // Company reviews (a user posts a review of a company).
  COMPANY_REVIEW_POSTED: "company_review.posted",

  // Educator / cohort / student (learning cohort layer, #1886-#1890).
  COHORT_CREATED: "cohort.created",
  COHORT_STUDENT_JOINED: "cohort.student.joined",
  COHORT_ASSIGNMENT_COMPLETED: "cohort.assignment.completed",

  // Creative-studio "create" kinds — distinct from the play.game.challenge
  // *consumption* action above. Publishing an authored game / comic /
  // podcast earns a creator badge.
  STUDIO_GAME_PUBLISHED: "studio.game.published",
  STUDIO_COMIC_PUBLISHED: "studio.comic.published",
  STUDIO_PODCAST_PUBLISHED: "studio.podcast.published",

  // Peer resume feedback (#1952). A reviewer earns for completing a review
  // (the "Mentor" community action) and earns again, separately, when a
  // suggested edit they made is accepted by the resume owner.
  FEEDBACK_REVIEW_SUBMITTED: "feedback.review.submitted",
  FEEDBACK_SUGGESTION_ACCEPTED: "feedback.suggestion.accepted",
} as const;

export type ActionKey = (typeof ACTIONS)[keyof typeof ACTIONS];

/**
 * V1 catalog. Job-seeker only — recruiter/employer rules land in V2.
 *
 * Streak rule (per user product decision 2026-05-23): the streak counter
 * advances on ANY of these qualifying actions in a day, not on a single
 * "job hunt" event. So all of these are also surfaced to the streak
 * engine as "active-day signals" via `isStreakSignal`.
 */
export const POINTS_CATALOG: Record<ActionKey, PointsRule> = {
  [ACTIONS.TASK_COMPLETE_SYSTEM]: {
    key: ACTIONS.TASK_COMPLETE_SYSTEM,
    label: "Completed an onboarding / system task",
    roles: [USER_ROLES.JOB_SEEKER],
    points: 15,
    category: "earn",
    source: "task",
  },
  [ACTIONS.TASK_COMPLETE_USER]: {
    key: ACTIONS.TASK_COMPLETE_USER,
    label: "Completed a self-created task",
    roles: [USER_ROLES.JOB_SEEKER],
    points: 5,
    category: "earn",
    dailyCapPoints: 25,
    requiresUserTaskGate: true,
    source: "task",
  },
  [ACTIONS.APPLICATION_SUBMITTED]: {
    key: ACTIONS.APPLICATION_SUBMITTED,
    label: "Submitted a job application",
    roles: [USER_ROLES.JOB_SEEKER],
    points: 50,
    category: "earn",
    dailyCapPoints: 250,
    source: "application",
  },
  [ACTIONS.RESUME_TAILORED]: {
    key: ACTIONS.RESUME_TAILORED,
    label: "Tailored a resume for a job",
    roles: [USER_ROLES.JOB_SEEKER],
    points: 20,
    category: "earn",
    dailyCapPoints: 80,
    source: "resume",
  },
  [ACTIONS.COVER_LETTER_GENERATED]: {
    key: ACTIONS.COVER_LETTER_GENERATED,
    label: "Generated a cover letter",
    roles: [USER_ROLES.JOB_SEEKER],
    points: 15,
    category: "earn",
    dailyCapPoints: 60,
    source: "resume",
  },
  [ACTIONS.SESSION_DAILY]: {
    key: ACTIONS.SESSION_DAILY,
    label: "Showed up today",
    roles: [USER_ROLES.JOB_SEEKER],
    points: 5,
    category: "earn",
    dailyCapPoints: 5, // hard cap — one per day
    source: "session",
  },
  [ACTIONS.SAVED_SEARCH_RUN]: {
    key: ACTIONS.SAVED_SEARCH_RUN,
    label: "Created or refreshed a saved search",
    roles: [USER_ROLES.JOB_SEEKER],
    points: 3,
    category: "earn",
    dailyCapPoints: 15,
    source: "session",
  },
  [ACTIONS.AI_TOOL_USED]: {
    key: ACTIONS.AI_TOOL_USED,
    label: "Used an AI tool",
    roles: [USER_ROLES.JOB_SEEKER],
    points: 5,
    category: "earn",
    dailyCapPoints: 50,
    source: "ai",
  },
  [ACTIONS.PURCHASE_TOKEN_PACK]: {
    key: ACTIONS.PURCHASE_TOKEN_PACK,
    label: "Purchased an AI credit pack",
    roles: [USER_ROLES.JOB_SEEKER],
    points: 100,
    category: "earn",
    source: "purchase",
  },
  [ACTIONS.PURCHASE_SUBSCRIPTION]: {
    key: ACTIONS.PURCHASE_SUBSCRIPTION,
    label: "Started a Pro subscription",
    roles: [USER_ROLES.JOB_SEEKER],
    points: 250,
    category: "earn",
    source: "purchase",
  },
  [ACTIONS.PURCHASE_ANY]: {
    key: ACTIONS.PURCHASE_ANY,
    label: "Made a purchase",
    roles: [USER_ROLES.JOB_SEEKER],
    points: 25,
    category: "earn",
    source: "purchase",
  },
  [ACTIONS.FEED_POST_CREATED]: {
    key: ACTIONS.FEED_POST_CREATED,
    label: "Posted to the social feed",
    roles: GENERAL_EARNING_ROLES,
    points: 10,
    category: "earn",
    dailyCapPoints: 30,
    source: "feed",
  },
  [ACTIONS.RESOURCE_SUBMITTED]: {
    key: ACTIONS.RESOURCE_SUBMITTED,
    label: "Submitted a community resource",
    roles: GENERAL_EARNING_ROLES,
    points: 25,
    category: "earn",
    dailyCapPoints: 100, // keep low-effort link spam from farming points
    source: "resource",
  },

  // ── Learning loop ──────────────────────────────────────────────────
  [ACTIONS.LESSON_COMPLETED]: {
    key: ACTIONS.LESSON_COMPLETED,
    label: "Completed a course lesson",
    roles: GENERAL_EARNING_ROLES,
    points: 10,
    category: "earn",
    dailyCapPoints: 80,
    source: "learning",
  },
  [ACTIONS.COURSE_PASSED]: {
    key: ACTIONS.COURSE_PASSED,
    label: "Passed a course",
    roles: GENERAL_EARNING_ROLES,
    points: 100,
    category: "earn",
    source: "learning",
  },
  [ACTIONS.CERTIFICATE_EARNED]: {
    key: ACTIONS.CERTIFICATE_EARNED,
    label: "Earned a verifiable certificate",
    roles: GENERAL_EARNING_ROLES,
    points: 50,
    category: "earn",
    source: "learning",
  },
  [ACTIONS.LEARNING_PATH_COMPLETED]: {
    key: ACTIONS.LEARNING_PATH_COMPLETED,
    label: "Completed a learning pathway",
    roles: GENERAL_EARNING_ROLES,
    points: 250,
    category: "earn",
    source: "learning",
  },
  [ACTIONS.COURSE_PUBLISHED]: {
    key: ACTIONS.COURSE_PUBLISHED,
    label: "Published a course",
    roles: GENERAL_EARNING_ROLES,
    points: 200,
    category: "earn",
    source: "learning",
  },
  [ACTIONS.STREAK_BONUS]: {
    key: ACTIONS.STREAK_BONUS,
    label: "Streak milestone reached",
    roles: [USER_ROLES.JOB_SEEKER],
    points: 0, // engine sets per-milestone value
    category: "streak_bonus",
    source: "streak",
  },
  [ACTIONS.BADGE_UNLOCKED]: {
    key: ACTIONS.BADGE_UNLOCKED,
    label: "Badge unlocked",
    roles: GENERAL_EARNING_ROLES,
    points: 0, // engine sets per-badge value
    category: "badge_bonus",
    source: "badge",
  },

  // 3D world play (gap #1635). Available to every scoring role — kids
  // earn just like job-seekers since gamification points feed the same
  // rewards catalog regardless of how they were earned. Daily cap keeps
  // farming honest (replay-the-same-world-100-times not allowed).
  [ACTIONS.PLAY_GAME_CHALLENGE]: {
    key: ACTIONS.PLAY_GAME_CHALLENGE,
    label: "Completed a 3D-world challenge",
    roles: GENERAL_EARNING_ROLES,
    points: 25,
    category: "earn",
    dailyCapPoints: 200,
    source: "game",
  },

  // ── Events (gap #1966) ──────────────────────────────────────────────
  // Hosting is the higher-effort action; attendance is the lighter one.
  // Available to every scoring role.
  [ACTIONS.EVENT_CREATED]: {
    key: ACTIONS.EVENT_CREATED,
    label: "Created an event",
    roles: GENERAL_EARNING_ROLES,
    points: 50,
    category: "earn",
    dailyCapPoints: 200,
    source: "event",
  },
  [ACTIONS.EVENT_REGISTERED]: {
    key: ACTIONS.EVENT_REGISTERED,
    label: "Registered for an event",
    roles: GENERAL_EARNING_ROLES,
    points: 10,
    category: "earn",
    dailyCapPoints: 50,
    source: "event",
  },
  [ACTIONS.EVENT_ATTENDED]: {
    key: ACTIONS.EVENT_ATTENDED,
    label: "Attended an event",
    roles: GENERAL_EARNING_ROLES,
    points: 25,
    category: "earn",
    dailyCapPoints: 100,
    source: "event",
  },

  // ── Bookings / sessions (gap #1966) ─────────────────────────────────
  // Completing a hosted session is the marketplace-quality signal worth
  // the larger payout; booking one is the lighter demand-side action.
  [ACTIONS.BOOKING_SESSION_COMPLETED]: {
    key: ACTIONS.BOOKING_SESSION_COMPLETED,
    label: "Completed a booked session",
    roles: GENERAL_EARNING_ROLES,
    points: 75,
    category: "earn",
    dailyCapPoints: 300,
    source: "booking",
  },
  [ACTIONS.BOOKING_SESSION_BOOKED]: {
    key: ACTIONS.BOOKING_SESSION_BOOKED,
    label: "Booked a session",
    roles: GENERAL_EARNING_ROLES,
    points: 20,
    category: "earn",
    dailyCapPoints: 100,
    source: "booking",
  },

  // ── Articles (gap #1966) ────────────────────────────────────────────
  [ACTIONS.ARTICLE_PUBLISHED]: {
    key: ACTIONS.ARTICLE_PUBLISHED,
    label: "Published an article",
    roles: GENERAL_EARNING_ROLES,
    points: 75,
    category: "earn",
    dailyCapPoints: 225,
    source: "article",
  },

  // ── References (gap #1966) ──────────────────────────────────────────
  // Giving a reference is effortful (and helps another user), so it pays
  // more than passively receiving one.
  [ACTIONS.REFERENCE_GIVEN]: {
    key: ACTIONS.REFERENCE_GIVEN,
    label: "Gave a reference",
    roles: GENERAL_EARNING_ROLES,
    points: 40,
    category: "earn",
    dailyCapPoints: 160,
    source: "reference",
  },
  [ACTIONS.REFERENCE_RECEIVED]: {
    key: ACTIONS.REFERENCE_RECEIVED,
    label: "Received a reference",
    roles: GENERAL_EARNING_ROLES,
    points: 20,
    category: "earn",
    dailyCapPoints: 100,
    source: "reference",
  },

  // ── Company reviews (gap #1966) ─────────────────────────────────────
  [ACTIONS.COMPANY_REVIEW_POSTED]: {
    key: ACTIONS.COMPANY_REVIEW_POSTED,
    label: "Posted a company review",
    roles: GENERAL_EARNING_ROLES,
    points: 25,
    category: "earn",
    dailyCapPoints: 75, // keep low-effort review spam from farming points
    source: "company_review",
  },

  // ── Educator / cohort / student (gap #1966) ─────────────────────────
  // Mirrors the learning-loop intent: creating a cohort (educator),
  // a student joining, and a student completing an assignment.
  [ACTIONS.COHORT_CREATED]: {
    key: ACTIONS.COHORT_CREATED,
    label: "Created a learning cohort",
    roles: GENERAL_EARNING_ROLES,
    points: 100,
    category: "earn",
    source: "cohort",
  },
  [ACTIONS.COHORT_STUDENT_JOINED]: {
    key: ACTIONS.COHORT_STUDENT_JOINED,
    label: "Joined a learning cohort",
    roles: GENERAL_EARNING_ROLES,
    points: 20,
    category: "earn",
    source: "cohort",
  },
  [ACTIONS.COHORT_ASSIGNMENT_COMPLETED]: {
    key: ACTIONS.COHORT_ASSIGNMENT_COMPLETED,
    label: "Completed a cohort assignment",
    roles: GENERAL_EARNING_ROLES,
    points: 50,
    category: "earn",
    dailyCapPoints: 200,
    source: "cohort",
  },

  // ── Creative studio "create" kinds (gap #1966) ──────────────────────
  // Publishing an authored game / comic / podcast. Larger payout than
  // play.game.challenge because authoring is the higher-effort act.
  [ACTIONS.STUDIO_GAME_PUBLISHED]: {
    key: ACTIONS.STUDIO_GAME_PUBLISHED,
    label: "Published a game",
    roles: GENERAL_EARNING_ROLES,
    points: 150,
    category: "earn",
    source: "studio",
  },
  [ACTIONS.STUDIO_COMIC_PUBLISHED]: {
    key: ACTIONS.STUDIO_COMIC_PUBLISHED,
    label: "Published a comic",
    roles: GENERAL_EARNING_ROLES,
    points: 150,
    category: "earn",
    source: "studio",
  },
  [ACTIONS.STUDIO_PODCAST_PUBLISHED]: {
    key: ACTIONS.STUDIO_PODCAST_PUBLISHED,
    label: "Published a podcast",
    roles: GENERAL_EARNING_ROLES,
    points: 150,
    category: "earn",
    source: "studio",
  },

  // ── Peer resume feedback (#1952) ────────────────────────────────────
  // Completing a review is the high-effort, high-signal community act
  // (feeds the "Mentor" badge); a reviewer also earns when one of their
  // suggested edits is accepted by the owner. Both capped to deter farming.
  [ACTIONS.FEEDBACK_REVIEW_SUBMITTED]: {
    key: ACTIONS.FEEDBACK_REVIEW_SUBMITTED,
    label: "Submitted resume feedback",
    roles: GENERAL_EARNING_ROLES,
    points: 40,
    category: "earn",
    dailyCapPoints: 200,
    source: "feedback",
  },
  [ACTIONS.FEEDBACK_SUGGESTION_ACCEPTED]: {
    key: ACTIONS.FEEDBACK_SUGGESTION_ACCEPTED,
    label: "A suggested edit was accepted",
    roles: GENERAL_EARNING_ROLES,
    points: 15,
    category: "earn",
    dailyCapPoints: 150,
    source: "feedback",
  },

  // ── Recruiter catalog ───────────────────────────────────────────────
  [ACTIONS.CANDIDATE_SOURCED]: {
    key: ACTIONS.CANDIDATE_SOURCED,
    label: "Sourced a candidate",
    roles: [USER_ROLES.RECRUITER],
    points: 5,
    category: "earn",
    dailyCapPoints: 100,
    source: "recruiter",
  },
  [ACTIONS.CANDIDATE_SUBMITTED]: {
    key: ACTIONS.CANDIDATE_SUBMITTED,
    label: "Submitted a candidate to a client",
    roles: [USER_ROLES.RECRUITER],
    points: 25,
    category: "earn",
    dailyCapPoints: 250,
    source: "recruiter",
  },
  [ACTIONS.CANDIDATE_PLACED]: {
    key: ACTIONS.CANDIDATE_PLACED,
    label: "Placed a candidate",
    roles: [USER_ROLES.RECRUITER],
    points: 1000,
    category: "earn",
    source: "recruiter",
  },
  [ACTIONS.BID_WON]: {
    key: ACTIONS.BID_WON,
    label: "Won a sourcing bid",
    roles: [USER_ROLES.RECRUITER],
    points: 200,
    category: "earn",
    source: "recruiter",
  },

  // ── Employer catalog ────────────────────────────────────────────────
  [ACTIONS.JOB_POSTED]: {
    key: ACTIONS.JOB_POSTED,
    label: "Posted a job",
    roles: [USER_ROLES.EMPLOYER],
    points: 100,
    category: "earn",
    source: "employer",
  },
  [ACTIONS.CANDIDATE_VIEWED]: {
    key: ACTIONS.CANDIDATE_VIEWED,
    label: "Reviewed a candidate",
    roles: [USER_ROLES.EMPLOYER],
    points: 2,
    category: "earn",
    dailyCapPoints: 40,
    source: "employer",
  },
  [ACTIONS.SCORECARD_COMPLETED]: {
    key: ACTIONS.SCORECARD_COMPLETED,
    label: "Filled out a hiring scorecard",
    roles: [USER_ROLES.EMPLOYER],
    points: 30,
    category: "earn",
    dailyCapPoints: 150,
    source: "employer",
  },
  [ACTIONS.OFFER_EXTENDED]: {
    key: ACTIONS.OFFER_EXTENDED,
    label: "Extended an offer",
    roles: [USER_ROLES.EMPLOYER],
    points: 200,
    category: "earn",
    source: "employer",
  },
  [ACTIONS.HIRE_CONFIRMED]: {
    key: ACTIONS.HIRE_CONFIRMED,
    label: "Confirmed a hire",
    roles: [USER_ROLES.EMPLOYER],
    points: 1000,
    category: "earn",
    source: "employer",
  },
};

/**
 * Actions whose occurrence advances the daily-streak counter, even if
 * the points payout was zero (e.g. capped out for the day). The streak
 * is the cheaper signal because the user demanded "active hunting" be
 * recognized, not just paid.
 */
export const STREAK_SIGNAL_ACTIONS: ReadonlySet<ActionKey> = new Set<ActionKey>([
  // job_seeker
  ACTIONS.TASK_COMPLETE_SYSTEM,
  ACTIONS.TASK_COMPLETE_USER,
  ACTIONS.APPLICATION_SUBMITTED,
  ACTIONS.RESUME_TAILORED,
  ACTIONS.COVER_LETTER_GENERATED,
  ACTIONS.SAVED_SEARCH_RUN,
  ACTIONS.AI_TOOL_USED,
  ACTIONS.SESSION_DAILY,
  ACTIONS.PURCHASE_TOKEN_PACK,
  ACTIONS.PURCHASE_SUBSCRIPTION,
  ACTIONS.PURCHASE_ANY,
  ACTIONS.FEED_POST_CREATED,
  ACTIONS.RESOURCE_SUBMITTED,
  // learning loop — daily course activity counts as an active day
  ACTIONS.LESSON_COMPLETED,
  ACTIONS.COURSE_PASSED,
  ACTIONS.CERTIFICATE_EARNED,
  ACTIONS.LEARNING_PATH_COMPLETED,
  ACTIONS.COURSE_PUBLISHED,
  // new surfaces (gap #1966) — each is an active-day signal
  ACTIONS.EVENT_CREATED,
  ACTIONS.EVENT_REGISTERED,
  ACTIONS.EVENT_ATTENDED,
  ACTIONS.BOOKING_SESSION_COMPLETED,
  ACTIONS.BOOKING_SESSION_BOOKED,
  ACTIONS.ARTICLE_PUBLISHED,
  ACTIONS.REFERENCE_GIVEN,
  ACTIONS.REFERENCE_RECEIVED,
  ACTIONS.COMPANY_REVIEW_POSTED,
  ACTIONS.COHORT_CREATED,
  ACTIONS.COHORT_STUDENT_JOINED,
  ACTIONS.COHORT_ASSIGNMENT_COMPLETED,
  ACTIONS.STUDIO_GAME_PUBLISHED,
  ACTIONS.STUDIO_COMIC_PUBLISHED,
  ACTIONS.STUDIO_PODCAST_PUBLISHED,
  // peer feedback (#1952) — giving feedback / having a suggestion accepted
  // is an active community day
  ACTIONS.FEEDBACK_REVIEW_SUBMITTED,
  ACTIONS.FEEDBACK_SUGGESTION_ACCEPTED,
  // recruiter
  ACTIONS.CANDIDATE_SOURCED,
  ACTIONS.CANDIDATE_SUBMITTED,
  ACTIONS.CANDIDATE_PLACED,
  ACTIONS.BID_WON,
  // employer
  ACTIONS.JOB_POSTED,
  ACTIONS.CANDIDATE_VIEWED,
  ACTIONS.SCORECARD_COMPLETED,
  ACTIONS.OFFER_EXTENDED,
  ACTIONS.HIRE_CONFIRMED,
]);

/**
 * Streak milestone schedule. Award once per milestone per active streak;
 * resets when the streak resets. Each milestone is tied to a REPEATABLE
 * badge (`is_repeatable=true` in the catalog) so re-achieving 7 days
 * after a break re-earns "On Fire" with a fresh timestamp.
 *
 * Rungs match product spec: 7 (On Fire), 14, 30, 60, 90.
 */
export const STREAK_MILESTONES: ReadonlyArray<{ day: number; bonus: number; badgeSlug?: string }> = [
  { day: 7, bonus: 100, badgeSlug: "on_fire" },
  { day: 14, bonus: 250, badgeSlug: "streak_14" },
  { day: 30, bonus: 500, badgeSlug: "streak_30" },
  { day: 60, bonus: 1000, badgeSlug: "streak_60" },
  { day: 90, bonus: 2500, badgeSlug: "streak_90" },
];

/** Threshold above which user-generated tasks start earning. */
export const USER_TASK_GATE_THRESHOLD = 100;

/**
 * Redemption SKUs available to users. Phase-1 ships the catalog + a
 * blocked redemption endpoint; phase-3 wires Tremendous + the actual
 * conversion logic.
 *
 * `ai_credits_*` rates derived from the token-pack cost basis
 * (≈ $3 / 1M tokens; 1000 pts ≈ $1 retail).
 */
/** #169 — `campaign_dollars` grants ad/boost spend credits into the
 *  internal campaignDollarsBalance ledger. Distinct from gift_card
 *  (cash equivalent — IRS taxable) because Campaign $ can only be spent
 *  on platform inventory. The KYC threshold logic in redemption-engine
 *  skips this kind for that reason. */
export type RedemptionKind = "ai_credits" | "premium_month" | "gift_card" | "campaign_dollars";

export interface RedemptionSku {
  id: string;
  kind: RedemptionKind;
  label: string;
  /** Points required. */
  pointsCost: number;
  /** Free-form payload describing the grant (tokens, plan slug, gift
   *  card vendor + denomination). The engine reads this on redeem. */
  grant: Record<string, unknown>;
}

export const REDEMPTION_CATALOG: RedemptionSku[] = [
  // AI credits
  { id: "ai_credits_100k", kind: "ai_credits", label: "100K AI tokens", pointsCost: 500, grant: { tokens: 100_000 } },
  { id: "ai_credits_500k", kind: "ai_credits", label: "500K AI tokens", pointsCost: 2_000, grant: { tokens: 500_000 } },
  { id: "ai_credits_2m", kind: "ai_credits", label: "2M AI tokens", pointsCost: 7_500, grant: { tokens: 2_000_000 } },

  // Pro plan time
  { id: "premium_1mo", kind: "premium_month", label: "1 free month of Pro", pointsCost: 10_000, grant: { planSlug: "pro", durationDays: 30 } },

  // Gift cards — Tremendous SKUs (wired in phase 3)
  { id: "gift_card_5", kind: "gift_card", label: "$5 gift card", pointsCost: 5_000, grant: { vendor: "tremendous", amountCents: 500 } },
  { id: "gift_card_10", kind: "gift_card", label: "$10 gift card", pointsCost: 10_000, grant: { vendor: "tremendous", amountCents: 1_000 } },
  { id: "gift_card_25", kind: "gift_card", label: "$25 gift card", pointsCost: 25_000, grant: { vendor: "tremendous", amountCents: 2_500 } },
  { id: "gift_card_50", kind: "gift_card", label: "$50 gift card", pointsCost: 50_000, grant: { vendor: "tremendous", amountCents: 5_000 } },

  // #169 — Campaign $ redemption store. Same value-per-point as gift
  // cards (1000 pts ≈ $1) so the user isn't penalised for choosing
  // platform credit over a Visa gift card.
  { id: "campaign_dollars_5", kind: "campaign_dollars", label: "$5 Campaign credit", pointsCost: 5_000, grant: { amountCents: 500 } },
  { id: "campaign_dollars_10", kind: "campaign_dollars", label: "$10 Campaign credit", pointsCost: 10_000, grant: { amountCents: 1_000 } },
  { id: "campaign_dollars_25", kind: "campaign_dollars", label: "$25 Campaign credit", pointsCost: 25_000, grant: { amountCents: 2_500 } },
  { id: "campaign_dollars_50", kind: "campaign_dollars", label: "$50 Campaign credit", pointsCost: 50_000, grant: { amountCents: 5_000 } },
];

export function getRedemptionSku(id: string): RedemptionSku | null {
  return REDEMPTION_CATALOG.find((s) => s.id === id) ?? null;
}

/**
 * Redemption kinds that are catalogued but NOT currently fulfillable.
 * Tremendous (our gift-card rail) denied our account 2026-06-21, so gift
 * cards are surfaced as "coming soon" in the catalog and hard-rejected at
 * redeem time until a replacement provider is wired (see Gap Register).
 * Single SSoT — the catalog endpoint and the redemption engine both read
 * this so the UI promise and the server guard can never drift.
 */
export const UNAVAILABLE_REDEMPTION_KINDS: ReadonlySet<RedemptionKind> = new Set<RedemptionKind>([
  "gift_card",
]);

export function isRedemptionKindAvailable(kind: RedemptionKind): boolean {
  return !UNAVAILABLE_REDEMPTION_KINDS.has(kind);
}

export function getRule(action: string): PointsRule | null {
  return (POINTS_CATALOG as Record<string, PointsRule>)[action] ?? null;
}
