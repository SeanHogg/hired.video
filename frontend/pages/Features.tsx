import { useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import MarketingFAQ from "@/components/MarketingFAQ";
import {
  MarketingHero,
  MarketingFinalCta,
  HERO_CTA_PRIMARY,
  HERO_CTA_LINK,
  INK_CTA_LINK,
} from "@/components/marketing/MarketingHero";
import FeaturePillarSection from "@/components/features/FeaturePillarSection";
import { PILLARS } from "@/components/features/feature-pillars";
import { FeatureExpansionIntro } from "@/components/features/FeatureExpansionIntro";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { HIRING_PERSONAS_ENABLED } from "@shared/user-roles";
import { BuildCtaFooter, MantraKicker } from "@/components/marketing/persuasion/BuildCtaPersuasion";

// Job seekers first: the core product leads, then the expansion pillars
// (learning, HR, recruiting) as where the platform is growing.
const CORE_PILLARS = PILLARS.filter((p) => p.track === "core");
const EXPANSION_PILLARS = PILLARS.filter((p) => p.track === "expansion");

// Anon adoption (#2212): start creating in the studio with no account;
// value-capture actions gate for sign-up in place.
const START_PATH = "/studio/new?contentTemplate=resume";

// Copy keys per persona switch: the job-seeker-only product (flag off) talks
// to job seekers; the hiring-persona copy comes back when the flag is on.
const COPY = HIRING_PERSONAS_ENABLED
  ? {
      seoTitle: "features.seo.title",
      seoDescription: "features.seo.description",
      eyebrow: "features.brandTagline",
      heroTitle: "features.heroTitle",
      heroSubtitle: "features.heroSubtitle",
      faqSubheading: "features.faqSubheading",
      faqQ1Answer: "faq.features.q1.a",
      faqQ3Answer: "faq.features.q3.a",
      ctaTitle: "features.ctaTitle",
      ctaSubtitle: "features.ctaSubtitle",
    }
  : {
      seoTitle: "features.js.seo.title",
      seoDescription: "features.js.seo.description",
      eyebrow: "features.js.eyebrow",
      heroTitle: "features.js.heroTitle",
      heroSubtitle: "features.js.heroSubtitle",
      faqSubheading: "features.js.faqSubheading",
      faqQ1Answer: "features.js.faq.q1.a",
      faqQ3Answer: "features.js.faq.q3.a",
      ctaTitle: "features.js.ctaTitle",
      ctaSubtitle: "features.js.ctaSubtitle",
    };

export default function Features() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname, {
    title: t(COPY.seoTitle),
    description: t(COPY.seoDescription),
  });
  useBreadcrumbs([{ name: t("features.breadcrumb"), url: "/features" }]);

  const FAQ = [
    { question: t("faq.features.q1.q"), answer: t(COPY.faqQ1Answer) },
    { question: t("faq.features.q2.q"), answer: t("faq.features.q2.a") },
    { question: t("faq.features.q3.q"), answer: t(COPY.faqQ3Answer) },
    // People Ops + recruiter questions only while the hiring personas are on.
    ...(HIRING_PERSONAS_ENABLED
      ? [
          { question: t("faq.features.q4.q"), answer: t("faq.features.q4.a") },
          { question: t("faq.features.q5.q"), answer: t("faq.features.q5.a") },
        ]
      : []),
  ];

  return (
    <AppShell bgClassName="bg-background">
      <main>
        <MarketingHero
          eyebrow={t(COPY.eyebrow)}
          title={t(COPY.heroTitle)}
          subtitle={t(COPY.heroSubtitle)}
          actions={
            <>
              <Link to={START_PATH} className={HERO_CTA_PRIMARY}>
                {t("actions.getStartedFree")}
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
              <Link to="/pricing" className={HERO_CTA_LINK}>
                {t("actions.viewPricing")}
              </Link>
            </>
          }
        />

        {CORE_PILLARS.map((pillar, i) => (
          <FeaturePillarSection key={pillar.headingKey} pillar={pillar} tone={i % 2 === 0 ? "card" : "page"} />
        ))}

        <FeatureExpansionIntro />
        {EXPANSION_PILLARS.map((pillar, i) => (
          <FeaturePillarSection key={pillar.headingKey} pillar={pillar} tone={i % 2 === 0 ? "page" : "card"} />
        ))}

        {/* MarketingFAQ ships the schema.org FAQPage JSON-LD. */}
        <MarketingFAQ
          variant="plain"
          className="mx-auto max-w-[820px] px-6 py-20"
          schemaId="features"
          subheading={t(COPY.faqSubheading)}
          items={FAQ}
        />

        <MarketingFinalCta
          kicker={<MantraKicker />}
          footer={<BuildCtaFooter />}
          title={t(COPY.ctaTitle)}
          subtitle={t(COPY.ctaSubtitle)}
          actions={
            <>
              <Link to={START_PATH} className={HERO_CTA_PRIMARY}>
                {t("actions.getStartedFree")}
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
              <Link to="/tools" className={INK_CTA_LINK}>
                {t("features.ctaSecondary")}
              </Link>
            </>
          }
        />
      </main>
    </AppShell>
  );
}
