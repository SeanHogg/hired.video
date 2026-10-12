// Signed-out view of /dashboard: the career-dashboard pitch, composed from the
// shared marketing primitives (SeoHero, bands, FAQ, ink CTA) so it reads like
// the landing and /rewards pages. SEO + breadcrumbs are registered by the page
// (pages/Home.tsx).
//
// Hiring-side content (multi-sided hero/FAQ copy, the "whole platform" card and
// section with people-ops + recruiting, job-posting templates, recruiter tools)
// follows HIRING_PERSONAS_ENABLED: while it is off the page pitches the
// job-seeker loop — create your resume, turn it into a video, post it.

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ClipboardCheck,
  Clapperboard,
  Eye,
  FileText,
  Gamepad2,
  GraduationCap,
  Headphones,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Users,
  Video as VideoIcon,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import MarketingFAQ from "@/components/MarketingFAQ";
import { ToolCard } from "@/components/ToolCard";
import { getToolsForHome } from "@/data/tools-catalog";
import TemplateGallery from "@/components/resume-renderer/TemplateGallery";
import JobTemplateGallery from "@/components/job-renderer/JobTemplateGallery";
import MarketingSection, { type MarketingItem, type MarketingCard } from "@/components/marketing/MarketingSection";
import { MarketingBand } from "@/components/marketing/MarketingBand";
import { SeoHero } from "@/components/landing/SeoHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { Button } from "@/components/ui/button";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { HIRING_PERSONAS_ENABLED } from "@shared/user-roles";

const TEXT_LINK = "inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-primary hover:underline";

const HIRING = HIRING_PERSONAS_ENABLED;

const FEATURES = [
  { id: "dashboard", icon: VideoIcon },
  { id: "nextAction", icon: Sparkles },
  { id: "community", icon: MessageSquare },
  // #2009 — the platform's full breadth below the fold (multi-sided pitch).
  ...(HIRING ? [{ id: "platform", icon: Users } as const] : []),
] as const;

/** Job-seeker variant of a copy key while hiring personas are off. */
function seekerKey(key: string, seeker: string): string {
  return HIRING ? key : seeker;
}

const STEPS = [
  { id: "signup", icon: FileText },
  { id: "build", icon: Sparkles },
  { id: "track", icon: Eye },
  { id: "land", icon: TrendingUp },
] as const;

const STUDIO = [
  { id: "video", icon: Clapperboard },
  { id: "audio", icon: Headphones },
  { id: "interactive", icon: Gamepad2 },
] as const;

const PLATFORM = [
  { id: "learning", icon: GraduationCap },
  { id: "peopleOps", icon: Users },
  { id: "recruiting", icon: ClipboardCheck },
] as const;

const FAQ_KEYS = ["what", "free", "who", "linkedin", "camera", "ats", "private", "start"] as const;

