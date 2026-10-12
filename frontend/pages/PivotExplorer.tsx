/**
 * /pivot-explorer — interactive tool for mapping current skills against
 * AI-resilient sectors.
 *
 * Three modes:
 *   1. Default — list every recruitable sector, ranked by transferable-
 *      skill richness (sectors with the most articulated tech-bridge
 *      first). Free-form skills input refines the ranking.
 *   2. `?to=<sector>` — drilldown on a specific sector. Shows the
 *      full transferable-skills list, licensing requirements, order
 *      of operations, and recommended resume template.
 *   3. With skills input — match user-entered skills against per-sector
 *      transferable-from-tech keywords and rank by overlap count.
 *
 * Pure client-side logic (no LLM call required). The existing skill
 * extractor (`api/src/routes/skill-extractor.ts`) can later feed this
 * page with extracted-from-resume skills via a `?fromResume=<id>` param
 * — tracked in the gap register as a follow-up.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppShell } from "@/components/AppShell";
import { ToolTitleBlock } from "@/components/tools/ToolTitleBlock";
import MonoChip from "@/components/templates/MonoChip";
import { PivotDrilldown } from "@/components/pivot-explorer/PivotDrilldown";
import { RESILIENCE_LABEL_KEYS, rankSectors } from "@/components/pivot-explorer/pivot-scoring";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { isValidSector, type Sector } from "@shared/sectors";
import { resumeService } from "@/lib/services/resume-service";

export default function PivotExplorer() {
  const { t } = useTranslation();
  useSEO("/pivot-explorer");
  useBreadcrumbs([{ name: t("pivotExplorer.title"), url: "/pivot-explorer" }]);

  const [params] = useSearchParams();
  const toParam = params.get("to");
  const fromResume = params.get("fromResume");
  const focusSector: Sector | null =
    toParam && isValidSector(toParam) ? toParam : null;

  const [skillsInput, setSkillsInput] = useState("");
  const [hydratingFromResume, setHydratingFromResume] = useState(false);
  const [resumeHydrationError, setResumeHydrationError] = useState<string | null>(null);

  // Hydrate from a resume when ?fromResume=<id> is set (#1170). Each
  // skill's `name` + its `keywords[]` join into the comma-separated
  // input so the keyword matcher in `scoreSector` has more bridges to
  // hit. Best-effort: failure leaves the input untouched and surfaces a
  // non-blocking note.
  useEffect(() => {
    if (!fromResume) return;
    let alive = true;
    setHydratingFromResume(true);
    setResumeHydrationError(null);
    void resumeService
      .getResumeById(fromResume)
      .then((resume) => {
        if (!alive) return;
        const tokens: string[] = [];
        for (const skill of resume.content?.skills ?? []) {
          if (skill.name) tokens.push(skill.name);
          for (const kw of skill.keywords ?? []) {
            if (kw) tokens.push(kw);
          }
        }
        if (tokens.length > 0) {
          // De-dupe case-insensitively so "Python" + "python" don't both
          // show up after a sloppy resume parse.
          const seen = new Set<string>();
          const unique = tokens.filter((tok) => {
            const k = tok.toLowerCase();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
          setSkillsInput(unique.join(", "));
        }
      })
      .catch(() => {
        if (alive) setResumeHydrationError(t("pivotExplorer.skills.hydrationError"));
      })
      .finally(() => {
        if (alive) setHydratingFromResume(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromResume]);

  const skills = useMemo(
    () => skillsInput.split(",").map((s) => s.trim()).filter(Boolean),
    [skillsInput],
  );

  const ranked = useMemo(() => rankSectors(skills), [skills]);

  if (focusSector) {
    return <PivotDrilldown sector={focusSector} userSkills={skills} />;
  }

  return (
    <AppShell bgClassName="bg-background">
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pb-12 pt-8 sm:px-6">
        <ToolTitleBlock
          icon={<Compass />}
          chips={<MonoChip>{t("pivotExplorer.chip")}</MonoChip>}
          title={t("pivotExplorer.title")}
          description={t("pivotExplorer.description")}
        />

        <Card>
          <CardHeader>
            <CardTitle>{t("pivotExplorer.skills.title")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Label htmlFor="skills" className="text-muted-foreground">
              {t("pivotExplorer.skills.hint")}
            </Label>
            <Input
              id="skills"
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
              placeholder={t("pivotExplorer.skills.placeholder")}
              disabled={hydratingFromResume}
              className="min-h-[44px]"
            />
            {hydratingFromResume && (
              <p className="text-xs text-muted-foreground">{t("pivotExplorer.skills.loading")}</p>
            )}
            {resumeHydrationError && (
              <p className="text-xs text-amber-700 dark:text-amber-400">{resumeHydrationError}</p>
            )}
            {!hydratingFromResume && skills.length > 0 && (
              <p className="font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">
                {t("pivotExplorer.skills.matching", { count: skills.length })}
              </p>
            )}
          </CardContent>
        </Card>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            {skills.length > 0 ? t("pivotExplorer.ranked.matched") : t("pivotExplorer.ranked.all")}
          </h2>
          <ol className="flex flex-col gap-3">
            {ranked.map(({ meta, matchedSkills }, idx) => (
              <li key={meta.slug}>
                <Card>
                  <CardContent className="flex flex-col gap-3 p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          aria-hidden="true"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent font-mono text-sm font-semibold text-primary"
                        >
                          {idx + 1}
                        </span>
                        <h3 className="pt-1 text-lg font-semibold leading-snug">{meta.label}</h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <MonoChip>
                          {t("pivotExplorer.resilienceChip", {
                            level: t(RESILIENCE_LABEL_KEYS[meta.aiResilience]),
                          })}
                        </MonoChip>
                        {matchedSkills.length > 0 && (
                          <MonoChip tone="free">
                            {t("pivotExplorer.ranked.bridgesMatched", { count: matchedSkills.length })}
                          </MonoChip>
                        )}
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{meta.tagline}</p>
                    {matchedSkills.length > 0 && (
                      <p className="text-sm">
                        <span className="font-medium">{t("pivotExplorer.ranked.bridgesHit")} </span>
                        {matchedSkills.join(" · ")}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button asChild className="min-h-[44px] gap-2">
                        <Link to={`/pivot-explorer?to=${meta.slug}`}>
                          {t("pivotExplorer.ranked.drillDown")}
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="min-h-[44px]">
                        <Link to={`/sectors/${meta.slug}`}>{t("pivotExplorer.ranked.sectorPage")}</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </AppShell>
  );
}
