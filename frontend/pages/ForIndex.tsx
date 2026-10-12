/**
 * /for index — overview of every life-stage Resource Map. Lands here
 * from the footer "All resource maps →" link AND when the compact
 * footer's audience CTA fires.
 *
 * Single source of truth for layout: LIFE_STAGE_AUDIENCE_REGISTRY drives
 * the entire grid. New audiences land here with zero changes to the
 * page.
 */
import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import MarketingFAQ from "@/components/MarketingFAQ";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { SeoHero } from "@/components/landing/SeoHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { LinkTile } from "@/components/landing/LinkTile";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import {
  LIFE_STAGE_AUDIENCE_REGISTRY,
  type LifeStageAudienceMeta,
} from "@shared/audiences-registry";
import { audienceSlug } from "@shared/audiences";
import { audienceLabel, audienceThesis } from "@/components/landing/localize-audience";

const ROLE_KEYS: LifeStageAudienceMeta["key"][] = ["job_seekers", "employers", "recruiters"];
const FAQ_IDS = ["which", "free", "switch"] as const;

export default function ForIndex(): JSX.Element {
  const location = useLocation();
  const { t } = useTranslation();
  useDefaultBreadcrumbs();
  useSEO(location.pathname, {
    title: t("seoLanding.forIndex.seoTitle"),
    description: t("seoLanding.forIndex.seoDescription"),
    ogTitle: t("seoLanding.forIndex.ogTitle"),
    ogDescription: t("seoLanding.forIndex.ogDescription"),
  });

  const roles = LIFE_STAGE_AUDIENCE_REGISTRY.filter((a) => ROLE_KEYS.includes(a.key));
  const situations = LIFE_STAGE_AUDIENCE_REGISTRY.filter((a) => !ROLE_KEYS.includes(a.key));

  const faqItems = useMemo(
    () => FAQ_IDS.map((id) => ({ question: t(`seoLanding.forIndex.faq.${id}.q`), answer: t(`seoLanding.forIndex.faq.${id}.a`) })),
    [t],
  );

  return (
    <AppShell bgClassName="bg-background">
      <SeoHero
        eyebrow={t("resourceMaps.title")}
        title={t("seoLanding.forIndex.title")}
        lede={t("seoLanding.forIndex.lede")}
        secondary={{ to: "/templates", label: t("seoLanding.common.browseTemplates") }}
      />

      <MarketingBand tone="card" labelledBy="for-roles-title" className="flex flex-col gap-10">
        <MarketingSectionIntro id="for-roles-title" title={t("seoLanding.forIndex.byRole")} />
        <AudienceGrid audiences={roles} />
      </MarketingBand>

      <MarketingBand id="situations" labelledBy="for-situations-title" className="flex flex-col gap-10">
        <MarketingSectionIntro
          id="for-situations-title"
          title={t("seoLanding.forIndex.bySituation")}
          subtitle={t("audiences.related.subhead")}
        />
        <AudienceGrid audiences={situations} />
      </MarketingBand>

      <MarketingFAQ
        variant="plain"
        defaultOpenIndex={0}
        schemaId="for-index"
        items={faqItems}
        className="mx-auto max-w-[820px] px-6 pb-24"
      />

      <SeoFinalCta id="for-index" title={t("landing.final.title")} />
    </AppShell>
  );
}

function AudienceGrid({ audiences }: { audiences: LifeStageAudienceMeta[] }): JSX.Element {
  const { t } = useTranslation();
  return (
    <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-5">
      {audiences.map((meta) => (
        <li key={meta.key}>
          <LinkTile
            to={`/for/${audienceSlug(meta.key)}`}
            title={audienceLabel(t, meta)}
            body={audienceThesis(t, meta)}
            footer={
              <>
                {t("audiences.forIndex.openMap")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            }
          />
        </li>
      ))}
    </ul>
  );
}
