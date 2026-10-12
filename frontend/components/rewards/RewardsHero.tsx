// /rewards hero — pitch on the left, the navy "ink" balance card on the
// right. Signed-in points-eligible visitors see their REAL balance, streak
// and latest earnings (shared ["points","me"] cache); everyone else sees a
// card labelled "Example balance".

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Flame } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { isPointsEligible } from "@/lib/services/points-service";
import { usePointsSummary } from "@/hooks/use-points-summary";
import { goalPercent, type BalanceGoal } from "@/lib/rewards/balance-goal";
import { HERO_CTA_PRIMARY } from "@/components/marketing/MarketingHero";

/** Illustrative card for signed-out visitors (labelled "Example balance"). */
const EXAMPLE = {
  balance: 2340,
  streak: 12,
  rows: [
    { key: "apply", labelKey: "rewards.balance.sample.apply", delta: 50 },
    { key: "tailor", labelKey: "rewards.balance.sample.tailor", delta: 20 },
    { key: "showUp", labelKey: "rewards.balance.sample.showUp", delta: 5 },
  ],
} as const;

interface BalanceRow {
  key: string;
  label: string;
  delta: number;
}

export default function RewardsHero({ goal }: { goal: BalanceGoal | null }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const eligible = Boolean(user) && isPointsEligible(user);
  const summary = usePointsSummary(eligible);

  const card =
    eligible && summary.data ? (
      <BalanceCard
        example={false}
        balance={summary.data.balance}
        streak={summary.data.streak.current}
        goal={goal}
        rows={summary.data.recentActivity
          .filter((a) => a.delta > 0)
          .slice(0, 3)
          .map((a) => ({ key: a.id, label: a.label, delta: a.delta }))}
      />
    ) : eligible && summary.isLoading ? (
      <div className="h-80 animate-pulse rounded-3xl bg-ink" aria-hidden="true" />
    ) : (
      <BalanceCard
        example
        balance={EXAMPLE.balance}
        streak={EXAMPLE.streak}
        goal={goal}
        rows={EXAMPLE.rows.map((r) => ({ key: r.key, label: t(r.labelKey), delta: r.delta }))}
      />
    );

  return (
    <section className="mx-auto grid w-full max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] items-center gap-12 px-6 pb-20 pt-12">
      <div className="flex flex-col gap-[22px]">
        <span className="self-start rounded-full bg-accent px-2.5 py-1.5 font-mono text-xs uppercase tracking-[0.08em] text-accent-foreground">
          {t("labels.rewards.badge")}
        </span>
        <h1 className="font-display text-[clamp(42px,5.6vw,72px)] font-bold leading-[0.98] tracking-[-0.035em] text-foreground">
          {t("headings.rewards.heroTitle")}
        </h1>
        <p className="max-w-[32em] text-lg leading-relaxed text-muted-foreground">
          {t("rewards.hero.subtitle")}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {eligible ? (
            <>
              <Link to="/points" className={HERO_CTA_PRIMARY}>
                {t("actions.rewards.seeMyPoints")}
              </Link>
              <Link to="/settings?tab=points" className="text-base font-semibold text-primary hover:underline">
                {t("actions.rewards.cashOut")}
              </Link>
            </>
          ) : (
            <>
              <Link to={NEW_KIT_PATH} className={HERO_CTA_PRIMARY}>
                {t("rewards.hero.startEarning")}
              </Link>
              <a href="#earn" className="text-base font-semibold text-primary hover:underline">
                {t("rewards.hero.howYouEarn")}
              </a>
            </>
          )}
        </div>
      </div>
      {card}
    </section>
  );
}

function BalanceCard({
  example,
  balance,
  streak,
  goal,
  rows,
}: {
  example: boolean;
  balance: number;
  streak: number;
  goal: BalanceGoal | null;
  rows: BalanceRow[];
}) {
  const { t, i18n } = useTranslation();
  const fmt = (n: number) => n.toLocaleString(i18n.language);

  return (
    <div className="flex flex-col gap-5 rounded-3xl bg-ink p-7 text-ink-foreground shadow-[0_30px_60px_-30px_rgba(15,23,42,0.6)]">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
          {t(example ? "rewards.balance.exampleLabel" : "rewards.balance.title")}
        </span>
        {streak > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-raised px-2.5 py-1 text-[13px] font-semibold text-ink-positive">
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            {t("rewards.balance.streak", { count: streak })}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2.5">
        <span className="font-display text-[64px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">
          {fmt(balance)}
        </span>
        <span className="text-lg text-ink-muted">{t("rewards.balance.unit")}</span>
      </div>

      {goal && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between gap-3 text-sm">
            <span>{t("rewards.balance.next", { label: goal.label })}</span>
            <span className="shrink-0 font-mono text-ink-muted">
              {fmt(Math.min(balance, goal.cost))} / {fmt(goal.cost)}
            </span>
          </div>
          <div
            className="h-2 rounded bg-ink-raised"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(goalPercent(balance, goal.cost))}
            aria-label={t("rewards.balance.next", { label: goal.label })}
          >
            <div className="h-2 rounded bg-ink-accent" style={{ width: `${goalPercent(balance, goal.cost)}%` }} />
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col gap-2.5 border-t border-ink-raised pt-4 text-sm">
          {rows.map((r) => (
            <li key={r.key} className="flex justify-between gap-2.5">
              <span>{r.label}</span>
              <span className="font-mono text-ink-positive">+{fmt(r.delta)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
