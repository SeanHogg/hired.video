/**
 * Streak engine. Pure-ish state machine that takes "the user did
 * something on day X" and returns the updated streak state + any
 * milestone bonus to award.
 *
 * Day resolution honors the user's IANA timezone when provided
 * (`users.timezone`), falling back to UTC when missing — the storage
 * shape (`pointsStreaks.lastActivityDate` = `date`) is identical in
 * both modes.
 *
 * Caller is the points engine; this module never touches the DB.
 */

import { STREAK_MILESTONES } from "./rules.js";

export interface StreakInput {
  /** Current streak state (from pointsStreaks; null when the user has
   *  no row yet — first-ever activity). */
  current: {
    currentStreak: number;
    longestStreak: number;
    lastActivityDate: string | null; // YYYY-MM-DD
    lastBonusMilestone: number;
  } | null;
  /** Day on which the activity happened, in the engine's reference
   *  timezone (UTC for v1). YYYY-MM-DD. */
  activityDate: string;
}

export interface StreakOutput {
  next: {
    currentStreak: number;
    longestStreak: number;
    lastActivityDate: string;
    lastBonusMilestone: number;
    lastBonusAt?: Date;
  };
  /** When the activity crossed a milestone the engine hadn't paid out
   *  in this streak instance, this carries the milestone + bonus. */
  milestoneAwarded: { day: number; bonus: number; badgeSlug?: string } | null;
}

/**
 * Roll the streak forward.
 *
 *   • Same day as last activity → no change.
 *   • Next day exactly → +1 to streak; check milestone.
 *   • Gap > 1 day → reset to 1, clear milestone counter.
 *   • No prior streak row → start at 1.
 */
export function rollStreak(input: StreakInput): StreakOutput {
  const today = input.activityDate;

  if (!input.current || !input.current.lastActivityDate) {
    const next = {
      currentStreak: 1,
      longestStreak: 1,
      lastActivityDate: today,
      lastBonusMilestone: 0,
    };
    return { next, milestoneAwarded: null };
  }

  const last = input.current.lastActivityDate;
  if (last === today) {
    // Already counted today; no streak change but pass through as-is.
    return {
      next: {
        currentStreak: input.current.currentStreak,
        longestStreak: input.current.longestStreak,
        lastActivityDate: last,
        lastBonusMilestone: input.current.lastBonusMilestone,
      },
      milestoneAwarded: null,
    };
  }

  const dayDiff = daysBetween(last, today);
  if (dayDiff === 1) {
    const nextStreak = input.current.currentStreak + 1;
    const longest = Math.max(input.current.longestStreak, nextStreak);
    const milestone = findNewMilestone(input.current.lastBonusMilestone, nextStreak);
    return {
      next: {
        currentStreak: nextStreak,
        longestStreak: longest,
        lastActivityDate: today,
        lastBonusMilestone: milestone ? milestone.day : input.current.lastBonusMilestone,
        lastBonusAt: milestone ? new Date() : undefined,
      },
      milestoneAwarded: milestone,
    };
  }

  // Gap >= 2 days; streak resets. (Phase-1 has no "grace day" rule —
  // tracked in Gap Register; trivial to add later by widening this
  // branch to `dayDiff <= 2 ? continue : reset`.)
  return {
    next: {
      currentStreak: 1,
      longestStreak: Math.max(input.current.longestStreak, 1),
      lastActivityDate: today,
      lastBonusMilestone: 0,
    },
    milestoneAwarded: null,
  };
}

/** Highest milestone the user crosses *into* with `newStreak`, that is
 *  strictly greater than what they were already paid for. */
function findNewMilestone(
  lastPaid: number,
  newStreak: number,
): { day: number; bonus: number; badgeSlug?: string } | null {
  // STREAK_MILESTONES is ordered ascending by day.
  let candidate: { day: number; bonus: number; badgeSlug?: string } | null = null;
  for (const m of STREAK_MILESTONES) {
    if (m.day <= newStreak && m.day > lastPaid) {
      candidate = m;
    }
  }
  return candidate;
}

/** Pure date math. Inputs are YYYY-MM-DD UTC days; returns whole-day
 *  difference (today - then), never negative if `then <= today`. */
function daysBetween(thenIso: string, todayIso: string): number {
  const t1 = Date.UTC(
    Number(thenIso.slice(0, 4)),
    Number(thenIso.slice(5, 7)) - 1,
    Number(thenIso.slice(8, 10)),
  );
  const t2 = Date.UTC(
    Number(todayIso.slice(0, 4)),
    Number(todayIso.slice(5, 7)) - 1,
    Number(todayIso.slice(8, 10)),
  );
  return Math.round((t2 - t1) / 86_400_000);
}

/** Get today as YYYY-MM-DD in UTC. Use this when the user's TZ is
 *  unknown — every consumer falls back here. */
export function utcDay(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

/** Get the local-day YYYY-MM-DD in the supplied IANA timezone. When
 *  the timezone is invalid or null, falls back to UTC. */
export function localDay(timezone: string | null | undefined, at: Date = new Date()): string {
  if (!timezone) return utcDay(at);
  try {
    // Intl.DateTimeFormat is the single cross-runtime path that handles
    // DST correctly. The `en-CA` locale yields YYYY-MM-DD natively.
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(at);
    const yyyy = parts.find((p) => p.type === "year")?.value;
    const mm = parts.find((p) => p.type === "month")?.value;
    const dd = parts.find((p) => p.type === "day")?.value;
    if (yyyy && mm && dd) return `${yyyy}-${mm}-${dd}`;
  } catch {
    /* fall through */
  }
  return utcDay(at);
}
