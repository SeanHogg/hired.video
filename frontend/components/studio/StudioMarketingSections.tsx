// StudioMarketingSections — the below-the-workspace marketing band shown to
// signed-out visitors at /studio (stats · features · how-it-works · the
// "what you can make" kind grid · format extras · FAQ · final CTA). Lifted
// verbatim from the legacy `StudioLayout` `Landing()` so signed-out crawlers
// still get the marketing copy + the `schemaId="studio"` FAQ structured data
// after the page was unified onto the StudioLanding workspace. Pairs with
// `StudioMarketingHeader` (the hero, rendered ABOVE the workspace); this
// renders BELOW it. StudioLanding mounts both only when `!user`.
//
// Reuses the existing `studioLayout.*` i18n keys — no new strings. The single
// SoT for the kind grid is `listShippableKindPitches()`, so a new mediaKind
// lights up here automatically.
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import MarketingFAQ from "@/components/MarketingFAQ";
import { listShippableKindPitches, kindStarterHref } from "@/lib/studio/kind-marketing";
import { cn } from "@/lib/utils";

export default function StudioMarketingSections() {
  const { t } = useTranslation();
  return (
    <>
      <div className="mt-12">
        {/* Stats — architecturally-true facts about the studio. The format
            count derives from `listShippableKindPitches()` so it ticks up
            automatically when a new mediaKind ships. */}
        <div className="mb-16 grid grid-cols-1 gap-6 md:grid-cols-4">
          {[
            { id: "formats", stat: `${listShippableKindPitches().length}+`, label: t("labels.studioLayout.statFormats") },
            { id: "scaffold", stat: "60s", label: t("labels.studioLayout.statScaffold") },
            { id: "render", stat: "100%", label: t("labels.studioLayout.statRender") },
            { id: "free", stat: t("labels.studioLayout.statFreeValue"), label: t("labels.studioLayout.statFree") },
          ].map((s) => (
            <div key={s.id} className="text-center">
              <div className="mb-2 text-3xl font-bold text-primary">{s.stat}</div>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Features — kind-neutral; pitches the studio's shared capabilities. */}
        <div className="mb-16">
          <h2 className="mb-12 text-center text-3xl font-bold">
            {t("headings.studioLayout.standOut")}
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <Card className="border-brand-purple/20 transition-colors hover:border-brand-purple/40">
              <CardHeader>
                <Zap className="mb-4 h-10 w-10 text-brand-purple" />
                <CardTitle>{t("headings.studioLayout.featureScript")}</CardTitle>
                <CardDescription>{t("messages.studioLayout.featureScriptDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.studioLayout.featureScriptBullet1")}</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.studioLayout.featureScriptBullet2")}</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.studioLayout.featureScriptBullet3")}</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-brand-blue/20 transition-colors hover:border-brand-blue/40">
              <CardHeader>
                <BarChart3 className="mb-4 h-10 w-10 text-brand-blue" />
                <CardTitle>{t("headings.studioLayout.featureCanvas")}</CardTitle>
                <CardDescription>{t("messages.studioLayout.featureCanvasDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.studioLayout.featureCanvasBullet1")}</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.studioLayout.featureCanvasBullet2")}</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.studioLayout.featureCanvasBullet3")}</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/20 transition-colors hover:border-primary/40">
              <CardHeader>
                <Share2 className="mb-4 h-10 w-10 text-primary" />
                <CardTitle>{t("headings.studioLayout.featurePublish")}</CardTitle>
                <CardDescription>{t("messages.studioLayout.featurePublishDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.studioLayout.featurePublishBullet1")}</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.studioLayout.featurePublishBullet2")}</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.studioLayout.featurePublishBullet3")}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* How it works */}
        <div className="mb-16">
          <h2 className="mb-12 text-center text-3xl font-bold">{t("headings.studioLayout.howItWorks")}</h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            {[
              { id: "paste", icon: Upload, step: t("labels.studioLayout.step1Title"), desc: t("messages.studioLayout.step1Desc") },
              { id: "write", icon: Sparkles, step: t("labels.studioLayout.step2Title"), desc: t("messages.studioLayout.step2Desc") },
              { id: "preview", icon: Eye, step: t("labels.studioLayout.step3Title"), desc: t("messages.studioLayout.step3Desc") },
              { id: "export", icon: TrendingUp, step: t("labels.studioLayout.step4Title"), desc: t("messages.studioLayout.step4Desc") },
            ].map(({ id, icon: Icon, step, desc }) => (
              <div key={id} className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-2 font-semibold">{step}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* What you can make — kind grid. Single SoT is
            `listShippableKindPitches()`; each card drops a signed-out visitor
            straight into the anon editor on a fresh draft of that kind. */}
        <div className="mb-16">
          <h2 className="mb-3 text-center text-3xl font-bold">{t("headings.studioLayout.whatYouCanMake")}</h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground">
            {t("messages.studioLayout.whatYouCanMakeDesc")}
          </p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {listShippableKindPitches().map((pitch) => (
              <Link
                key={pitch.kind}
                to={kindStarterHref(pitch.kind)}
                aria-label={t("labels.studioLayout.createKindAria", { kind: pitch.title })}
                className="group flex flex-col rounded-xl border border-border p-6 transition-all hover:border-primary/40 hover:shadow-md"
              >
                <div className={cn(
                  "mb-4 flex h-12 w-12 items-center justify-center rounded-lg",
                  pitch.accentClass,
                )}>
                  <pitch.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 font-semibold">{pitch.title}</h3>
                <p className="text-sm text-muted-foreground">{pitch.blurb}</p>
                <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-primary opacity-80 transition-opacity group-hover:opacity-100">
                  {t("actions.studioLayout.startCreating")}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Format extras */}
        <div className="mb-16">
          <h2 className="mb-12 text-center text-3xl font-bold">{t("headings.studioLayout.builtForEveryFormat")}</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-brand-purple/20 transition-colors hover:border-brand-purple/40">
              <CardHeader>
                <Users className="mb-4 h-10 w-10 text-brand-purple" />
                <CardTitle>{t("headings.studioLayout.brandKits")}</CardTitle>
                <CardDescription>{t("messages.studioLayout.brandKitsDesc")}</CardDescription>
              </CardHeader>
            </Card>
            <Card className="border-brand-blue/20 transition-colors hover:border-brand-blue/40">
              <CardHeader>
                <BarChart3 className="mb-4 h-10 w-10 text-brand-blue" />
                <CardTitle>{t("headings.studioLayout.projectAnalytics")}</CardTitle>
                <CardDescription>{t("messages.studioLayout.projectAnalyticsDesc")}</CardDescription>
              </CardHeader>
            </Card>
            <Card className="border-primary/20 transition-colors hover:border-primary/40">
              <CardHeader>
                <Play className="mb-4 h-10 w-10 text-primary" />
                <CardTitle>{t("headings.studioLayout.embedShare")}</CardTitle>
                <CardDescription>{t("messages.studioLayout.embedShareDesc")}</CardDescription>
              </CardHeader>
            </Card>
            <Card className="border-green-500/20 transition-colors hover:border-green-500/40">
              <CardHeader>
                <Share2 className="mb-4 h-10 w-10 text-green-600" />
                <CardTitle>{t("headings.studioLayout.linkedInPostAi")}</CardTitle>
                <CardDescription>{t("messages.studioLayout.linkedInPostAiDesc")}</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>

      {/* FAQ — kind-aware. The "What can I make?" answer reads from
          `listShippableKindPitches()` so it stays accurate as new runtimes
          ship. `schemaId="studio"` emits the FAQ structured data for crawlers. */}
      <MarketingFAQ
        schemaId="studio"
        subheading={t("messages.studioLayout.faqSubheading")}
        items={[
          { question: t("messages.studioLayout.faqQ1Question"), answer: t("messages.studioLayout.faqQ1Answer", { formats: listShippableKindPitches().map((p) => p.title.toLowerCase()).join(", ") }) },
          { question: t("messages.studioLayout.faqQ2Question"), answer: t("messages.studioLayout.faqQ2Answer") },
          { question: t("messages.studioLayout.faqQ3Question"), answer: t("messages.studioLayout.faqQ3Answer") },
          { question: t("messages.studioLayout.faqQ4Question"), answer: t("messages.studioLayout.faqQ4Answer") },
          { question: t("messages.studioLayout.faqQ5Question"), answer: t("messages.studioLayout.faqQ5Answer") },
          { question: t("messages.studioLayout.faqQ6Question"), answer: t("messages.studioLayout.faqQ6Answer") },
          { question: t("messages.studioLayout.faqQ7Question"), answer: t("messages.studioLayout.faqQ7Answer") },
          { question: t("messages.studioLayout.faqQ8Question"), answer: t("messages.studioLayout.faqQ8Answer") },
          { question: t("messages.studioLayout.faqQ9Question"), answer: t("messages.studioLayout.faqQ9Answer") },
        ]}
      />

      {/* Final CTA */}
      <div className="pb-4 pt-4">
        <div className="rounded-2xl bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-10 text-center">
          <h3 className="mb-4 text-3xl font-bold">{t("headings.studioLayout.finalCta")}</h3>
          <p className="mx-auto mb-8 max-w-2xl text-muted-foreground">{t("messages.studioLayout.finalCtaDesc")}</p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link to="/studio/new?contentTemplate=resume">
              <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90">
                {t("actions.getStartedFree")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/pricing">
              <Button size="lg" variant="outline">{t("actions.viewPricing")}</Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
