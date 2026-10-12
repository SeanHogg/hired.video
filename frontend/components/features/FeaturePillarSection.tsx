// One /features pillar as a marketing band: mono eyebrow + icon tile, section
// intro, then a grid of cards with proof bullets and (when live) a deep link.
// An optional status chip marks expansion pillars ("Coming soon").

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check } from "lucide-react";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import MonoChip from "@/components/templates/MonoChip";
import type { FeaturePillar } from "./feature-pillars";

interface Props {
  pillar: FeaturePillar;
  tone: "page" | "card";
}

export default function FeaturePillarSection({ pillar, tone }: Props) {
  const { t } = useTranslation();
  const Icon = pillar.icon;
  const headingId = `features-${pillar.eyebrowKey.split(".")[1]}-heading`;

  return (
    <MarketingBand tone={tone} labelledBy={headingId} className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary" aria-hidden="true">
            <Icon className="h-5 w-5" />
          </span>
          <MonoChip>{t(pillar.eyebrowKey)}</MonoChip>
          {pillar.statusKey && <MonoChip tone="free">{t(pillar.statusKey)}</MonoChip>}
        </div>
        <MarketingSectionIntro id={headingId} title={t(pillar.headingKey)} subtitle={t(pillar.subKey)} />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-5">
        {pillar.cards.map((card) => (
          <div key={card.titleKey} className="flex flex-col gap-3 rounded-[20px] border border-border p-6">
            <h3 className="font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-foreground">
              {t(card.titleKey)}
            </h3>
            <p className="text-[15px] leading-relaxed text-muted-foreground">{t(card.descKey)}</p>
            <ul className="flex flex-1 flex-col gap-2 text-sm text-foreground">
              {card.bulletKeys.map((bk) => (
                <li key={bk} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-green-text" aria-hidden="true" />
                  <span>{t(bk)}</span>
                </li>
              ))}
            </ul>
            {card.to && card.ctaKey && (
              <Link
                to={card.to}
                className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 self-start font-semibold text-primary hover:underline"
              >
                {t(card.ctaKey)}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        ))}
      </div>
    </MarketingBand>
  );
}
