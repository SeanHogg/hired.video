// Streak milestone track (7 / 14 / 30 / 60 / 90 days). Signed-in users see
// their progress filled in, "Won" under reached milestones and "N days away"
// under the next one; position math is the pure lib/rewards/streak-track.

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { STREAK_MILESTONES, streakTrackPosition } from "@/lib/rewards/streak-track";

interface Props {
  /** Current streak in days, or null when the visitor isn't signed in. */
  current: number | null;
}

/** Half the 62px milestone circle: the rail fill ends at a circle's centre. */
const CIRCLE_CENTER_PX = 31;

export default function StreakTrack({ current }: Props) {
  const { t, i18n } = useTranslation();
  const pos = current == null ? null : streakTrackPosition(current);
  // streakTrackPosition places milestone i at (i+1)/n; circles here sit at the
  // LEFT of their column (i/n), so shift the fill back one step.
  const fillPct = pos ? Math.max(0, pos.percent - 100 / STREAK_MILESTONES.length) : 0;

  return (
    <MarketingBand labelledBy="rewards-streak-heading" className="flex flex-col gap-8">
      <MarketingSectionIntro
        id="rewards-streak-heading"
        title={t("headings.rewards.streaks")}
        subtitle={t("rewards.streak.subtitle")}
      />

      <div className="relative pt-1.5">
        <div className="absolute left-0 right-0 top-[34px] hidden h-1.5 rounded bg-border sm:block" aria-hidden="true">
          {pos && pos.reached > 0 && (
            <div
              className="h-1.5 rounded bg-primary"
              style={{ width: `min(100%, calc(${fillPct}% + ${CIRCLE_CENTER_PX}px))` }}
            />
          )}
        </div>
        <ol className="relative grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-4">
          {STREAK_MILESTONES.map((m, i) => {
            const reached = pos ? i < pos.reached : false;
            const isNext = pos ? i === pos.reached : false;
            return (
              <li key={m.day} className="flex flex-col items-start gap-2">
                <span
                  className={cn(
                    "flex h-[62px] w-[62px] items-center justify-center rounded-full font-display text-[22px] font-extrabold",
                    reached
                      ? "bg-primary text-primary-foreground"
                      : isNext
                        ? "bg-card text-accent-foreground shadow-[inset_0_0_0_3px_hsl(var(--primary))]"
                        : "bg-card text-foreground/80 shadow-[inset_0_0_0_2px_hsl(var(--input))]",
                  )}
                  aria-label={t("rewards.streak.dayMilestone", { count: m.day })}
                >
                  {m.day}
                </span>
                <strong className="text-foreground">{t(m.nameKey)}</strong>
                <span className="font-mono text-[13px] text-brand-green-text">
                  {t("rewards.streak.bonus", { amount: m.bonus.toLocaleString(i18n.language) })}
                </span>
                {reached && <span className="text-xs font-semibold text-primary">{t("rewards.streak.won")}</span>}
                {isNext && current != null && (
                  <span className="text-xs text-muted-foreground">
                    {t("rewards.streak.daysAway", { count: m.day - current })}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </MarketingBand>
  );
}
