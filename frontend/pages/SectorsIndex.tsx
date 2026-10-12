/**
 * /sectors — index of every AI-resilient sector, grouped by resilience
 * tier. Honest framing: physical/high-resilience first, mixed-resilience
 * second, AI-exposed (the tech "from" side) last.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import MarketingFAQ from "@/components/MarketingFAQ";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import MonoChip from "@/components/templates/MonoChip";
import { SeoHero } from "@/components/landing/SeoHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { LinkTile } from "@/components/landing/LinkTile";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { allSectors, type AIResilience, type SectorMeta } from "@shared/sectors";

const TIER_ORDER: AIResilience[] = ["high", "medium", "low"];
const FAQ_IDS = ["meaning", "use"] as const;

function groupByResilience(): Record<AIResilience, SectorMeta[]> {
  const groups: Record<AIResilience, SectorMeta[]> = { high: [], medium: [], low: [] };
  for (const m of allSectors()) groups[m.aiResilience].push(m);
  return groups;
}

export default function SectorsIndex() {
  const { t } = useTranslation();
  useSEO("/sectors");
  useBreadcrumbs([{ name: t("seoLanding.sectors.breadcrumb"), url: "/sectors" }]);
  const groups = groupByResilience();

  const faqItems = useMemo(
    () => FAQ_IDS.map((id) => ({ question: t(`seoLanding.sectors.faq.${id}.q`), answer: t(`seoLanding.sectors.faq.${id}.a`) })),
    [t],
  );

  return (
    <AppShell bgClassName="bg-background">
      <SeoHero
        eyebrow={t("seoLanding.sectors.breadcrumb")}
        title={t("seoLanding.sectors.title")}
        lede={t("seoLanding.sectors.lede")}
        secondary={{ to: "/pivot-explorer", label: t("seoLanding.sectors.pivotLink") }}
      />

      {TIER_ORDER.map((tier, i) => (
        <MarketingBand
          key={tier}
          tone={i % 2 === 0 ? "card" : "page"}
          labelledBy={`sectors-${tier}-title`}
          className="flex flex-col gap-8"
        >
          <MarketingSectionIntro id={`sectors-${tier}-title`} title={t(`seoLanding.sectors.tier.${tier}`)} />
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-5">
            {groups[tier].map((m) => (
              <li key={m.slug}>
                <LinkTile
                  to={`/sectors/${m.slug}`}
                  title={m.label}
                  body={m.tagline}
                  chip={m.contentOnly ? <MonoChip>{t("seoLanding.sectors.education")}</MonoChip> : undefined}
                  className={i % 2 === 0 ? "bg-background" : undefined}
                />
              </li>
            ))}
          </ul>
        </MarketingBand>
      ))}

      <MarketingFAQ
        variant="plain"
        defaultOpenIndex={0}
        schemaId="sectors-index"
        items={faqItems}
        className="mx-auto max-w-[820px] px-6 py-20"
      />

      <SeoFinalCta id="sectors-index" title={t("landing.final.title")} />
    </AppShell>
  );
}
