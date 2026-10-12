// StudioMarketingSections — the below-the-workspace marketing content shown to
// signed-out visitors at /studio (figures, features, how-it-works, the
// "what you can make" kind grid, format extras, FAQ, final CTA). Signed-out
// crawlers still get the marketing copy + the `schemaId="studio"` FAQ
// structured data. Pairs with `StudioMarketingHeader` (the hero, rendered
// ABOVE the workspace); this renders BELOW it. StudioLanding mounts both only
// when `!user`. It sits inside the page's 1200px column, so sections are
// plain blocks (not full-bleed bands) built from the shared primitives.
//
// Reuses the existing `studioLayout.*` i18n keys. The single SoT for the kind
// grid is `listShippableKindPitches()`, so a new mediaKind lights up here
// automatically.
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  BarChart3,
  Eye,
  Play,
  Share2,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MarketingFAQ from "@/components/MarketingFAQ";
import { MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { StatRow } from "@/components/app-marketing/StatRow";
import { FeatureCardGrid } from "@/components/app-marketing/FeatureCardGrid";
import { listShippableKindPitches, kindStarterHref } from "@/lib/studio/kind-marketing";
import { cn } from "@/lib/utils";
import { HIRING_PERSONAS_ENABLED } from "@shared/user-roles";

// Q9 ("Can recruiters and companies use the Studio too?") is hiring-side, so
// it only shows while the hiring personas are on.
const FAQ_COUNT = HIRING_PERSONAS_ENABLED ? 9 : 8;

/** The video pitch's blurb names recruiters + companies; job-seeker copy
 *  replaces it while the hiring personas are off. */
function kindBlurbKey(kind: string, blurbKey: string): string {
  return !HIRING_PERSONAS_ENABLED && kind === "video" ? "studioKind.video.seekerBlurb" : blurbKey;
}

export default function StudioMarketingSections() {
  const { t } = useTranslation();
  const pitches = listShippableKindPitches();

  const faqItems = Array.from({ length: FAQ_COUNT }, (_, i) => {
    const n = i + 1;
    return {
      question: t(`messages.studioLayout.faqQ${n}Question`),
      // The "What can I make?" answer reads the shippable kinds so it stays
      // accurate as new runtimes ship.
      answer:
        n === 1
          ? t("messages.studioLayout.faqQ1Answer", { formats: pitches.map((p) => t(p.titleKey).toLowerCase()).join(", ") })
          : t(`messages.studioLayout.faqQ${n}Answer`),
    };
  });

  return (
    <div className="mt-12 flex flex-col gap-20">
      {/* Figures — architecturally-true facts; the format count derives from
          `listShippableKindPitches()`. */}
      <StatRow
        stats={[
          { value: `${pitches.length}+`, label: t("labels.studioLayout.statFormats") },
          { value: "60s", label: t("labels.studioLayout.statScaffold") },
          { value: "100%", label: t("labels.studioLayout.statRender") },
          { value: t("labels.studioLayout.statFreeValue"), label: t("labels.studioLayout.statFree") },
        ]}
      />

      <section aria-labelledby="studio-standout-title" className="flex flex-col gap-10">
        <MarketingSectionIntro id="studio-standout-title" title={t("headings.studioLayout.standOut")} />
        <FeatureCardGrid
          items={(["Script", "Canvas", "Publish"] as const).map((f, i) => ({
            key: f,
            icon: [Zap, BarChart3, Share2][i],
            title: t(`headings.studioLayout.feature${f}`),
            description: t(`messages.studioLayout.feature${f}Desc`),
            bullets: [1, 2, 3].map((n) => t(`labels.studioLayout.feature${f}Bullet${n}`)),
          }))}
        />
      </section>

      <section aria-labelledby="studio-how-title" className="flex flex-col gap-10">
        <MarketingSectionIntro id="studio-how-title" title={t("headings.studioLayout.howItWorks")} />
        <FeatureCardGrid
          minCardWidth={220}
          items={[
            { key: "paste", icon: Upload, title: t("labels.studioLayout.step1Title"), description: t("messages.studioLayout.step1Desc") },
            { key: "write", icon: Sparkles, title: t("labels.studioLayout.step2Title"), description: t("messages.studioLayout.step2Desc") },
            { key: "preview", icon: Eye, title: t("labels.studioLayout.step3Title"), description: t("messages.studioLayout.step3Desc") },
            { key: "export", icon: TrendingUp, title: t("labels.studioLayout.step4Title"), description: t("messages.studioLayout.step4Desc") },
          ]}
        />
      </section>

      {/* What you can make — each card drops a signed-out visitor straight
          into the anon editor on a fresh draft of that kind. */}
      <section aria-labelledby="studio-make-title" className="flex flex-col gap-10">
        <MarketingSectionIntro
          id="studio-make-title"
          title={t("headings.studioLayout.whatYouCanMake")}
          subtitle={t("messages.studioLayout.whatYouCanMakeDesc")}
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-5">
          {pitches.map((pitch) => (
            <Link
              key={pitch.kind}
              to={kindStarterHref(pitch.kind)}
              aria-label={t("labels.studioLayout.createKindAria", { kind: t(pitch.titleKey) })}
              className="group flex flex-col gap-3 rounded-[20px] border border-border bg-card p-6 transition-colors hover:border-primary/40"
            >
              <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", pitch.accentClass)}>
                <pitch.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="font-display text-xl font-bold tracking-[-0.02em]">{t(pitch.titleKey)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{t(kindBlurbKey(pitch.kind, pitch.blurbKey))}</p>
              <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-semibold text-primary">
                {t("actions.studioLayout.startCreating")}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="studio-formats-title" className="flex flex-col gap-10">
        <MarketingSectionIntro id="studio-formats-title" title={t("headings.studioLayout.builtForEveryFormat")} />
        <FeatureCardGrid
          minCardWidth={220}
          items={[
            { key: "brand", icon: Users, title: t("headings.studioLayout.brandKits"), description: t("messages.studioLayout.brandKitsDesc") },
            { key: "analytics", icon: BarChart3, title: t("headings.studioLayout.projectAnalytics"), description: t("messages.studioLayout.projectAnalyticsDesc") },
            { key: "embed", icon: Play, title: t("headings.studioLayout.embedShare"), description: t("messages.studioLayout.embedShareDesc") },
            { key: "linkedin", icon: Share2, title: t("headings.studioLayout.linkedInPostAi"), description: t("messages.studioLayout.linkedInPostAiDesc") },
          ]}
        />
      </section>

      <MarketingFAQ
        variant="plain"
        schemaId="studio"
        subheading={t("messages.studioLayout.faqSubheading")}
        items={faqItems}
      />

      {/* Final CTA — the navy closer used across the marketing pages. */}
      <section
        aria-labelledby="studio-final-title"
        className="flex flex-wrap items-center justify-between gap-7 rounded-[24px] bg-ink px-6 py-12 text-ink-foreground sm:px-10"
      >
        <div className="flex max-w-[36em] flex-col gap-3">
          <h2
            id="studio-final-title"
            className="font-display text-[clamp(30px,3.8vw,48px)] font-bold leading-[0.98] tracking-[-0.035em]"
          >
            {t("headings.studioLayout.finalCta")}
          </h2>
          <p className="text-base leading-relaxed text-ink-muted">{t("messages.studioLayout.finalCtaDesc")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Button asChild size="lg">
            <Link to="/studio/new?contentTemplate=resume">
              {t("actions.getStartedFree")}
              <ArrowRight className="ml-1 h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
          </Button>
          <Link to="/pricing" className="inline-flex min-h-[44px] items-center font-semibold text-ink-accent hover:underline">
            {t("actions.viewPricing")}
          </Link>
        </div>
      </section>
    </div>
  );
}
