/**
 * /sectors/:sector — vertical landing page for an AI-resilient sector.
 *
 * One page handles every sector via the `:sector` param + the shared
 * SectorMeta SSoT. Per the DRY rule: no per-sector hardcoded pages.
 *
 * Sections (in order):
 *   1. Hero — sector label + tagline + honest AI-resilience chip
 *   2. AI-resilience reality check + example roles + licensure notes
 *   3. Live jobs in this sector (top 8 from `/api/jobs?sector=…`,
 *      omitted for content-only sectors like politics_civic)
 *   4. Top articles in this sector (top 4 from `/api/articles/public?sector=…`)
 *   5. Recommended resume template + link to gallery
 *   6. Pivot from tech (job seekers)
 *   7. Closing CTA into the kit workspace
 */

import type { ReactNode } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import MonoChip from "@/components/templates/MonoChip";
import { SeoHero } from "@/components/landing/SeoHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { ArticleCard } from "@/components/article/ArticleCard";
import { SectorJobTile } from "@/components/sector/SectorJobTile";
import { useSectorLiveData } from "@/components/sector/use-sector-live-data";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { isValidSector, SECTORS, sectorMeta } from "@shared/sectors";
import { sectorTemplateRec } from "@shared/sector-templates";
import { studioNewEntityHref } from "@/lib/studio/studio-authoring";

type Tone = "page" | "card";

const CARD = "flex flex-col gap-3 rounded-[20px] border border-border p-6";
const TEXT_LINK = "inline-flex min-h-[44px] items-center gap-1 font-semibold text-primary hover:underline";

