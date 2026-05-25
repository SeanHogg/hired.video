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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { SectorFilter, sectorFilterFromQuery, applySectorFilterToQuery } from "@/components/sector/SectorFilter";
import { allSectors, sectorMeta, type Sector } from "@shared/sectors";
import { sectorTemplateRec } from "@shared/sector-templates";
import { VISUAL_THEMES } from "@/lib/studio/visual-themes";

export default function ResumeTemplatesGallery() {
  useSEO("/resume-templates");
  useBreadcrumbs([{ name: "Resume Templates", url: "/resume-templates" }]);

  const [params, setParams] = useSearchParams();
  const selectedSector = sectorFilterFromQuery(params);

  const sortedThemes = useMemo(() => {
    if (!selectedSector) return VISUAL_THEMES;
    const rec = sectorTemplateRec(selectedSector);
    const primary = VISUAL_THEMES.find((t) => t.id === rec.primaryThemeId);
    const others = VISUAL_THEMES.filter((t) => t.id !== rec.primaryThemeId);
    return primary ? [primary, ...others] : VISUAL_THEMES;
  }, [selectedSector]);

  const onSectorChange = (next: Sector | null) => {
    setParams(applySectorFilterToQuery(params, next), { replace: true });
  };

  return (
    <AppShell bgClassName="bg-background">
      <main className="pt-16 pb-20 max-w-6xl mx-auto px-6">
        <section className="py-12 space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">Resume Templates</h1>
          <p className="text-lg text-muted-foreground max-w-3xl">
            Five base storyboards, each tuned for a different sector and
            seniority profile. Filter by sector to surface the recommended
            template + rationale.
          </p>
        </section>

        <section className="pb-6">
          <SectorFilter
            value={selectedSector}
            onChange={onSectorChange}
            mode="all"
          />
        </section>

        {selectedSector && (
          <section className="pb-6">
            <Card className="bg-muted/30 border-primary/40">
              <CardHeader>
                <CardTitle>
                  Recommended for {sectorMeta(selectedSector).label}: {sectorTemplateRec(selectedSector).displayName}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-muted-foreground">
                  {sectorTemplateRec(selectedSector).rationale}
                </p>
                {sectorTemplateRec(selectedSector).alternates.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1">Alternates</p>
                    <ul className="space-y-1">
                      {sectorTemplateRec(selectedSector).alternates.map((alt) => (
                        <li key={alt.themeId} className="text-sm text-muted-foreground">
                          <span className="font-medium">{alt.themeId}</span> — {alt.when}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        <section className="pb-12 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedThemes.map((theme, idx) => {
            const isRecommended =
              selectedSector !== null &&
              sectorTemplateRec(selectedSector).primaryThemeId === theme.id;
            return (
              <Card
                key={theme.id}
                className={
                  isRecommended
                    ? "border-primary"
                    : undefined
                }
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{theme.label}</CardTitle>
                    {isRecommended && <Badge>Recommended</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div
                    className="h-20 rounded-md"
                    style={{
                      background: `linear-gradient(135deg, ${theme.colors[0]}, ${theme.colors[1]})`,
                    }}
                  />
                  <p className="text-sm text-muted-foreground">{theme.desc}</p>
                  <Button asChild variant={isRecommended ? "default" : "outline"} className="w-full">
                    <Link to={`/studio?template=${theme.file}`}>
                      Open in studio
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>

        {/* Sector matrix — every sector + its primary recommendation, for
            quick discovery without scanning the cards. */}
        <section className="pb-12 space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">By sector</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {allSectors().map((m) => {
              const rec = sectorTemplateRec(m.slug);
              return (
                <Link key={m.slug} to={`/resume-templates?sector=${m.slug}`}>
                  <Card className="h-full hover:border-primary/50 transition-colors">
                    <CardHeader>
                      <CardTitle className="text-sm">{m.label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm font-medium">{rec.displayName}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {rec.rationale}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
