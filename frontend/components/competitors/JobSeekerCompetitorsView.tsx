// Job-seeker /vs-competitors body (HIRING_PERSONAS_ENABLED off): a short,
// honest "how hired.video differs" page — no vendor tables, no claims we
// can't back. Hero → three differentiators → FAQ → build CTA.

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Bot, Gift, Workflow } from "lucide-react";
import MarketingFAQ from "@/components/MarketingFAQ";
import { MarketingHero, HERO_CTA_PRIMARY, HERO_CTA_LINK } from "@/components/marketing/MarketingHero";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import IconCard from "@/components/marketing/IconCard";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { useProMonthlyPriceLabel } from "@/hooks/use-pro-price-label";

export default function JobSeekerCompetitorsView() {
  const { t } = useTranslation();
  const price = useProMonthlyPriceLabel();

  const cards = [
    { key: "oneFlow", icon: Workflow },
    { key: "free", icon: Gift },
    { key: "agent", icon: Bot },
  ];

  const faq = [
    { question: t("competitors.js.faq.what.q"), answer: t("competitors.js.faq.what.a") },
    { question: t("competitors.js.faq.free.q"), answer: t("competitors.js.faq.free.a") },
    { question: t("competitors.js.faq.pro.q"), answer: t("competitors.js.faq.pro.a", { price }) },
    { question: t("competitors.js.faq.upload.q"), answer: t("competitors.js.faq.upload.a") },
  ];

  return (
    <>
      <MarketingHero
        eyebrow={t("competitorsPage.eyebrow")}
        title={t("competitors.js.title")}
        subtitle={t("competitors.js.subtitle")}
        actions={
          <>
            <Link to={NEW_KIT_PATH} className={HERO_CTA_PRIMARY}>
              {t("landing.cta.buildMyResume")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link to="/pricing" className={HERO_CTA_LINK}>
              {t("competitorsPage.seePricing")}
            </Link>
          </>
        }
      />

      <MarketingBand tone="card" labelledBy="vs-js-diff-heading" className="flex flex-col gap-8">
        <MarketingSectionIntro
          id="vs-js-diff-heading"
          title={t("competitors.js.diff.title")}
          subtitle={t("competitors.js.diff.subtitle")}
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-5">
          {cards.map(({ key, icon }) => (
            <IconCard
              key={key}
              icon={icon}
              title={t(`competitors.js.diff.${key}.title`)}
              body={t(`competitors.js.diff.${key}.body`, { price })}
            />
          ))}
        </div>
      </MarketingBand>

      {/* MarketingFAQ ships the schema.org FAQPage JSON-LD. */}
      <MarketingFAQ
        variant="plain"
        className="mx-auto max-w-[820px] px-6 py-20"
        schemaId="competitors"
        subheading={t("competitors.js.faqSubheading")}
        items={faq}
      />

      <SeoFinalCta id="vs-js-final-cta" title={t("competitors.js.cta.title")} body={t("competitors.js.cta.body")} />
    </>
  );
}
