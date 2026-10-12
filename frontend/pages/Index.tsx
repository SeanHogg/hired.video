import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import MarketingFAQ from "@/components/MarketingFAQ";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import KitDropZone from "@/components/workspace/kit/KitDropZone";
import { RotatingHeadline } from "@/components/landing/home/RotatingHeadline";
import { JustPostedStack } from "@/components/landing/home/JustPostedStack";
import { HomeVideoWall } from "@/components/landing/home/HomeVideoWall";
import { HomeSeasonalRail } from "@/components/landing/home/HomeSeasonalRail";
import {
  LandingFormats,
  LandingSteps,
} from "@/components/landing/LandingSections";
import { LandingStakes } from "@/components/landing/LandingStakes";
import { LandingIdentity } from "@/components/landing/LandingIdentity";
import { ProofFigure } from "@/components/marketing/persuasion/ProofFigure";
import { useProMonthlyPriceLabel } from "@/hooks/use-pro-price-label";

const FAQ_IDS = ["files", "camera", "posting", "cost"] as const;

/** Job-seeker landing: the person → video → everywhere. Persuasion order:
 *  promise (hero + just posted) → proof (the video wall) → stakes (loss) →
 *  how (three steps) → formats → identity (which crowd are you?) →
 *  objections (FAQ) → urgency close. */
export default function Index() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useSEO(location.pathname);
  useDefaultBreadcrumbs();

  const proPrice = useProMonthlyPriceLabel();

  // Memoised so MarketingFAQ's JSON-LD effect doesn't re-run every render.
  const faqItems = useMemo(
    () =>
      FAQ_IDS.map((id) => ({
        question: t(`landing.faq.${id}.q`),
        answer: t(`landing.faq.${id}.a`, { price: proPrice }),
      })),
    [t, proPrice],
  );

  return (
    <AppShell bgClassName="bg-background">
      {/* Hero — person first (Home + Copy boards): rotating headline, one
          drop for photo · résumé · cover letter · job, and the videos people
          just posted. /studio/new (the public entry) opens the kit with the drop. */}
      <section className="mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] items-center gap-12 px-4 pb-16 pt-12 sm:px-6">
        <div className="flex min-w-0 flex-col gap-5">
          <p className="flex items-center gap-2.5 font-mono text-[13px] uppercase tracking-[0.08em] text-muted-foreground">
            <span className="h-2 w-2 flex-none rounded-full bg-brand-green" aria-hidden="true" />
            <span>{t("landing.hero.eyebrow")}</span>
          </p>
          <RotatingHeadline />
          <p className="max-w-[34em] text-[17px] leading-[1.55] text-muted-foreground">{t("landing.hero.subtitle")}</p>
          <KitDropZone
            heading={<span className="text-[15px] font-bold text-foreground">{t("landing.hero.dropHeading")}</span>}
            onStart={(state) => navigate(NEW_KIT_PATH, { state })}
          />
          <p className="-mt-2 text-center text-[13px] text-muted-foreground">{t("landing.hero.finePrint")}</p>
          <ProofFigure className="justify-center" />
        </div>
        <div className="min-w-0">
          <JustPostedStack />
        </div>
      </section>

      <HomeVideoWall />
      <HomeSeasonalRail />
      <LandingStakes />
      <LandingSteps proPrice={proPrice} />
      <LandingFormats />
      <LandingIdentity />

      <MarketingFAQ
        variant="plain"
        defaultOpenIndex={0}
        schemaId="landing"
        heading={t("landing.faq.heading")}
        items={faqItems}
        className="mx-auto max-w-[820px] scroll-mt-20 px-6 pb-24"
      />

      <SeoFinalCta id="landing" title={t("landing.final.title")} />
    </AppShell>
  );
}
