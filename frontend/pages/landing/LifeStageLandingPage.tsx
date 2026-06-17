/**
 * Life-stage variant of /for/[audience] — composes the Resource Map
 * stack for one of the 14 LIFE_STAGE_AUDIENCES (#1629). Renders ONLY
 * when the slug resolves to a life-stage taxonomy; profession audiences
 * stay on the existing AudienceLandingPage path.
 *
 * Every section reads from the audience registry — adding a new
 * audience requires touching shared/audiences-registry.ts only.
 */
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import { AudienceHero } from "@/components/landing/AudienceHero";
import { audienceLabel } from "@/components/landing/localize-audience";
import { ResourceMap } from "@/components/landing/ResourceMap";
import { ToolShowcase } from "@/components/landing/ToolShowcase";
import { RelatedAudiences } from "@/components/landing/RelatedAudiences";
import MarketingFAQ from "@/components/MarketingFAQ";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import type { LifeStageAudienceMeta } from "@shared/audiences-registry";

export interface LifeStageLandingPageProps {
  meta: LifeStageAudienceMeta;
}

export function LifeStageLandingPage({ meta }: LifeStageLandingPageProps): JSX.Element {
  const location = useLocation();
  const { t } = useTranslation();
  const label = audienceLabel(t, meta);

  useSEO(location.pathname, {
    title: `${label} — hired.video resource map`,
    description: meta.thesis,
    ogTitle: `For ${label} · hired.video`,
    ogDescription: meta.thesis,
  });
  useDefaultBreadcrumbs();

  return (
    <AppShell bgClassName="bg-background">
      <AudienceHero meta={meta} />
      <ToolShowcase
        features={meta.focusFeatures}
        eyebrow={t("audiences.toolShowcase.eyebrow", {
          defaultValue: "Built for {{label}}",
          label: label.toLowerCase(),
        })}
      />
      <ResourceMap filter={{ audienceKey: meta.key }} kinds={meta.focusContentKinds} />

      <section className="px-4 py-16 sm:px-6 lg:px-8 text-center bg-gradient-to-br from-brand-purple/5 to-brand-blue/5">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">{t("audiences.readyCta.heading", { defaultValue: "Ready when you are" })}</h2>
          <p className="text-lg text-muted-foreground mb-6">
            {t("audiences.readyCta.body", { defaultValue: "Free to start. Upgrade to Pro when you want the AI scoring + outreach + studio renders." })}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to={meta.ctaPrimary.href}>{t(`audiences.${meta.key}.ctaPrimary`, { defaultValue: meta.ctaPrimary.label })}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/pricing">{t("audiences.readyCta.pricing", { defaultValue: "See pricing" })}</Link>
            </Button>
          </div>
        </div>
      </section>

      <MarketingFAQ
        schemaId={`for-${meta.key}-faq`}
        items={[
          {
            question: t("audiences.faq.free.question", { defaultValue: "Is hired.video really free for {{label}}?", label: label.toLowerCase() }),
            answer: t("audiences.faq.free.answer", { defaultValue: "Yes — the resume builder, profile, video resume, applying to jobs, and the resource map are free. Pro ($9.95/mo) unlocks AI scoring, optimization, and the studio template marketplace at no per-feature cost." }),
          },
          {
            question: t("audiences.faq.tagged.question", { defaultValue: "How do I get tagged content for my situation?" }),
            answer: t("audiences.faq.tagged.answer", { defaultValue: 'Browse the resource map above — articles, templates, video resumes, and learning paths tagged "{{label}}" surface in each bucket. Tagged content grows as creators publish; check back as your situation evolves.', label }),
          },
          {
            question: t("audiences.faq.switch.question", { defaultValue: "Can I switch to a different path later?" }),
            answer: t("audiences.faq.switch.answer", { defaultValue: "Yes. Your account isn't locked to an audience — these landing pages are just curated entry points. Move between them freely." }),
          },
        ]}
      />

      <RelatedAudiences current={meta.key} />
    </AppShell>
  );
}
