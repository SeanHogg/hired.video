/**
 * Animated streak flame — a flickering flame in a heat-tiered halo whose
 * colour climbs grey → orange → red → amber → blue-hot → violet as the
 * streak grows (product ask 2026-06-21: "the icon changes different
 * colours on its way"). The day count overlays the halo so the flame IS
 * the streak readout.
 *
 * Reusable + self-contained: tier colour + glow come from the shared
 * [resolveStreakTier](../../lib/points/streak-tier.ts) SSoT, so the
 * sidebar pill, the points KPI, and any future surface render an
 * identical flame from just `days`. Renders nothing for a zero streak in
 * `glyphOnly` mode (no flame to show yet) so callers can mount it
 * unconditionally.
 */

import { Flame } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { resolveStreakTier } from "@/lib/points/streak-tier";

export interface StreakFlameProps {
  days: number;
  size?: "sm" | "md" | "lg";
  /** Render only the flame glyph (no day-count overlay). */
  glyphOnly?: boolean;
  className?: string;
}

const SIZE: Record<NonNullable<StreakFlameProps["size"]>, { box: string; icon: string; count: string }> = {
  sm: { box: "h-9 w-9", icon: "h-4 w-4", count: "text-[10px]" },
  md: { box: "h-14 w-14", icon: "h-7 w-7", count: "text-xs" },
  lg: { box: "h-20 w-20", icon: "h-10 w-10", count: "text-sm" },
};

export function StreakFlame({ days, size = "md", glyphOnly = false, className }: StreakFlameProps) {
  const { t } = useTranslation();
  const tier = resolveStreakTier(days);
  const sz = SIZE[size];
  const active = days > 0;

  if (glyphOnly && !active) return null;

  const label = `${days}-day ${t("labels.rewards.streakLabel")} — ${t(tier.labelKey)}`;

  return (
    <div
      className={cn(
        "relative rounded-full bg-gradient-to-br flex items-center justify-center shrink-0",
        sz.box,
        tier.halo,
        active && "animate-badge-throb",
        !active && "opacity-70",
        className,
      )}
      // CSS var feeds the shared badge-throb keyframe so the glow colour
      // tracks the current heat tier instead of a hard-coded amber.
      style={active ? ({ "--badge-glow": tier.glowRgb } as React.CSSProperties) : undefined}
      aria-label={label}
      title={label}
    >
      <Flame
        className={cn(
          sz.icon,
          "text-white drop-shadow",
          active && "animate-flame-flicker",
        )}
      />
      {!glyphOnly && (
        <span
          className={cn(
            "absolute -bottom-1 -right-1 rounded-full bg-background border border-border px-1.5 font-bold tabular-nums shadow-sm",
            sz.count,
          )}
        >
          {days}
        </span>
      )}
    </div>
  );
}
