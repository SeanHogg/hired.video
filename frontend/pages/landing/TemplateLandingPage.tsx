// Per-template landing page (#901) at `/templates/:slug`.
//
// Public SEO surface for the built-in catalog — hero, "best for" audience
// chips that link to #900 audience pages, OutputProfilePanel ("Exports as
// / Publishes to" reads `mediaKind` from `@shared/media-kinds.ts`), 3-step
// "how it works", related-template grid, and the conversion CTA into the
// editor seeded with this template (StudioOpenCTA owns that deep link).

import { useParams, Navigate, Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import MonoChip from "@/components/templates/MonoChip";
import { SeoHero } from "@/components/landing/SeoHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { NumberedSteps } from "@/components/landing/SeoSections";
import { PILL_LINK_CLASS } from "@/components/landing/LinkTile";
import { MEDIA_KIND_UI } from "@shared/media-kinds";
import { TEMPLATE_CATALOG } from "@/lib/studio/templates/catalog";
import { OutputProfilePanel } from "@/components/studio/templates/OutputProfilePanel";
import { StudioTemplateLinkCard } from "@/components/studio/templates/StudioTemplateLinkCard";
import { StudioOpenCTA } from "@/components/studio/templates/StudioOpenCTA";
import { TemplateHeroPreview } from "@/components/landing/TemplateHeroPreview";
import { getAudience, isAudienceEnabled } from "@/lib/studio/templates/audiences";
import { localizeAudience } from "@/lib/studio/localize-audience";
import { relatedTemplatesFor } from "@/components/studio/templates/templates-by-audience";

export default function TemplateLandingPage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const { t } = useTranslation();
  const template = TEMPLATE_CATALOG.find((tpl) => tpl.id === slug);

  // Hooks must run unconditionally — feed empty customSEO when template is
  // missing; the Navigate below will redirect before render anyway.
  useDefaultBreadcrumbs();
  useSEO(
    location.pathname,
    template
      ? {
          title: t("seoLanding.template.seoTitle", { label: template.label }),
          description: template.desc,
          ogTitle: t("seoLanding.template.ogTitle", { label: template.label }),
          ogDescription: template.desc,
        }
      : undefined,
  );

  if (!template) return <Navigate to="/studio" replace />;

  const ui = MEDIA_KIND_UI[template.mediaKind];
  // "Best for" chips link to /for/:audience — only live (persona-enabled) ones.
  const audienceDefs = template.audiences.filter((a) => isAudienceEnabled(a))
    .map((a) => ({ id: a, ...localizeAudience(getAudience(a), t) }));
  const related = relatedTemplatesFor(template, 4);
  const openLabel = t("resumeTemplatesGallery.openInStudio");

  const steps = [
    { title: t("seoLanding.template.step1.title"), body: t("seoLanding.template.step1.body", { label: template.label }) },
    { title: t("seoLanding.template.step2.title"), body: t("seoLanding.template.step2.body") },
    {
      title: t("seoLanding.template.step3.title", { kind: ui.badgeLabel.toLowerCase() }),
      body: t("seoLanding.template.step3.body", { exportVerb: ui.exportVerb }),
    },
  ];

  return (
    <AppShell bgClassName="bg-background">
      <SeoHero
        eyebrow={t("seoLanding.template.eyebrow", { kind: ui.badgeLabel })}
        title={template.label}
        lede={template.desc}
        primary={null}
        aside={<TemplateHeroPreview template={template} />}
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <StudioOpenCTA templateId={template.id} label={openLabel} withArrow />
          <Link to="/studio" className="inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline">
            {t("seoLanding.template.allStudioTemplates")}
          </Link>
        </div>
      </SeoHero>

      {/* Best for + Output panel — side-by-side on desktop */}
      <MarketingBand tone="card" className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] gap-6">
        {audienceDefs.length > 0 && (
          <div className="flex flex-col gap-4 rounded-[20px] border border-border bg-background p-6">
            <MonoChip className="self-start">{t("seoLanding.template.bestFor")}</MonoChip>
            <ul className="flex flex-wrap gap-2.5">
              {audienceDefs.map((a) => (
                <li key={a.id}>
                  <Link to={`/for/${a.id}`} className={PILL_LINK_CLASS}>
                    {a.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-[15px] leading-relaxed text-muted-foreground">{audienceDefs[0].blurb}</p>
          </div>
        )}
        <OutputProfilePanel mediaKind={template.mediaKind} />
      </MarketingBand>

      <MarketingBand labelledBy="template-how-title" className="flex flex-col gap-10">
        <MarketingSectionIntro id="template-how-title" title={t("seoLanding.template.howTitle")} />
        <NumberedSteps steps={steps} />
      </MarketingBand>

      {related.length > 0 && (
        <MarketingBand tone="card" labelledBy="template-related-title" className="flex flex-col gap-8">
          <MarketingSectionIntro
            id="template-related-title"
            title={
              audienceDefs[0]
                ? t("seoLanding.template.moreFor", { audience: audienceDefs[0].label.toLowerCase() })
                : t("seoLanding.template.moreForYou")
            }
          />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
            {related.map((tpl) => (
              <StudioTemplateLinkCard key={tpl.id} template={tpl} />
            ))}
          </div>
        </MarketingBand>
      )}

      <SeoFinalCta
        id="template"
        title={t("seoLanding.template.finalTitle", { label: template.label.toLowerCase() })}
        body={template.desc}
        action={<StudioOpenCTA templateId={template.id} label={openLabel} />}
      />
    </AppShell>
  );
}
