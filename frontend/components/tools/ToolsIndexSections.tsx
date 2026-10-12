// Signed-out /tools marketing sections: hero, how-it-works band, the
// sentiment-analysis spotlight and the closing ink CTA. Presentational
// only — copy comes from i18n, the catalog grid is ToolsBrowser.

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BarChart3, Brain, FileText, GraduationCap, Heart, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HERO_CTA_PRIMARY, INK_CTA_LINK, MarketingFinalCta } from "@/components/marketing/MarketingHero";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { ToolIconTile } from "@/components/tools/ToolTitleBlock";
import { BuildCtaFooter, MantraKicker } from "@/components/marketing/persuasion/BuildCtaPersuasion";

const AI_ERA_COURSE_PATH = "/courses/e064d488-0b47-bcc7-d0c8-572f9c61cb3c/ai-era-must-have-skills";

export function ToolsIndexHero() {
  const { t } = useTranslation();
  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-6 pb-6 pt-10">
      <span className="self-start rounded-full bg-accent px-2.5 py-1.5 font-mono text-xs uppercase tracking-[0.08em] text-accent-foreground">
        {t("headings.tools.aiToolsLearning")}
      </span>
      <h1
        id="tools-hero-title"
        className="max-w-[20em] font-display text-[clamp(32px,4vw,48px)] font-bold leading-[1.05] tracking-[-0.03em] text-foreground"
      >
        {t("headings.tools.heroTitle")}
      </h1>
      <p className="max-w-[40em] text-[17px] leading-relaxed text-muted-foreground">
        {t("tools.index.heroLede")}{" "}
        <Link to="/tools/ai-resume-scorer" className="font-semibold text-primary hover:underline">
          {t("actions.tryFreeTool")}
        </Link>
      </p>
    </section>
  );
}

const STEPS = [
  { icon: FileText, titleKey: "headings.tools.step1Title", bodyKey: "messages.tools.step1Desc" },
  { icon: Brain, titleKey: "headings.tools.step2Title", bodyKey: "messages.tools.step2Desc" },
  { icon: BarChart3, titleKey: "headings.tools.step3Title", bodyKey: "messages.tools.step3Desc" },
  { icon: TrendingUp, titleKey: "headings.tools.step4Title", bodyKey: "messages.tools.step4Desc" },
] as const;

export function ToolsHowItWorks() {
  const { t } = useTranslation();
  return (
    <MarketingBand tone="card" labelledBy="tools-how" className="flex flex-col gap-10">
      <MarketingSectionIntro id="tools-how" title={t("headings.tools.howItWorks")} />
      <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(230px,100%),1fr))] gap-5">
        {STEPS.map(({ icon: Icon, titleKey, bodyKey }) => (
          <li
            key={titleKey}
            className="flex flex-col gap-3 rounded-[20px] border border-border bg-background p-6"
          >
            <ToolIconTile size="md">
              <Icon />
            </ToolIconTile>
            <h3 className="text-lg font-semibold tracking-tight">{t(titleKey)}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{t(bodyKey)}</p>
          </li>
        ))}
      </ol>
    </MarketingBand>
  );
}

export function ToolsSentimentSpotlight() {
  const { t } = useTranslation();
  return (
    <MarketingBand tone="page" labelledBy="tools-sentiment">
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-[20px] border border-border bg-card p-6 sm:p-8">
        <div className="flex min-w-0 flex-[1_1_420px] items-start gap-4">
          <ToolIconTile>
            <Heart />
          </ToolIconTile>
          <div className="flex min-w-0 flex-col gap-2">
            <h2
              id="tools-sentiment"
              className="font-display text-[clamp(26px,3vw,36px)] font-bold leading-tight tracking-[-0.03em]"
            >
              {t("headings.tools.sentimentTitle")}
            </h2>
            <p className="max-w-[36em] text-base leading-relaxed text-muted-foreground">
              {t("messages.tools.sentimentDesc")}
            </p>
          </div>
        </div>
        <Button asChild size="lg">
          <Link to="/tools/sentiment-analysis">{t("actions.trySentimentFree")}</Link>
        </Button>
      </div>
    </MarketingBand>
  );
}

export function ToolsFinalCta() {
  const { t } = useTranslation();
  return (
    <MarketingFinalCta
      kicker={<MantraKicker />}
      footer={<BuildCtaFooter />}
      id="tools"
      title={t("headings.tools.ctaTitle")}
      subtitle={t("messages.tools.ctaDesc")}
      actions={
        <>
          <Link to="/signup" className={HERO_CTA_PRIMARY}>
            {t("actions.getStartedToday")}
          </Link>
          <Link to={AI_ERA_COURSE_PATH} className={INK_CTA_LINK}>
            <GraduationCap className="h-5 w-5" aria-hidden="true" />
            {t("actions.browseAiEraCourse")}
          </Link>
        </>
      }
    />
  );
}
