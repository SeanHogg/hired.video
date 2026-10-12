// Divider between the job-seeker product and the expansion pillars on
// /features: names recruiting, HR and learning as where hired.video is
// growing, and frames it as a payoff for building your profile now.

import { useTranslation } from "react-i18next";
import { Sprout } from "lucide-react";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import MonoChip from "@/components/templates/MonoChip";

export function FeatureExpansionIntro() {
  const { t } = useTranslation();
  return (
    <MarketingBand tone="ink" labelledBy="features-expansion-heading" className="flex flex-col gap-4 py-16 sm:py-20">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-raised text-ink-positive" aria-hidden="true">
          <Sprout className="h-5 w-5" />
        </span>
        <MonoChip className="bg-ink-raised text-ink-accent">{t("features.expansion.eyebrow")}</MonoChip>
      </div>
      <MarketingSectionIntro id="features-expansion-heading" title={t("features.expansion.title")} />
      <p className="max-w-[44em] text-lg leading-relaxed text-ink-muted">{t("features.expansion.sub")}</p>
    </MarketingBand>
  );
}
