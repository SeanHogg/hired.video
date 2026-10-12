// /pricing long Free-vs-Pro feature comparison table (persona-aware rows).
// Rendered only while the hiring personas are enabled — the job-seeker-only
// product lists its value on the plan cards instead.

import { useTranslation } from "react-i18next";
import type { UserRole } from "@/lib/auth";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import MonoChip from "@/components/templates/MonoChip";
import PricingRowsCreate from "./PricingRowsCreate";
import PricingRowsHiring from "./PricingRowsHiring";
import PricingRowsPlatform from "./PricingRowsPlatform";

interface Props {
  persona: UserRole;
  personaLabelKey: string;
}

export default function PricingComparisonTable({ persona, personaLabelKey }: Props) {
  const { t } = useTranslation();
  const th = "p-4 font-mono text-xs font-semibold uppercase tracking-[0.06em]";

  return (
    <MarketingBand tone="card" labelledBy="pricing-compare-heading" className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <MarketingSectionIntro id="pricing-compare-heading" title={t("marketing.pricing.compareFeatures")} />
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {t("marketing.pricing.viewingFeaturesFor")}
          <MonoChip>{t(personaLabelKey)}</MonoChip>
        </p>
      </div>
      <div className="overflow-x-auto rounded-[20px] border border-border bg-background">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className={`${th} text-left text-muted-foreground`}>{t("marketing.pricing.featuresColumn")}</th>
              <th className={`${th} text-center text-muted-foreground`}>{t("labels.free")}</th>
              <th className={`${th} bg-accent text-center text-accent-foreground`}>{t("labels.proBadge")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <PricingRowsCreate persona={persona} />
            <PricingRowsHiring persona={persona} />
            <PricingRowsPlatform persona={persona} />
          </tbody>
        </table>
      </div>
    </MarketingBand>
  );
}
