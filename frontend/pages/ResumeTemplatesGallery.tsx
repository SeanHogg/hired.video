/**
 * /resume-templates — filterable gallery of every resume template,
 * sorted so the sector-recommended template surfaces first when a
 * `?sector=…` query param is set.
 *
 * Reuses the existing 5 storyboard themes from `visual-themes.ts` and
 * surfaces them as sector-tagged variants via `sector-templates.ts`.
 * The actual sector-specific storyboards (medical-credentialed,
 * trade-licensed, etc.) are tracked as a follow-up in the gap register.
 */

import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import MonoChip from "@/components/templates/MonoChip";
import { SeoHero } from "@/components/landing/SeoHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { LinkTile } from "@/components/landing/LinkTile";
import { SectorFilter, sectorFilterFromQuery, applySectorFilterToQuery } from "@/components/sector/SectorFilter";
import TemplateGallery from "@/components/resume-renderer/TemplateGallery";
import { allSectors, sectorMeta, type Sector } from "@shared/sectors";
import { sectorTemplateRec, sectorTemplateFile } from "@shared/sector-templates";
import { VISUAL_THEMES } from "@/lib/studio/visual-themes";
import { cn } from "@/lib/utils";

export default function ResumeTemplatesGallery() {
  const { t } = useTranslation();
  useSEO("/resume-templates");
  useBreadcrumbs([{ name: t("resumeTemplatesGallery.title"), url: "/resume-templates" }]);

  const [params, setParams] = useSearchParams();
  const selectedSector = sectorFilterFromQuery(params);
  const rec = selectedSector ? sectorTemplateRec(selectedSector) : null;

  const sortedThemes = useMemo(() => {
    if (!selectedSector) return VISUAL_THEMES;
    const recommended = sectorTemplateRec(selectedSector);
    const primary = VISUAL_THEMES.find((theme) => theme.id === recommended.primaryThemeId);
    const others = VISUAL_THEMES.filter((theme) => theme.id !== recommended.primaryThemeId);
    return primary ? [primary, ...others] : VISUAL_THEMES;
  }, [selectedSector]);

  const onSectorChange = (next: Sector | null) => {
    setParams(applySectorFilterToQuery(params, next), { replace: true });
  };

  return (
    <AppShell bgClassName="bg-background">
      <SeoHero
        eyebrow={t("seoLanding.templatesGallery.eyebrow")}
        title={t("resumeTemplatesGallery.title")}
        lede={t("resumeTemplatesGallery.intro")}
        secondary={{ to: "/templates", label: t("seoLanding.common.browseTemplates") }}
      />

      {/* Document templates — the real resume template catalog (every
          TEMPLATE_PRESET), rendered through the shared TemplateGallery /
          TemplateCard so each card previews + links to its
          /marketplace/templates/<slug> page (DRY: same cards as /search). */}
      <MarketingBand tone="card" className="py-4 sm:py-6">
        <TemplateGallery
          title={t("resumeTemplatesGallery.documentTemplates.title")}
          subtitle={t("resumeTemplatesGallery.documentTemplates.subtitle")}
        />
      </MarketingBand>

      {/* Video resume themes by sector — a distinct surface (storyboard
          themes for the studio), kept below the document catalog. */}
      <MarketingBand labelledBy="video-themes-title" className="flex flex-col gap-8">
        <MarketingSectionIntro
          id="video-themes-title"
          title={t("resumeTemplatesGallery.videoThemes.title")}
          subtitle={t("resumeTemplatesGallery.videoThemes.subtitle")}
        />

        <SectorFilter value={selectedSector} onChange={onSectorChange} mode="all" />

        {selectedSector && rec && (
          <div className="flex flex-col gap-3 rounded-[20px] border border-primary/40 bg-accent p-6 text-accent-foreground">
            <h3 className="font-display text-xl font-bold tracking-[-0.02em]">
              {t("resumeTemplatesGallery.recommendedFor", {
                sector: sectorMeta(selectedSector).label,
                template: rec.displayName,
              })}
            </h3>
            <p className="leading-relaxed">{rec.rationale}</p>
            {rec.alternates.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <MonoChip className="self-start">{t("resumeTemplatesGallery.alternates")}</MonoChip>
                <ul className="flex flex-col gap-1">
                  {rec.alternates.map((alt) => (
                    <li key={alt.themeId} className="text-sm">
                      <span className="font-semibold">{alt.themeId}</span> — {alt.when}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-5">
          {sortedThemes.map((theme) => {
            const isRecommended = rec !== null && rec.primaryThemeId === theme.id;
            const file = isRecommended && selectedSector ? sectorTemplateFile(selectedSector) : theme.file;
            return (
              <li
                key={theme.id}
                className={cn(
                  "flex flex-col gap-4 rounded-[20px] border bg-card p-6",
                  isRecommended ? "border-primary" : "border-border",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-xl font-bold tracking-[-0.02em]">{theme.label}</h3>
                  {isRecommended && <MonoChip tone="free">{t("resumeTemplatesGallery.recommendedBadge")}</MonoChip>}
                </div>
                {/* Theme palette swatch — the theme's own data colours as flat blocks. */}
                <div className="flex h-20 overflow-hidden rounded-xl border border-border" aria-hidden="true">
                  <div className="flex-1" style={{ backgroundColor: theme.colors[0] }} />
                  <div className="flex-1" style={{ backgroundColor: theme.colors[1] }} />
                </div>
                <p className="flex-1 text-[15px] leading-relaxed text-muted-foreground">{theme.desc}</p>
                {/* When a sector is selected AND this is the recommended base
                    theme, link to the sector-specific storyboard file (#1167)
                    instead of the generic one — it pre-fills
                    credentialing-forward scenes the sector needs. */}
                <Button asChild variant={isRecommended ? "default" : "outline"} className="w-full">
                  <Link to={`/studio?template=${file}`}>{t("resumeTemplatesGallery.openInStudio")}</Link>
                </Button>
              </li>
            );
          })}
        </ul>
      </MarketingBand>

      {/* Sector matrix — every sector + its primary recommendation, for
          quick discovery without scanning the cards. */}
      <MarketingBand tone="card" labelledBy="by-sector-title" className="flex flex-col gap-8">
        <MarketingSectionIntro id="by-sector-title" title={t("resumeTemplatesGallery.bySector")} />
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-4">
          {allSectors().map((m) => {
            const sectorRec = sectorTemplateRec(m.slug);
            return (
              <li key={m.slug}>
                <LinkTile
                  to={`/resume-templates?sector=${m.slug}`}
                  title={<span className="text-lg">{m.label}</span>}
                  body={
                    <>
                      <span className="block font-semibold text-foreground">{sectorRec.displayName}</span>
                      <span className="mt-1 block">{sectorRec.rationale}</span>
                    </>
                  }
                  className="bg-background p-5"
                />
              </li>
            );
          })}
        </ul>
      </MarketingBand>

      <SeoFinalCta id="resume-templates" title={t("landing.final.title")} />
    </AppShell>
  );
}
