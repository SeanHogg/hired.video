/**
 * The complete points + rewards surface — balance/streak/badges KPI
 * row, badge gallery, redemption catalog, activity feed.
 *
 * Self-gates eligibility via `isPointsEligible(user)` so consumers
 * mount `<PointsHub />` unconditionally; non-eligible users see the
 * "Points are coming for your role" notice. Loading states render in
 * place. Used by [/points](hired.video/frontend/pages/Points.tsx) and
 * the Points & Rewards tab on [/settings](hired.video/frontend/pages/Settings.tsx).
 *
 * Encapsulates the gift-card recipient dialog + the redemption flow so
 * the cashout UI is identical on both surfaces.
 */

import { usePointsSummary } from "@/hooks/use-points-summary";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Check, HelpCircle, Loader2, Lock, Sparkles, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  pointsService,
  isPointsEligible,
  type PointsCatalog,
  type PointsSummary,
} from "@/lib/services/points-service";
import { RedemptionGrid } from "@/components/points/PointsRedemption";
import { BadgesGallery, type BadgeGalleryItem } from "@/components/badges/BadgesGallery";
import { StreakFlame } from "@/components/points/StreakFlame";
import { resolveStreakTier, nextStreakMilestone } from "@/lib/points/streak-tier";
import { pointsCategoryLabel } from "@/lib/taxonomy/category-labels";

export interface PointsHubProps {
  /** Show the H1 + tagline. Pages set true; tab embeds set false because
   *  the surrounding page already supplies its own header. */
  showHeader?: boolean;
}

export function PointsHub({ showHeader = true }: PointsHubProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const eligible = isPointsEligible(user);

  const summary = usePointsSummary(eligible);

  const catalog = useQuery<PointsCatalog>({
    queryKey: ["points", "catalog"],
    queryFn: () => pointsService.getCatalog(),
    enabled: eligible,
  });

  if (!eligible) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary">
          <Sparkles className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="font-display text-xl font-bold tracking-[-0.02em]">{t("points.hub.ineligibleTitle")}</h2>
        <p className="max-w-md text-muted-foreground">{t("points.hub.ineligibleBody")}</p>
      </Card>
    );
  }

  if (summary.isLoading || !summary.data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const data = summary.data;

  return (
    <div className="space-y-6">
      {showHeader && (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[clamp(28px,3.4vw,40px)] font-bold leading-tight tracking-[-0.03em]">
              {t("tabs.pointsRewards")}
            </h1>
            <p className="mt-1 text-muted-foreground">{t("points.hub.tagline")}</p>
          </div>
          <Button asChild variant="ghost" className="shrink-0">
            <Link to="/rewards" className="inline-flex items-center gap-1">
              <HelpCircle className="h-4 w-4" aria-hidden="true" /> {t("points.hub.howItWorks")}
            </Link>
          </Button>
        </header>
      )}

      {data.isSuspended && (
        <Card className="border-amber-500/50 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div>
              <div className="font-semibold">{t("points.hub.pausedTitle")}</div>
              <p className="text-sm text-muted-foreground mt-1">
                {data.suspendedReason ?? t("points.hub.pausedBody")}
              </p>
            </div>
          </div>
        </Card>
      )}

      <KpiRow data={data} />
      <BadgesGallery badges={data.badges as BadgeGalleryItem[]} />
      <RedemptionGrid
        catalog={catalog.data ?? null}
        balance={data.balance}
        disabled={data.isSuspended}
      />
      <ActivityFeed activity={data.recentActivity} />
    </div>
  );
}

// ── KPI row ─────────────────────────────────────────────────────────

