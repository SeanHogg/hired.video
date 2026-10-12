// "How you earn points" — job-seeker rules from the public catalog, grouped
// into Job hunt / Get seen / Learn (+ "Everything else" for unmapped keys).
// Filtering + grouping is the pure lib/rewards/earning-rules module.

import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { groupJobSeekerRules, type EarnGroup } from "@/lib/rewards/earning-rules";
import type { PointsCatalogAction } from "@/lib/services/points-service";

const GROUP_LABEL_KEY: Record<EarnGroup, string> = {
  jobHunt: "rewards.earn.group.jobHunt",
  getSeen: "rewards.earn.group.getSeen",
  learn: "rewards.earn.group.learn",
  other: "rewards.earn.group.other",
};

interface Props {
  actions: PointsCatalogAction[] | undefined;
  loading: boolean;
}

export default function EarnRulesSection({ actions, loading }: Props) {
  const { t, i18n } = useTranslation();
  const groups = actions ? groupJobSeekerRules(actions) : [];
  const fmt = (n: number) => n.toLocaleString(i18n.language);

  return (
    <MarketingBand tone="card" id="earn" labelledBy="rewards-earn-heading" className="flex flex-col gap-8">
      <MarketingSectionIntro
        id="rewards-earn-heading"
        title={t("headings.rewards.howYouEarn")}
        subtitle={t("rewards.earn.subtitle")}
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("rewards.earn.empty")}</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(330px,100%),1fr))] items-start gap-5">
          {groups.map(({ group, rules }) => (
            <div key={group} className="flex flex-col gap-1.5 rounded-[20px] border border-border p-6">
              <h3 className="mb-2 font-display text-[22px] font-bold tracking-[-0.02em] text-foreground">
                {t(GROUP_LABEL_KEY[group])}
              </h3>
              <dl className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3.5 gap-y-2.5 text-[15px]">
                {rules.map((r) => (
                  <div key={r.key} className="contents">
                    <dt className="text-foreground">{r.label}</dt>
                    <dd className="font-mono font-bold text-brand-green-text">+{fmt(r.points)}</dd>
                    <dd className="font-mono text-xs text-muted-foreground">
                      {r.dailyCapPoints
                        ? t("rewards.earn.capShort", { amount: fmt(r.dailyCapPoints) })
                        : "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </MarketingBand>
  );
}
