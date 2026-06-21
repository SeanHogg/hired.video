/**
 * Visual SSoT for the daily-streak flame. As a streak climbs it passes
 * through escalating heat tiers — cold grey → orange → red → amber →
 * blue-hot → legendary violet — so the flame "changes colour on its way"
 * (product ask 2026-06-21). Tier breakpoints mirror the backend
 * `STREAK_MILESTONES` (7 / 14 / 30 / 60 / 90) so the colour the user sees
 * lines up with the milestone badge they earn at that rung.
 *
 * Pure module — no React, no I/O — so the [StreakFlame](../../components/points/StreakFlame.tsx)
 * component and any future surface (sidebar pill, dashboard gauge) share
 * one mapping instead of re-deriving thresholds.
 */

export interface StreakTier {
  /** Inclusive lower bound (days) for this tier. */
  min: number;
  /** i18n key for the tier label — reuses the existing
   *  `labels.rewards.streak*` catalog so the streak card, the /rewards
   *  table, and the milestone badge all read the same localized name. */
  labelKey: string;
  /** Slug of the repeatable streak badge earned at this rung; null for
   *  the warm-up tiers below the first milestone. */
  badgeSlug: string | null;
  /** Tailwind text-colour class for the flame glyph. */
  color: string;
  /** Gradient stops for the halo behind the flame (bg-gradient-to-br). */
  halo: string;
  /** rgba used for the flicker drop-shadow + the throb CSS var. */
  glowRgb: string;
}

/** Ordered ascending by `min`. `resolveStreakTier` walks this to find the
 *  highest tier a streak has reached. */
export const STREAK_TIERS: readonly StreakTier[] = [
  {
    min: 0,
    labelKey: "labels.rewards.streakGettingStarted",
    badgeSlug: null,
    color: "text-muted-foreground",
    halo: "from-muted to-muted",
    glowRgb: "rgba(148,163,184,0)",
  },
  {
    min: 1,
    labelKey: "labels.rewards.streakWarmingUp",
    badgeSlug: null,
    color: "text-orange-400",
    halo: "from-orange-200 to-orange-400",
    glowRgb: "rgba(251,146,60,0.55)",
  },
  {
    min: 7,
    labelKey: "labels.rewards.streakOnFire",
    badgeSlug: "on_fire",
    color: "text-orange-500",
    halo: "from-orange-400 to-red-500",
    glowRgb: "rgba(249,115,22,0.6)",
  },
  {
    min: 14,
    labelKey: "labels.rewards.streakFortnightForce",
    badgeSlug: "streak_14",
    color: "text-amber-500",
    halo: "from-amber-400 to-orange-600",
    glowRgb: "rgba(245,158,11,0.6)",
  },
  {
    min: 30,
    labelKey: "labels.rewards.streak30",
    badgeSlug: "streak_30",
    color: "text-red-500",
    halo: "from-red-500 to-rose-600",
    glowRgb: "rgba(239,68,68,0.6)",
  },
  {
    min: 60,
    labelKey: "labels.rewards.streakUnstoppable",
    badgeSlug: "streak_60",
    color: "text-sky-500",
    halo: "from-sky-400 to-blue-600",
    glowRgb: "rgba(56,189,248,0.65)",
  },
  {
    min: 90,
    labelKey: "labels.rewards.streakLegendary",
    badgeSlug: "streak_90",
    color: "text-fuchsia-500",
    halo: "from-fuchsia-500 to-purple-700",
    glowRgb: "rgba(217,70,239,0.65)",
  },
] as const;

/** Highest tier the given streak length has reached. */
export function resolveStreakTier(days: number): StreakTier {
  let tier = STREAK_TIERS[0];
  for (const t of STREAK_TIERS) {
    if (days >= t.min) tier = t;
    else break;
  }
  return tier;
}

/** Next milestone rung above the current streak, with days remaining.
 *  Returns null once the user is past the final (90-day) rung. `labelKey`
 *  is an i18n key the caller resolves with `t()`. */
export function nextStreakMilestone(
  days: number,
): { day: number; labelKey: string; remaining: number } | null {
  for (const t of STREAK_TIERS) {
    if (t.badgeSlug && t.min > days) {
      return { day: t.min, labelKey: t.labelKey, remaining: t.min - days };
    }
  }
  return null;
}
