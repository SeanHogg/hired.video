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

  // Streak milestones (written by the streak engine, not callers)
  STREAK_BONUS: "streak.bonus",

  // Badge unlock bonuses (written by the badge engine in phase 2)
  BADGE_UNLOCKED: "badge.unlocked",
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
    roles: [USER_ROLES.JOB_SEEKER, USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER],
    points: 10,
    category: "earn",
    dailyCapPoints: 30,
    source: "feed",
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
    roles: [USER_ROLES.JOB_SEEKER, USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER],
    points: 0, // engine sets per-badge value
    category: "badge_bonus",
    source: "badge",
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
export type RedemptionKind = "ai_credits" | "premium_month" | "gift_card";

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

  // Premium time
  { id: "premium_1mo", kind: "premium_month", label: "1 free month of Pro", pointsCost: 10_000, grant: { planSlug: "pro", durationDays: 30 } },

  // Gift cards — Tremendous SKUs (wired in phase 3)
  { id: "gift_card_5", kind: "gift_card", label: "$5 gift card", pointsCost: 5_000, grant: { vendor: "tremendous", amountCents: 500 } },
  { id: "gift_card_10", kind: "gift_card", label: "$10 gift card", pointsCost: 10_000, grant: { vendor: "tremendous", amountCents: 1_000 } },
  { id: "gift_card_25", kind: "gift_card", label: "$25 gift card", pointsCost: 25_000, grant: { vendor: "tremendous", amountCents: 2_500 } },
  { id: "gift_card_50", kind: "gift_card", label: "$50 gift card", pointsCost: 50_000, grant: { vendor: "tremendous", amountCents: 5_000 } },
];

export function getRedemptionSku(id: string): RedemptionSku | null {
  return REDEMPTION_CATALOG.find((s) => s.id === id) ?? null;
}

export function getRule(action: string): PointsRule | null {
  return (POINTS_CATALOG as Record<string, PointsRule>)[action] ?? null;
}
