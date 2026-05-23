/**
 * Streak engine. Pure-ish state machine that takes "the user did
 * something on day X" and returns the updated streak state + any
 * milestone bonus to award.
 *
 * Day resolution is UTC-day for v1 (tracked in the Gap Register as a
 * thing to revisit once we wire user timezones into the engine — the
 * pointsStreaks row only stores a date, so a TZ swap is non-breaking).
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

/** Convenience: get today as YYYY-MM-DD in UTC. */
export function utcDay(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}
