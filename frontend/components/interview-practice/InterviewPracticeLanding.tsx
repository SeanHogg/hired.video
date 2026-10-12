// Signed-out /interview landing: hero + product facts, features, how it
// works, closing ink CTA. Composed from the shared marketing primitives.

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, BarChart3, CheckCircle2, Mic, Sparkles, Target, TrendingUp, Video, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { HERO_CTA_PRIMARY, MarketingFinalCta } from "@/components/marketing/MarketingHero";
import { BuildCtaFooter, MantraKicker } from "@/components/marketing/persuasion/BuildCtaPersuasion";

const FACTS = [1, 2, 3, 4] as const;

const FEATURES: { n: 1 | 2 | 3; icon: LucideIcon }[] = [
  { n: 1, icon: Zap },
  { n: 2, icon: Video },
  { n: 3, icon: BarChart3 },
];

const STEPS: { icon: LucideIcon; stepKey: string; descKey: string }[] = [
  { icon: Target, stepKey: "headings.interview.step1Title", descKey: "messages.interview.step1Desc" },
  { icon: Sparkles, stepKey: "headings.interview.step2Title", descKey: "messages.interview.step2Desc" },
  { icon: Mic, stepKey: "headings.interview.step3Title", descKey: "messages.interview.step3Desc" },
  { icon: TrendingUp, stepKey: "headings.interview.step4Title", descKey: "messages.interview.step4Desc" },
];

export function InterviewPracticeLanding() {
  const { t } = useTranslation();
  return (
    <div>
      {/* Hero */}
      <MarketingBand labelledBy="interview-hero-title" className="flex flex-col gap-12 pt-14 sm:pt-20">
        <div className="flex flex-col items-start gap-6">
          <span className="rounded-full bg-accent px-2.5 py-1.5 font-mono text-xs uppercase tracking-[0.08em] text-accent-foreground">
            {t("studio.interviewPractice.heading")}
          </span>
          <h1
            id="interview-hero-title"
            className="max-w-[14em] font-display text-[clamp(42px,5.6vw,72px)] font-bold leading-[0.98] tracking-[-0.035em] text-foreground"
          >
            {t("headings.interview.landingHero")}
          </h1>
          <p className="max-w-[32em] text-lg leading-relaxed text-muted-foreground">
            {t("messages.interview.landingHeroSub")}
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button asChild size="lg">
              <Link to="/signup">
                {t("actions.interview.startPracticingFree")}
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
            <Link
              to="/login"
              className="inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline"
            >
              {t("actions.signIn")}
            </Link>
          </div>
        </div>

        {/* Product facts (what a session includes) */}
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
          {FACTS.map((n) => (
            <li key={n} className="flex flex-col gap-1.5 rounded-[20px] border border-border bg-card p-6">
              <span className="font-display text-3xl font-bold tracking-[-0.03em] text-primary">
                {t(`labels.interview.stat${n}Value`)}
              </span>
              <span className="text-sm leading-relaxed text-muted-foreground">{t(`labels.interview.stat${n}Label`)}</span>
            </li>
          ))}
        </ul>
      </MarketingBand>

      {/* Features */}
      <MarketingBand tone="card" labelledBy="interview-features-title" className="flex flex-col gap-10">
        <MarketingSectionIntro id="interview-features-title" title={t("headings.interview.featuresTitle")} />
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-5">
          {FEATURES.map(({ n, icon: Icon }) => (
            <li key={n} className="flex flex-col gap-4 rounded-[20px] border border-border bg-card p-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary" aria-hidden="true">
                <Icon className="h-6 w-6" />
              </span>
              <div className="flex flex-col gap-2">
                <h3 className="font-display text-xl font-bold tracking-[-0.02em] text-foreground">
                  {t(`headings.interview.feature${n}Title`)}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{t(`messages.interview.feature${n}Desc`)}</p>
              </div>
              <ul className="flex flex-col gap-2 text-sm text-foreground">
                {[1, 2, 3].map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-green-text" aria-hidden="true" />
                    {t(`labels.interview.feature${n}Bullet${b}`)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </MarketingBand>

      {/* How it works */}
      <MarketingBand labelledBy="interview-how-title" className="flex flex-col gap-10">
        <MarketingSectionIntro id="interview-how-title" title={t("headings.interview.howItWorks")} />
        <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-5">
          {STEPS.map(({ icon: Icon, stepKey, descKey }, i) => (
            <li key={stepKey} className="flex flex-col gap-3 rounded-[20px] border border-border bg-card p-6">
              <div className="flex items-center justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary" aria-hidden="true">
                  <Icon className="h-[22px] w-[22px]" />
                </span>
                <span className="font-mono text-xs text-muted-foreground" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="font-display text-lg font-bold tracking-[-0.015em] text-foreground">{t(stepKey)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{t(descKey)}</p>
            </li>
          ))}
        </ol>
      </MarketingBand>

      {/* Final CTA */}
      <MarketingFinalCta
        kicker={<MantraKicker />}
        footer={<BuildCtaFooter />}
        id="interview"
        title={t("headings.interview.ctaTitle")}
        actions={
          <Link to="/signup" className={HERO_CTA_PRIMARY}>
            {t("actions.interview.startPracticingFree")}
            <ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" />
          </Link>
        }
      />
    </div>
  );
}
