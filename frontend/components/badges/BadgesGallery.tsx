/**
 * Reusable badge gallery. Renders a grid of cards — earned in tier
 * gradient, unearned dimmed. For repeatable badges, surfaces the earn
 * count + the latest achievement date; tooltip lists every earn.
 *
 * Mounted on both `/points` and the `/settings?tab=points` account-level
 * surface so the gallery is the single source of "what badges look like".
 */

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getGlowSnapshot,
  registerCelebrationTarget,
  subscribeGlow,
} from "@/lib/points/celebration";
import { BadgeIcon } from "./BadgeIcon";
import type { BadgeTier } from "@/lib/badges/badge-tier";

export interface BadgeGalleryItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  tier: BadgeTier;
  iconKey: string | null | undefined;
  earned: boolean;
  earnedAt: string | Date | null;
  earnCount: number;
  earnedHistory: Array<string | Date>;
  isRepeatable: boolean;
}

export interface BadgesGalleryProps {
  badges: BadgeGalleryItem[];
  /** When set, hides unearned badges. Useful in compact surfaces. */
  earnedOnly?: boolean;
  /** Optional title. Pass an empty string to skip the header (e.g. when
   *  the parent surface already labels the section). */
  title?: string;
  /** Wrap output in a `<Card>` — default true. Pass false when the
   *  caller already supplies its own card chrome. */
  card?: boolean;
}

function formatEarned(at: string | Date): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return d.toLocaleDateString();
}

export function BadgesGallery({
  badges,
  earnedOnly = false,
  title,
  card = true,
}: BadgesGalleryProps) {
  const { t } = useTranslation();
  const heading = title ?? t("badges.gallery.title");
  const visible = useMemo(
    () => (earnedOnly ? badges.filter((b) => b.earned) : badges),
    [badges, earnedOnly],
  );

  // Freshly-earned badges throb once the celebration artwork lands here.
  const glowing = useSyncExternalStore(subscribeGlow, getGlowSnapshot, getGlowSnapshot);

  // Register this gallery as the "shrink into the badges section" target
  // for CelebrationOverlay.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    return registerCelebrationTarget(() => rootRef.current?.getBoundingClientRect() ?? null);
  }, []);

  const body = (
    <div ref={rootRef}>
      {heading && (
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Trophy className="h-4 w-4" /> {heading}
          <span className="text-xs font-normal text-muted-foreground ml-auto">
            {t("badges.gallery.earnedCount", { earned: badges.filter((b) => b.earned).length, total: badges.length })}
          </span>
        </h2>
      )}
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t(earnedOnly ? "badges.gallery.emptyEarned" : "badges.gallery.emptyAll")}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {visible.map((b) => (
            <BadgeCard
              key={b.id}
              badge={b}
              glowing={glowing.has(b.id)}
            />
          ))}
        </div>
      )}
    </div>
  );

  return card ? <Card className="p-5">{body}</Card> : body;
}

function BadgeCard({
  badge,
  glowing = false,
}: {
  badge: BadgeGalleryItem;
  glowing?: boolean;
}) {
  const { t } = useTranslation();
  const shouldShowHistory = badge.isRepeatable && badge.earnCount > 1;
  // Streak / repeatable badges advertise how many times they've paid out
  // ("a 1x or 2x reward recipient") — shown on every earned repeatable
  // badge, including the first earn.
  const showMultiplier = badge.earned && badge.isRepeatable && badge.earnCount >= 1;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "p-4 rounded-xl border flex flex-col items-center gap-2 text-center cursor-default transition-shadow",
              !badge.earned
                ? "border-border bg-card opacity-60"
                : "border-primary/40 bg-primary/5",
              glowing && "animate-badge-throb border-amber-400",
            )}
            style={glowing ? ({ "--badge-glow": "rgba(251,191,36,0.6)" } as React.CSSProperties) : undefined}
          >
            <div className="relative">
              <BadgeIcon
                iconKey={badge.iconKey}
                tier={badge.tier}
                earned={badge.earned}
                size="md"
              />
              {showMultiplier && (
                <span className="absolute -top-1.5 -right-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 shadow tabular-nums">
                  ×{badge.earnCount}
                </span>
              )}
            </div>
            <div className="font-medium text-sm leading-tight text-foreground">{badge.name}</div>
            <div className="text-[11px] text-muted-foreground leading-tight">
              {badge.description}
            </div>
            {badge.earned && badge.earnedAt && (
              <div className="text-[10px] text-muted-foreground mt-1">
                {badge.isRepeatable && badge.earnCount > 0
                  ? t("badges.gallery.repeatEarned", { count: badge.earnCount, date: formatEarned(badge.earnedAt) })
                  : formatEarned(badge.earnedAt)}
              </div>
            )}
          </div>
        </TooltipTrigger>
        {(shouldShowHistory || (!badge.earned && badge.isRepeatable)) && (
          <TooltipContent side="bottom" className="max-w-xs">
            {shouldShowHistory ? (
              <div className="space-y-0.5 text-xs">
                <div className="font-medium">{t("badges.gallery.earnedTimes", { count: badge.earnCount })}</div>
                {badge.earnedHistory.slice(0, 10).map((d, i) => (
                  <div key={i} className="text-muted-foreground">
                    {formatEarned(d)}
                  </div>
                ))}
                {badge.earnedHistory.length > 10 && (
                  <div className="text-muted-foreground">
                    {t("badges.gallery.more", { count: badge.earnedHistory.length - 10 })}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                {t("badges.gallery.repeatableHint")}
              </div>
            )}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
