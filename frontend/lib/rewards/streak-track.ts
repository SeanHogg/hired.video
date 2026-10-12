// Streak milestone data + track math for the /rewards streak strip.
// Pure so the "where am I on the track" position is unit-tested.

export interface StreakMilestone {
  day: number;
  bonus: number;
  /** i18n key for the milestone badge name. */
  nameKey: string;
}

export const STREAK_MILESTONES: readonly StreakMilestone[] = [
  { day: 7, bonus: 100, nameKey: "labels.rewards.streakOnFire" },
  { day: 14, bonus: 250, nameKey: "labels.rewards.streakFortnightForce" },
  { day: 30, bonus: 500, nameKey: "labels.rewards.streak30" },
  { day: 60, bonus: 1000, nameKey: "labels.rewards.streakUnstoppable" },
  { day: 90, bonus: 2500, nameKey: "labels.rewards.streakLegendary" },
];

export interface StreakTrackPosition {
  /** 0–100, how far along the track (milestones evenly spaced). */
  percent: number;
  /** Number of milestones already reached. */
  reached: number;
  /** Next milestone, or null when the top tier is reached. */
  next: StreakMilestone | null;
}

/**
 * Position of `current` days on an evenly spaced milestone track. Milestones
 * sit at equal intervals (not proportional to day count) so 7 and 14 aren't
 * crushed against the left edge; between two milestones the position is
 * interpolated linearly. Negative / NaN input is treated as 0.
 */
export function streakTrackPosition(
  current: number,
  milestones: readonly StreakMilestone[] = STREAK_MILESTONES,
): StreakTrackPosition {
  const days = Number.isFinite(current) && current > 0 ? Math.floor(current) : 0;
  if (milestones.length === 0) return { percent: 0, reached: 0, next: null };

  const reached = milestones.filter((m) => days >= m.day).length;
  const next = milestones[reached] ?? null;
  const step = 100 / milestones.length;

  if (!next) return { percent: 100, reached, next: null };

  const prevDay = reached === 0 ? 0 : milestones[reached - 1].day;
  const within = (days - prevDay) / (next.day - prevDay);
  const percent = Math.min(100, Math.max(0, (reached + within) * step));
  return { percent, reached, next };
}