export default function SectorLanding() {
  const { t } = useTranslation();
  const { sector: rawSector } = useParams<{ sector: string }>();
  const valid = !!rawSector && isValidSector(rawSector);
  // Resolve meta BEFORE any hook / early return so the hooks below run
  // unconditionally (#1871 — useSectorLiveData previously sat AFTER the
  // invalid-sector Navigate, so hook order changed between renders). When
  // the sector is invalid we Navigate away, so the fallback sector's data
  // is fetched-then-discarded harmlessly.
  const meta = valid ? sectorMeta(rawSector) : null;
  const sectorsCrumb = { name: t("seoLanding.sectors.breadcrumb"), url: "/sectors" };
  useSEO("/sectors");
  useBreadcrumbs(
    valid && meta ? [sectorsCrumb, { name: meta.label, url: `/sectors/${rawSector}` }] : [sectorsCrumb],
  );
  const { jobs, articles, loading } = useSectorLiveData(
    meta?.slug ?? SECTORS[0],
    meta?.contentOnly ?? true,
  );

  if (!valid || !meta) {
    return <Navigate to="/sectors" replace />;
  }

  const rec = sectorTemplateRec(meta.slug);
  const sector = meta.label;
  const showPivot = meta.transferableFromTech.length > 0 && meta.slug !== "tech";

  // Bands alternate card/page in render order, whatever subset renders.
  const sections: Array<{ key: string; render: (tone: Tone) => ReactNode }> = [
    {
      key: "reality",
      render: (tone) => (
        <MarketingBand key="reality" tone={tone} className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-5">
          <div className={`${CARD} ${surface(tone)}`}>
            <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">{t("seoLanding.sector.honestRead")}</h2>
            <p className="leading-relaxed text-muted-foreground">{meta.aiResilienceNotes}</p>
          </div>
          <div className={`${CARD} ${surface(tone)}`}>
            <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">{t("seoLanding.sector.roles")}</h2>
            <ul className="flex flex-col gap-2">
              {meta.exampleRoles.map((r) => (
                <li key={r} className="flex items-start gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-primary" aria-hidden="true" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
          {meta.requiresLicense && meta.licensingNotes && (
            <div className={`${CARD} ${surface(tone)}`}>
              <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">{t("seoLanding.sector.licensing")}</h2>
              <p className="leading-relaxed text-muted-foreground">{meta.licensingNotes}</p>
            </div>
          )}
        </MarketingBand>
      ),
    },
  ];

  // Live jobs — omitted for content-only sectors.
  if (!meta.contentOnly) {
    sections.push({
      key: "jobs",
      render: (tone) => (
        <MarketingBand key="jobs" tone={tone} labelledBy="sector-jobs-title" className="flex flex-col gap-8">
          <SectionHead id="sector-jobs-title" title={t("seoLanding.sector.openRoles")} href={`/jobs?sector=${meta.slug}`} />
          {loading ? (
            <p className="text-muted-foreground">{t("status.loading")}</p>
          ) : jobs.length === 0 ? (
            <p className="text-muted-foreground">
              {t("seoLanding.sector.noJobs", { sector })}{" "}
              <Link to={studioNewEntityHref("job")} className="font-semibold text-primary hover:underline">
                {t("seoLanding.sector.postOne")}
              </Link>
            </p>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
              {jobs.map((job) => (
                <li key={job.id}>
                  <SectorJobTile job={job} />
                </li>
              ))}
            </ul>
          )}
        </MarketingBand>
      ),
    });
  }

  sections.push(
    {
      key: "articles",
      render: (tone) => (
        <MarketingBand key="articles" tone={tone} labelledBy="sector-articles-title" className="flex flex-col gap-8">
          <SectionHead id="sector-articles-title" title={t("seoLanding.sector.guides")} href={`/articles?sector=${meta.slug}`} />
          {loading ? (
            <p className="text-muted-foreground">{t("status.loading")}</p>
          ) : articles.length === 0 ? (
            <p className="text-muted-foreground">{t("seoLanding.sector.noArticles", { sector })}</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4">
              {articles.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          )}
        </MarketingBand>
      ),
    },
    {
      key: "template",
      render: (tone) => (
        <MarketingBand key="template" tone={tone} labelledBy="sector-template-title" className="flex flex-wrap items-end justify-between gap-8">
          <div className="flex max-w-[44em] flex-col gap-4">
            <MonoChip className="self-start">{t("seoLanding.sector.recommendedTemplate")}</MonoChip>
            <MarketingSectionIntro id="sector-template-title" title={rec.displayName} subtitle={rec.rationale} />
          </div>
          <Button asChild size="lg">
            <Link to={`/resume-templates?sector=${meta.slug}`}>
              {t("seoLanding.sector.openTemplate")}
              <ArrowRight className="ml-1 h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
          </Button>
        </MarketingBand>
      ),
    },
  );

  if (showPivot) {
    sections.push({
      key: "pivot",
      render: (tone) => (
        <MarketingBand key="pivot" tone={tone} labelledBy="sector-pivot-title" className="flex flex-col gap-8">
          <MarketingSectionIntro
            id="sector-pivot-title"
            title={t("seoLanding.sector.pivotTitle")}
            subtitle={t("seoLanding.sector.pivotLead", { sector })}
          />
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-3">
            {meta.transferableFromTech.map((s) => (
              <li key={s} className={`flex items-start gap-3 rounded-2xl border border-border p-4 ${surface(tone)}`}>
                <ArrowRight className="mt-0.5 h-4 w-4 flex-none text-primary" aria-hidden="true" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
          <Button asChild size="lg" className="self-start">
            <Link to={`/pivot-explorer?to=${meta.slug}`}>{t("seoLanding.sector.mapSkills", { sector })}</Link>
          </Button>
        </MarketingBand>
      ),
    });
  }

  return (
    <AppShell bgClassName="bg-background">
      <SeoHero
        eyebrow={t(`seoLanding.sector.resilience.${meta.aiResilience}`)}
        title={sector}
        lede={meta.tagline}
        secondary={
          meta.contentOnly
            ? { to: `/articles?sector=${meta.slug}`, label: t("seoLanding.sector.readArticles") }
            : { to: `/jobs?sector=${meta.slug}`, label: t("seoLanding.sector.browseJobs", { sector }) }
        }
      >
        <div className="flex flex-wrap gap-x-6">
          {!meta.contentOnly && (
            <Link to={`/articles?sector=${meta.slug}`} className={TEXT_LINK}>
              {t("seoLanding.sector.readArticles")}
            </Link>
          )}
          {meta.slug !== "tech" && (
            <Link to={`/pivot-explorer?to=${meta.slug}`} className={TEXT_LINK}>
              {t("seoLanding.sector.pivotFromTech")}
            </Link>
          )}
        </div>
      </SeoHero>

      {sections.map((s, i) => s.render(i % 2 === 0 ? "card" : "page"))}

      <SeoFinalCta id="sector" title={t("landing.final.title")} />
    </AppShell>
  );
}

/** Inner card surface that contrasts with the band it sits on. */
function surface(tone: Tone): string {
  return tone === "card" ? "bg-background" : "bg-card";
}

function SectionHead({ id, title, href }: { id: string; title: string; href: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <MarketingSectionIntro id={id} title={title} />
      <Link to={href} className={TEXT_LINK}>
        {t("seoLanding.common.seeAll")}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
