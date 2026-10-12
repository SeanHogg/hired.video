/**
 * ProfessionLandingPage — the rich /for/[audience] marketing surface for
 * PROFESSION audiences (director, actor, developer, …). Composes the same
 * marketing anatomy as the home page (hero → benefits → how-it-works →
 * templates → geo/hiring CTA → FAQ → related → upload step → final CTA;
 * hero copy, art, proof and the create intent every CTA starts all come
 * from the audience registry — #922 / #2364) so profession
 * pages carry real SEO + GEO weight (FAQPage + CollectionPage +
 * BreadcrumbList JSON-LD) and active-engagement CTAs instead of a bare
 * template grid.
 *
 * All chrome copy is parameterized by the audience label, so every
 * profession audience — and any future one added to audiences.ts — gets a
 * full page with zero per-audience wiring. The audience `label`/`blurb`
 * stay the studio SSoT (English); localizing those is tracked in ROADMAP.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Wand2, Gift } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import MarketingFAQ from "@/components/MarketingFAQ";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import MonoChip from "@/components/templates/MonoChip";
import { SeoHero } from "@/components/landing/SeoHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { NumberedSteps, IconCards } from "@/components/landing/SeoSections";
import { useProMonthlyPriceLabel } from "@/hooks/use-pro-price-label";
import { AudienceHiringCTA } from "@/components/landing/AudienceHiringCTA";
import { MEDIA_KIND_UI, MEDIA_KINDS } from "@shared/media-kinds";
import { StudioTemplateLinkCard } from "@/components/studio/templates/StudioTemplateLinkCard";
import { AudienceQuickLinks } from "@/components/studio/templates/AudienceQuickLinks";
import type { AudienceDef } from "@/lib/studio/templates/audiences";
import { localizeAudience } from "@/lib/studio/localize-audience";
import { templatesForAudience } from "@/components/studio/templates/templates-by-audience";
import { AudienceHeroArt } from "@/components/landing/AudienceHeroArt";
import { AudienceProofRow } from "@/components/landing/AudienceProofRow";
import { AudienceUploadStep, useIntentCta } from "@/components/landing/AudienceUploadStep";
import { LANDING_SOURCE_PARAM } from "@/lib/studio/create-intent";

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
  const { label, blurb, heroCopy } = localizeAudience(audience, t);
  const labelLower = label.toLowerCase();
  const price = useProMonthlyPriceLabel();

  useDefaultBreadcrumbs();
  useSEO(pathname, {
    title: t("seoLanding.profession.seoTitle", { label }),
    description: t("seoLanding.profession.seoDescription", { blurb }),
    ogTitle: t("seoLanding.profession.ogTitle", { label }),
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
  // Hero line + the start every CTA on the page shares — both from the
  // audience registry (#922 / #2364). A video start opens on the audience's
  // own first video template.
  const videoTemplate = templates.find((tpl) => tpl.mediaKind === "video")?.id;
  const startCta = useIntentCta(audience.createIntent, { videoTemplate });

  const benefits = [
    { icon: Eye, title: t("audienceLanding.benefit.show.title"), body: t("audienceLanding.benefit.show.body", { label }) },
    { icon: Wand2, title: t("audienceLanding.benefit.ai.title"), body: t("audienceLanding.benefit.ai.body") },
    { icon: Gift, title: t("audienceLanding.benefit.free.title"), body: t("audienceLanding.benefit.free.body") },
  ];

  const steps = [
    { title: t("audienceLanding.how.step1.title"), body: t("audienceLanding.how.step1.body", { labelLower }) },
    { title: t("audienceLanding.how.step2.title"), body: t("audienceLanding.how.step2.body") },
    { title: t("audienceLanding.how.step3.title"), body: t("audienceLanding.how.step3.body") },
    { title: t("audienceLanding.how.step4.title"), body: t("audienceLanding.how.step4.body") },
  ];

  // Memoised so MarketingFAQ's JSON-LD effect doesn't re-run every render.
  const faqItems = useMemo(
    () => [
      { question: t("audienceLanding.faq.make.q", { labelLower }), answer: t("audienceLanding.faq.make.a") },
      { question: t("audienceLanding.faq.free.q"), answer: t("audienceLanding.faq.free.a", { price }) },
      { question: t("audienceLanding.faq.skills.q"), answer: t("audienceLanding.faq.skills.a") },
      { question: t("audienceLanding.faq.help.q", { labelLower }), answer: t("audienceLanding.faq.help.a", { labelLower }) },
      { question: t("audienceLanding.faq.formats.q"), answer: t("audienceLanding.faq.formats.a") },
    ],
    [t, labelLower, price],
  );

  return (
    <AppShell bgClassName="bg-background">
      <SeoHero
        eyebrow={t("audiences.forBadge", { label })}
        title={label}
        lede={heroCopy}
        primary={startCta}
        secondary={{
          to: `/studio?${LANDING_SOURCE_PARAM}=${encodeURIComponent(slug)}`,
          label: t("audienceLanding.hero.openStudio"),
        }}
        aside={<AudienceHeroArt art={audience.heroArt} label={label} templates={templates} />}
      >
        <AudienceProofRow proof={audience.proof} templateCount={templates.length} labelLower={labelLower} />
        {kindsCovered.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("audienceLanding.hero.buildBadge")}</span>
            {kindsCovered.map((kind) => (
              <MonoChip key={kind}>{MEDIA_KIND_UI[kind].badgeLabel}</MonoChip>
            ))}
          </div>
        )}
      </SeoHero>

      <MarketingBand tone="card" labelledBy="profession-benefits-title" className="flex flex-col gap-10">
        <MarketingSectionIntro
          id="profession-benefits-title"
          title={t("audienceLanding.benefits.heading", { label })}
        />
        <IconCards items={benefits} />
      </MarketingBand>

      <MarketingBand labelledBy="profession-how-title" className="flex flex-col gap-10">
        <MarketingSectionIntro id="profession-how-title" title={t("audienceLanding.how.heading")} />
        <NumberedSteps steps={steps} />
      </MarketingBand>

      {templates.length > 0 && (
        <MarketingBand tone="card" labelledBy="profession-templates-title" className="flex flex-col gap-10">
          <MarketingSectionIntro
            id="profession-templates-title"
            title={t("audienceLanding.templates.heading", { label })}
            subtitle={t("audienceLanding.templates.sub")}
          />
          {kindsCovered.map((kind) => {
            const inKind = templates.filter((tpl) => tpl.mediaKind === kind);
            return (
              <div key={kind} className="flex flex-col gap-5">
                <h3 className="flex flex-wrap items-baseline gap-2 font-display text-2xl font-bold tracking-[-0.02em]">
                  {MEDIA_KIND_UI[kind].badgeLabel}
                  <span className="font-mono text-sm font-normal text-muted-foreground">{inKind.length}</span>
                </h3>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4">
                  {inKind.map((tpl) => (
                    <StudioTemplateLinkCard key={tpl.id} template={tpl} />
                  ))}
                </div>
              </div>
            );
          })}
        </MarketingBand>
      )}

      {/* Geo / hiring bridge */}
      <AudienceHiringCTA tone={templates.length > 0 ? "page" : "card"} />

      {/* FAQ — emits FAQPage JSON-LD for SEO + AI-overview (GEO) eligibility */}
      <MarketingFAQ
        variant="plain"
        defaultOpenIndex={0}
        schemaId={`for-${slug}`}
        heading={t("audienceLanding.faq.heading", { label })}
        items={faqItems}
        className="mx-auto max-w-[820px] px-6 py-20"
      />

      {/* Related professions */}
      <MarketingBand tone="card" className="py-12 sm:py-14">
        <AudienceQuickLinks title={t("audienceLanding.related.title")} />
      </MarketingBand>

      {/* The page ends in this audience's upload step (#2364). */}
      <AudienceUploadStep
        id={`for-${slug}`}
        intent={audience.createIntent}
        videoTemplate={videoTemplate}
        tone="page"
      />

      <SeoFinalCta
        id={`for-${slug}`}
        title={t("audienceLanding.finalCta.heading")}
        body={t("audienceLanding.finalCta.body")}
        primary={startCta}
        secondary={{ to: "/pricing", label: t("actions.viewPricing") }}
      />
    </AppShell>
  );
}