export default function HomeMarketingPage() {
  const { t } = useTranslation();


  const featureItems: MarketingItem[] = FEATURES.map(({ id, icon }) => ({
    key: id,
    icon,
    title: t(`marketing.home.feature.${id}.title`),
    description: t(
      id === "dashboard"
        ? seekerKey("marketing.home.feature.dashboard.desc", "marketing.home.seeker.dashboardDesc")
        : `marketing.home.feature.${id}.desc`,
    ),
    bullets: [1, 2, 3].map((n) => t(`marketing.home.feature.${id}.bullet${n}`)),
  }));

  const howItWorksItems: MarketingItem[] = STEPS.map(({ id, icon }) => ({
    key: id,
    icon,
    title: t(`marketing.home.step.${id}.title`),
    description: t(`marketing.home.step.${id}.desc`),
  }));

  const studioItems: MarketingItem[] = STUDIO.map(({ id, icon }) => ({
    key: `studio-${id}`,
    icon,
    title: t(`marketing.home.studio.${id}.title`),
    description: t(`marketing.home.studio.${id}.desc`),
  }));

  const platformItems: MarketingItem[] = PLATFORM.map(({ id, icon }) => ({
    key: `platform-${id}`,
    icon,
    title: t(`marketing.home.platform.${id}.title`),
    description: t(`marketing.home.platform.${id}.desc`),
  }));

  const toolCards: MarketingCard[] = getToolsForHome().map((tool) => ({
    key: tool.id,
    node: <ToolCard tool={tool} />,
  }));

  // what / who / free describe the multi-sided platform → seeker variants.
  const SEEKER_FAQ: readonly string[] = ["what", "who", "free"];
  const faqItems = FAQ_KEYS.map((k) => {
    const base = !HIRING && SEEKER_FAQ.includes(k) ? "faq.home.seeker." : "faq.home.";
    return { question: t(`${base}${k}Q`), answer: t(`${base}${k}A`) };
  });

  return (
    <AppShell bgClassName="bg-background">
      <main>
        <SeoHero
          eyebrow={t(seekerKey("marketing.home.brandTagline", "marketing.home.seeker.eyebrow"))}
          title={t(seekerKey("marketing.home.heroTitle", "marketing.home.seeker.heroTitle"))}
          lede={t(seekerKey("marketing.home.heroSubtitle", "marketing.home.seeker.heroSubtitle"))}
          primary={{ to: NEW_KIT_PATH, label: t("actions.getStartedFree") }}
          secondary={{ to: "/login", label: t("actions.signIn") }}
        >
          <p className="text-sm text-muted-foreground">{t("marketing.home.freeForever")}</p>
        </SeoHero>

        <MarketingBand tone="card">
          <MarketingSection
            id="home-features"
            title={t("marketing.home.featuresTitle")}
            subtitle={t("marketing.home.featuresSubtitle")}
            items={featureItems}
            gridClassName={HIRING ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4" : "grid-cols-1 md:grid-cols-3"}
          />
        </MarketingBand>

        <MarketingBand>
          <MarketingSection
            id="home-how-it-works"
            title={t("marketing.home.howItWorks")}
            items={howItWorksItems}
            gridClassName="grid-cols-1 md:grid-cols-4"
          />
        </MarketingBand>

        <MarketingBand tone="card">
          <MarketingSection
            id="home-tools"
            title={t("marketing.home.toolsTitle")}
            subtitle={t("marketing.home.toolsSubtitle")}
            cards={toolCards}
            gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            footer={
              <div className="mt-8 text-center">
                <Link to="/learning" className={TEXT_LINK}>
                  {t("marketing.home.learningLibraryTeaser")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            }
          />
        </MarketingBand>

        <MarketingBand>
          <MarketingSection
            id="home-studio"
            title={t("marketing.home.studioTitle")}
            subtitle={t("marketing.home.studioSubtitle")}
            items={studioItems}
            gridClassName="grid-cols-1 md:grid-cols-3"
            footer={
              <div className="mt-8 text-center">
                <Button asChild variant="outline">
                  <Link to="/studio">
                    {t("marketing.home.studioCta")}
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            }
          />
        </MarketingBand>

        {HIRING && (
          <MarketingBand tone="card">
            <MarketingSection
              id="home-platform"
              title={t("marketing.home.platformTitle")}
              subtitle={t("marketing.home.platformSubtitle")}
              items={platformItems}
              gridClassName="grid-cols-1 md:grid-cols-3"
              footer={
                <div className="mt-8 text-center">
                  <Link to="/features" className={TEXT_LINK}>
                    {t("marketing.home.platformCta")}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              }
            />
          </MarketingBand>
        )}

        {/* Same template galleries the public homepage (/) renders; job-posting
            templates are hiring-side. */}
        <MarketingBand tone={HIRING ? "page" : "card"}>
          <TemplateGallery />
          {HIRING && <JobTemplateGallery />}
        </MarketingBand>

        <MarketingFAQ variant="plain" schemaId="home" subheading={t("marketing.home.faqSubheading")} items={faqItems} />

        <SeoFinalCta
          id="home"
          title={t("marketing.home.ctaTitle")}
          body={t("marketing.home.seeker.ctaSubtitle")}
          primary={{ to: NEW_KIT_PATH, label: t("actions.getStartedFree") }}
          secondary={{ to: "/pricing", label: t("actions.viewPricing") }}
        />
      </main>
    </AppShell>
  );
}
