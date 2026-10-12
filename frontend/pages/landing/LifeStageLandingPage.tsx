/**
 * Life-stage variant of /for/[audience] — composes the Resource Map
 * stack for one of the 14 LIFE_STAGE_AUDIENCES (#1629). Renders ONLY
 * when the slug resolves to a life-stage taxonomy; profession audiences
 * stay on the existing AudienceLandingPage path.
 *
 * Every section reads from the audience registry — adding a new
 * audience requires touching shared/audiences-registry.ts only.
 */
import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import { AudienceHero } from "@/components/landing/AudienceHero";
import { audienceLabel } from "@/components/landing/localize-audience";
import { ResourceMap } from "@/components/landing/ResourceMap";
import { ToolShowcase } from "@/components/landing/ToolShowcase";
import { RelatedAudiences } from "@/components/landing/RelatedAudiences";
import { AudienceHiringCTA } from "@/components/landing/AudienceHiringCTA";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import MarketingFAQ from "@/components/MarketingFAQ";
import { useProMonthlyPriceLabel } from "@/hooks/use-pro-price-label";
import { audienceSlug } from "@shared/audiences";
import { startIntentForAudience } from "@/lib/studio/create-intent";
import { AudienceUploadStep, useIntentCta } from "@/components/landing/AudienceUploadStep";
import type { LifeStageAudienceMeta } from "@shared/audiences-registry";

export interface LifeStageLandingPageProps {
  meta: LifeStageAudienceMeta;
}

export function LifeStageLandingPage({ meta }: LifeStageLandingPageProps): JSX.Element {
  const location = useLocation();
  const { t } = useTranslation();
  const label = audienceLabel(t, meta);
  const price = useProMonthlyPriceLabel();
  // The loop this audience starts (#2364) — its primary role's create intent.
  const intent = startIntentForAudience(meta.key);
  const startCta = useIntentCta(intent);

  useSEO(location.pathname, {
    title: t("seoLanding.lifeStage.seoTitle", { label }),
    description: meta.thesis,
    ogTitle: t("seoLanding.lifeStage.ogTitle", { label }),
    ogDescription: meta.thesis,
    // CollectionPage JSON-LD — complements the FAQPage (MarketingFAQ) +
    // BreadcrumbList (useDefaultBreadcrumbs) so search + generative engines
    // get a clear entity for this audience page.
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${label} · hired.video`,
      description: meta.thesis,
      url: `https://hired.video/for/${audienceSlug(meta.key)}`,
      isPartOf: { "@type": "WebSite", name: "hired.video", url: "https://hired.video" },
      about: { "@type": "Thing", name: label },
    },
  });
  useDefaultBreadcrumbs();

  // Memoised so MarketingFAQ's JSON-LD effect doesn't re-run every render.
  const faqItems = useMemo(
    () => [
      {
        question: t("audiences.faq.free.question", { label: label.toLowerCase() }),
        answer: t("audiences.faq.free.answer", { price }),
      },
      {
        question: t("audiences.faq.tagged.question"),
        answer: t("audiences.faq.tagged.answer", { label }),
      },
      {
        question: t("audiences.faq.switch.question"),
        answer: t("audiences.faq.switch.answer"),
      },
    ],
    [t, label, price],
  );

  return (
    <AppShell bgClassName="bg-background">
      <AudienceHero meta={meta} />
      <ToolShowcase
        features={meta.focusFeatures}
        eyebrow={t("audiences.toolShowcase.eyebrow", {
          defaultValue: "Built for {{label}}",
          label: label.toLowerCase(),
        })}
      />
      <ResourceMap filter={{ audienceKey: meta.key }} kinds={meta.focusContentKinds} tone="page" />

      <AudienceHiringCTA />

      <MarketingFAQ
        variant="plain"
        defaultOpenIndex={0}
        schemaId={`for-${meta.key}-faq`}
        items={faqItems}
        className="mx-auto max-w-[820px] px-6 py-20"
      />

      <RelatedAudiences current={meta.key} tone="card" />

      {/* The page ends in this audience's upload step (#2364). */}
      <AudienceUploadStep id={`for-${meta.key}`} intent={intent} tone="page" />

      <SeoFinalCta
        id={`for-${meta.key}`}
        title={t("audiences.readyCta.heading")}
        body={t("audiences.readyCta.body")}
        primary={startCta}
        secondary={{ to: "/pricing", label: t("audiences.readyCta.pricing") }}
      />
    </AppShell>
  );
}
