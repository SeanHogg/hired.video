// /chrome-extension lens section: three cards (job seeker, recruiter, sales &
// social), one per lens of the single extension. Each card jumps to its
// feature band further down the page.

import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import MonoChip from "@/components/templates/MonoChip";
import type { ExtensionLens } from "./use-chrome-extension-copy";

export default function ExtensionLensCards({ lenses }: { lenses: ExtensionLens[] }) {
  const { t } = useTranslation();
  return (
    <MarketingBand tone="card" id="lenses" labelledBy="chrome-lenses-heading" className="flex flex-col gap-8">
      <MarketingSectionIntro
        id="chrome-lenses-heading"
        title={t("chromeExtension.one.lensesTitle")}
        subtitle={t("chromeExtension.one.lensesBody")}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-5">
        {lenses.map((lens) => {
          const Icon = lens.icon;
          return (
            <a
              key={lens.id}
              href={`#${lens.id}`}
              className="group flex flex-col gap-4 rounded-[20px] border border-border bg-background p-6 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center justify-between gap-3">
                <MonoChip>{lens.chip}</MonoChip>
                <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
              <h3 className="font-display text-[24px] font-bold leading-tight tracking-[-0.02em] text-foreground">
                {lens.title}
              </h3>
              <p className="flex-1 text-base leading-relaxed text-muted-foreground">{lens.body}</p>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                {t("chromeExtension.one.lensSee")}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </a>
          );
        })}
      </div>
    </MarketingBand>
  );
}
