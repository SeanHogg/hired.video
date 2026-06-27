/**
 * ProfessionLandingPage — the rich /for/[audience] marketing surface for
 * PROFESSION audiences (director, actor, developer, …). Composes the same
 * marketing anatomy as About (hero → benefits → how-it-works → templates →
 * geo/hiring CTA → FAQ → related → final CTA) so profession pages carry
 * real SEO + GEO weight (FAQPage + CollectionPage + BreadcrumbList JSON-LD)
 * and active-engagement CTAs instead of a bare template grid.
 *
 * All chrome copy is parameterized by the audience label, so every
 * profession audience — and any future one added to audiences.ts — gets a
 * full page with zero per-audience wiring. The audience `label`/`blurb`
 * stay the studio SSoT (English); localizing those is tracked in ROADMAP.
 */
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Eye,
  Wand2,
  Gift,
  MousePointerClick,
  FileText,
  Pencil,
  Share2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import MarketingFAQ from "@/components/MarketingFAQ";
import { MEDIA_KIND_UI, MEDIA_KINDS } from "@shared/media-kinds";
import { StudioTemplateLinkCard } from "@/components/studio/templates/StudioTemplateLinkCard";
import { StudioOpenCTA } from "@/components/studio/templates/StudioOpenCTA";
import { AudienceQuickLinks } from "@/components/studio/templates/AudienceQuickLinks";
import { AudienceHiringCTA } from "@/components/landing/AudienceHiringCTA";
import type { AudienceDef } from "@/components/studio/templates/audiences";
import { localizeAudience } from "@/lib/studio/localize-audience";
import { templatesForAudience } from "@/components/studio/templates/templates-by-audience";

export interface ProfessionLandingPageProps {
  audience: AudienceDef;
  slug: string;
  pathname: string;
}