function KpiRow({ data }: { data: PointsSummary }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <KpiCard
        label={t("points.hub.balance")}
        value={data.balance.toLocaleString()}
        footer={t("points.hub.lifetime", {
          earned: data.lifetimeEarned.toLocaleString(),
          redeemed: data.lifetimeRedeemed.toLocaleString(),
        })}
      />
      <StreakCard streak={data.streak} />
      <KpiCard
        icon={<Trophy className="h-3.5 w-3.5" />}
        label={t("points.hub.badges")}
        value={
          <>
            {data.badges.filter((b) => b.earned).length}
            <span className="text-base font-normal text-muted-foreground">
              {" "}
              / {data.badges.length}
            </span>
          </>
        }
        footer={<UserTaskGateRow gate={data.userTaskGate} />}
      />
    </div>
  );
}

/** Single tile in the three-up KPI row. Same card shape regardless of
 *  what it's showing — caller supplies label + value + optional footer
 *  node. Extracted from PointsHub so the three tiles share one card
 *  layout instead of repeating the typography classes. */
function KpiCard({
  icon,
  label,
  value,
  footer,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-display text-3xl font-bold tabular-nums tracking-[-0.03em]">{value}</div>
      {footer != null && (
        <div className="text-xs text-muted-foreground mt-2">{footer}</div>
      )}
    </Card>
  );
}

function UserTaskGateRow({ gate }: { gate: PointsSummary["userTaskGate"] }) {
  const { t } = useTranslation();
  if (gate.unlocked) {
    return (
      <div className="mt-2 flex items-center gap-1 text-xs text-brand-green-text">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        {t("points.hub.gateUnlocked")}
      </div>
    );
  }
  const pct = Math.min(100, Math.round((gate.completed / gate.threshold) * 100));
  return (
    <div className="text-xs text-muted-foreground mt-2 space-y-1">
      <div className="flex justify-between">
        <span>{t("points.hub.gate")}</span>
        <span className="tabular-nums">
          {gate.completed}/{gate.threshold}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Streak tile — the animated, colour-progressing flame replaces the
 *  static KPI icon so the user sees how hot their streak is at a glance,
 *  with the heat-tier label + progress to the next milestone. */
function StreakCard({ streak }: { streak: PointsSummary["streak"] }) {
  const { t } = useTranslation();
  const tier = resolveStreakTier(streak.current);
  const next = nextStreakMilestone(streak.current);
  return (
    <Card className="p-5 flex items-center gap-4">
      <StreakFlame days={streak.current} size="lg" />
      <div className="min-w-0">
        <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          {t("labels.rewards.streakLabel")}
        </div>
        <div className="font-display text-3xl font-bold tabular-nums leading-tight tracking-[-0.03em]">
          {streak.current}{" "}
          <span className="text-base font-normal text-muted-foreground">
            {t("labels.rewards.days")}
          </span>
        </div>
        <div className={`text-xs font-medium ${tier.color}`}>{t(tier.labelKey)}</div>
        <div className="text-[11px] text-muted-foreground mt-1">
          {next
            ? t("messages.rewards.streakToNext", {
                count: next.remaining,
                label: t(next.labelKey),
              })
            : t("messages.rewards.streakTopTier")}
          {" · "}
          {t("labels.rewards.longest", { count: streak.longest })}
        </div>
      </div>
    </Card>
  );
}

// ── Activity ────────────────────────────────────────────────────────

function ActivityFeed({ activity }: { activity: PointsSummary["recentActivity"] }) {
  const { t } = useTranslation();
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-display text-xl font-bold tracking-[-0.02em]">{t("points.hub.activity")}</h2>
      {activity.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("points.hub.activityEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {activity.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0"
            >
              <div>
                <div className="font-medium">{a.label}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(a.at).toLocaleString()} · {pointsCategoryLabel(a.category, t)}
                </div>
              </div>
              <div
                className={`font-mono font-semibold tabular-nums ${
                  a.delta > 0
                    ? "text-brand-green-text"
                    : a.delta < 0
                      ? "text-destructive"
                      : "text-muted-foreground"
                }`}
              >
                {a.delta > 0 ? "+" : ""}
                {a.delta}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
