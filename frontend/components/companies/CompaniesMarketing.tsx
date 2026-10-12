// Signed-out view of /companies: hero, figures, the People Operations pitch
// for employers, a featured-companies preview (cards rendered by the page
// from real public listings), why-us cards and the closing ink band. The page
// owns the <AppShell> around it.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Building2, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { SeoHero, HeroEyebrow } from "@/components/landing/SeoHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { FeatureCardGrid } from "@/components/app-marketing/FeatureCardGrid";
import { HIRING_PERSONAS_ENABLED } from "@shared/user-roles";

export default function CompaniesMarketing({ featured }: { featured: ReactNode }) {
  const { t } = useTranslation();


  return (
    <main>
        <SeoHero
          eyebrow={t("headings.companies.smartCompanies")}
          title={t("headings.companies.heroTitle")}
          lede={t("messages.companies.heroSubtitle")}
          primary={{ to: "/signup", label: t("actions.companies.explore") }}
        />

        {/* For employers — People Operations (CHRO) + embeddable. */}
        <MarketingBand tone="card" labelledBy="companies-peopleops-title" className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <HeroEyebrow>{t("labels.companies.forEmployers")}</HeroEyebrow>
            <MarketingSectionIntro
              id="companies-peopleops-title"
              title={t("headings.companies.peopleOpsTitle")}
              subtitle={t("messages.companies.peopleOpsBlurb")}
            />
          </div>
          <FeatureCardGrid
            items={[
              { key: "roster", icon: Users, title: t("headings.companies.rosterOrgChart"), description: t("messages.companies.rosterOrgChartDesc") },
              { key: "perf", icon: TrendingUp, title: t("headings.companies.performance1on1s"), description: t("messages.companies.performance1on1sDesc") },
              { key: "embed", icon: Building2, title: t("headings.companies.embedAnywhere"), description: t("messages.companies.embedAnywhereDesc") },
            ]}
          />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {HIRING_PERSONAS_ENABLED && (
              <Button asChild size="lg">
                <Link to="/people-operations">
                  {t("actions.companies.explorePeopleOps")}
                  <ArrowRight className="ml-1 h-[18px] w-[18px]" aria-hidden="true" />
                </Link>
              </Button>
            )}
            <Link to="/pricing" className="inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline">
              {t("actions.seePricing")}
            </Link>
          </div>
        </MarketingBand>

        <MarketingBand labelledBy="companies-featured-title" className="flex flex-col gap-10">
          <MarketingSectionIntro id="companies-featured-title" title={t("headings.companies.featured")} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-6">{featured}</div>
          <Link to="/signup" className="inline-flex min-h-[44px] items-center gap-2 self-start font-semibold text-primary hover:underline">
            {t("actions.companies.viewAll")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </MarketingBand>

        <MarketingBand tone="card" labelledBy="companies-why-title" className="flex flex-col gap-10">
          <MarketingSectionIntro id="companies-why-title" title={t("headings.companies.whyChooseUs")} />
          <FeatureCardGrid
            items={[
              { key: "profiles", icon: Building2, title: t("headings.companies.featProfiles"), description: t("messages.companies.featProfilesDesc") },
              { key: "pipeline", icon: Users, title: t("headings.companies.featTalentPipeline"), description: t("messages.companies.featTalentPipelineDesc") },
              { key: "growth", icon: TrendingUp, title: t("headings.companies.featGrowthAnalytics"), description: t("messages.companies.featGrowthAnalyticsDesc") },
            ]}
          />
        </MarketingBand>

        <SeoFinalCta
          id="companies"
          title={t("headings.companies.ctaTitle")}
          body={t("messages.companies.ctaSubtitle")}
          primary={{ to: "/signup", label: t("actions.companies.startExploring") }}
        />
    </main>
  );
}