export function ProfessionLandingPage({
  audience,
  slug,
  pathname,
}: ProfessionLandingPageProps): JSX.Element {
  const { t } = useTranslation();
  // Localized hero label + lede (#2249) — overlays per-locale copy on the
  // English audiences.ts SSoT so the headline, meta description, and JSON-LD
  // are localized for es / fr-CA, not English-only.
  const { label, blurb } = localizeAudience(audience, t);
  const labelLower = label.toLowerCase();

  useDefaultBreadcrumbs();
  useSEO(pathname, {
    title: `${label}: AI video maker + templates · hired.video`,
    description: `${blurb} Build a standout video in your browser — free to start, no editing skills, AI-scaffolded in about a minute.`,
    ogTitle: `hired.video for ${label}`,
    ogDescription: blurb,
    // CollectionPage JSON-LD — pairs with the FAQPage (MarketingFAQ) and
    // BreadcrumbList (useDefaultBreadcrumbs) so search + generative engines
    // get a clear entity for this role page.
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${label} — video templates & tools · hired.video`,
      description: blurb,
      url: `https://hired.video/for/${slug}`,
      isPartOf: { "@type": "WebSite", name: "hired.video", url: "https://hired.video" },
      about: { "@type": "Thing", name: label },
    },
  });

  const templates = templatesForAudience(audience.id);
  const kindsCovered = MEDIA_KINDS.filter((k) =>
    templates.some((tpl) => tpl.mediaKind === k),
  );

  const benefits = [
    { icon: Eye, title: t("audienceLanding.benefit.show.title"), body: t("audienceLanding.benefit.show.body", { label }) },
    { icon: Wand2, title: t("audienceLanding.benefit.ai.title"), body: t("audienceLanding.benefit.ai.body") },
    { icon: Gift, title: t("audienceLanding.benefit.free.title"), body: t("audienceLanding.benefit.free.body") },
  ];

  const steps = [
    { icon: MousePointerClick, title: t("audienceLanding.how.step1.title"), body: t("audienceLanding.how.step1.body", { labelLower }) },
    { icon: FileText, title: t("audienceLanding.how.step2.title"), body: t("audienceLanding.how.step2.body") },
    { icon: Pencil, title: t("audienceLanding.how.step3.title"), body: t("audienceLanding.how.step3.body") },
    { icon: Share2, title: t("audienceLanding.how.step4.title"), body: t("audienceLanding.how.step4.body") },
  ];

  const faqItems = [
    { question: t("audienceLanding.faq.make.q", { labelLower }), answer: t("audienceLanding.faq.make.a") },
    { question: t("audienceLanding.faq.free.q"), answer: t("audienceLanding.faq.free.a") },
    { question: t("audienceLanding.faq.skills.q"), answer: t("audienceLanding.faq.skills.a") },
    { question: t("audienceLanding.faq.help.q", { labelLower }), answer: t("audienceLanding.faq.help.a", { labelLower }) },
    { question: t("audienceLanding.faq.formats.q"), answer: t("audienceLanding.faq.formats.a") },
  ];

  return (
    <AppShell bgClassName="bg-background">
      {/* Hero */}
      <section className="px-4 py-20 text-center sm:px-6 lg:px-8 bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        <div className="mx-auto max-w-3xl">
          <Badge variant="outline" className="mb-4">
            {t("audiences.forBadge", { label })}
          </Badge>
          <h1 className="mb-4 text-5xl font-bold">{label}</h1>
          <p className="mb-8 text-xl text-muted-foreground">{blurb}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <StudioOpenCTA withArrow label={t("audienceLanding.hero.openStudio")} />
            <Button asChild variant="outline" size="lg">
              <Link to="/signup">{t("audienceLanding.hero.signup")}</Link>
            </Button>
          </div>
          {kindsCovered.length > 1 && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm text-muted-foreground">
                {t("audienceLanding.hero.buildBadge")}
              </span>
              {kindsCovered.map((kind) => (
                <Badge key={kind} variant="secondary" className="text-sm">
                  {MEDIA_KIND_UI[kind].badgeLabel}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Benefits */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="mb-10 text-center text-3xl font-bold">
          {t("audienceLanding.benefits.heading", { label })}
        </h2>
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
          {benefits.map((b) => (
            <Card key={b.title}>
              <CardHeader>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <b.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{b.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{b.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-muted/20 px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="mb-10 text-center text-3xl font-bold">
          {t("audienceLanding.how.heading")}
        </h2>
        <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.title} className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <s.icon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mb-2 font-semibold">
                {i + 1}. {s.title}
              </h3>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Templates */}
      {templates.length > 0 && (
        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 text-center">
              <h2 className="mb-2 text-3xl font-bold">
                {t("audienceLanding.templates.heading", { label })}
              </h2>
              <p className="text-muted-foreground">
                {t("audienceLanding.templates.sub")}
              </p>
            </div>
            <div className="space-y-12">
              {kindsCovered.map((kind) => {
                const inKind = templates.filter((tpl) => tpl.mediaKind === kind);
                return (
                  <div key={kind}>
                    <h3 className="mb-6 text-xl font-bold">
                      {MEDIA_KIND_UI[kind].badgeLabel}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({inKind.length})
                      </span>
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {inKind.map((tpl) => (
                        <StudioTemplateLinkCard key={tpl.id} template={tpl} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Geo / hiring bridge */}
      <AudienceHiringCTA />

      {/* FAQ — emits FAQPage JSON-LD for SEO + AI-overview (GEO) eligibility */}
      <MarketingFAQ
        schemaId={`for-${slug}`}
        heading={t("audienceLanding.faq.heading", { label })}
        items={faqItems}
      />

      {/* Related professions */}
      <section className="border-t px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <AudienceQuickLinks title={t("audienceLanding.related.title")} />
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-2xl bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-12 text-center">
          <h2 className="mb-4 text-3xl font-bold">
            {t("audienceLanding.finalCta.heading")}
          </h2>
          <p className="mb-8 text-lg text-muted-foreground">
            {t("audienceLanding.finalCta.body")}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <StudioOpenCTA label={t("audienceLanding.hero.openStudio")} />
            <Button asChild variant="outline" size="lg">
              <Link to="/pricing">{t("actions.viewPricing")}</Link>
            </Button>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
