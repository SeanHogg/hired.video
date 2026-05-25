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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import {
  isValidSector,
  pivotTargetSectors,
  sectorMeta,
  type Sector,
  type SectorMeta,
} from "@shared/sectors";
import { sectorTemplateRec } from "@shared/sector-templates";
import { resumeService } from "@/lib/services/resume-service";

interface ScoredSector {
  meta: SectorMeta;
  matchScore: number;
  matchedSkills: string[];
}

function scoreSector(meta: SectorMeta, userSkills: string[]): ScoredSector {
  const userLower = userSkills.map((s) => s.toLowerCase().trim()).filter(Boolean);
  const matched: string[] = [];
  for (const bridge of meta.transferableFromTech) {
    const bridgeLower = bridge.toLowerCase();
    for (const skill of userLower) {
      if (skill.length < 3) continue;
      if (bridgeLower.includes(skill) || skill.includes(bridgeLower.split(" ")[0] ?? "")) {
        matched.push(bridge);
        break;
      }
    }
  }
  // Baseline score: count of transferable bridges (richer = more credible pivot)
  // Bonus: number of user skills that hit bridges
  const matchScore = meta.transferableFromTech.length + matched.length * 3;
  return { meta, matchScore, matchedSkills: matched };
}

function rankSectors(userSkills: string[]): ScoredSector[] {
  return pivotTargetSectors()
    .map((m) => scoreSector(m, userSkills))
    .sort((a, b) => b.matchScore - a.matchScore);
}

export default function PivotExplorer() {
  useSEO("/pivot-explorer");
  useBreadcrumbs([{ name: "Pivot Explorer", url: "/pivot-explorer" }]);

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
        for (const skill of resume.skills ?? []) {
          if (skill.name) tokens.push(skill.name);
          for (const kw of skill.keywords ?? []) {
            if (kw) tokens.push(kw);
          }
        }
        if (tokens.length > 0) {
          // De-dupe case-insensitively so "Python" + "python" don't both
          // show up after a sloppy resume parse.
          const seen = new Set<string>();
          const unique = tokens.filter((t) => {
            const k = t.toLowerCase();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
          setSkillsInput(unique.join(", "));
        }
      })
      .catch(() => {
        if (alive) setResumeHydrationError("Couldn't load that resume — fill in skills manually below.");
      })
      .finally(() => {
        if (alive) setHydratingFromResume(false);
      });
    return () => {
      alive = false;
    };
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
      <main className="pt-16 pb-20 max-w-6xl mx-auto px-6">
        <section className="py-12 space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">Pivot Explorer</h1>
          <p className="text-lg text-muted-foreground max-w-3xl">
            Map your current skills against AI-resilient sectors. Sectors
            are ranked by how cleanly your background bridges in. Enter
            your top skills to refine the ranking.
          </p>
        </section>

        <section className="pb-8">
          <Card>
            <CardHeader>
              <CardTitle>Your skills</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="skills">
                Comma-separated. Leave blank to see the default ranking.
              </Label>
              <Input
                id="skills"
                value={skillsInput}
                onChange={(e) => setSkillsInput(e.target.value)}
                placeholder="e.g. python, on-call rotations, incident response, sql, customer support"
                disabled={hydratingFromResume}
              />
              {hydratingFromResume && (
                <p className="text-xs text-muted-foreground">Loading skills from your resume…</p>
              )}
              {resumeHydrationError && (
                <p className="text-xs text-amber-600">{resumeHydrationError}</p>
              )}
              {!hydratingFromResume && skills.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Matching {skills.length} skill{skills.length === 1 ? "" : "s"} against sector bridges.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="pb-12 space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            {skills.length > 0 ? "Ranked by skill match" : "All AI-resilient sectors"}
          </h2>
          <div className="space-y-3">
            {ranked.map(({ meta, matchScore, matchedSkills }, idx) => (
              <Card key={meta.slug}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">
                      {idx + 1}. {meta.label}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{meta.aiResilience} resilience</Badge>
                      {matchedSkills.length > 0 && (
                        <Badge variant="default">{matchedSkills.length} bridge{matchedSkills.length === 1 ? "" : "s"} matched</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">{meta.tagline}</p>
                  {matchedSkills.length > 0 && (
                    <div className="text-sm">
                      <span className="font-medium">Bridges your skills hit: </span>
                      {matchedSkills.join(" · ")}
                    </div>
                  )}
                  <div className="pt-2 flex gap-2">
                    <Button asChild size="sm">
                      <Link to={`/pivot-explorer?to=${meta.slug}`}>Drill down</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/sectors/${meta.slug}`}>Sector page</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function PivotDrilldown({ sector, userSkills }: { sector: Sector; userSkills: string[] }) {
  const meta = sectorMeta(sector);
  const rec = sectorTemplateRec(sector);
  const scored = scoreSector(meta, userSkills);

  return (
    <AppShell bgClassName="bg-background">
      <main className="pt-16 pb-20 max-w-6xl mx-auto px-6">
        <section className="py-10 space-y-3">
          <Link to="/pivot-explorer" className="text-sm text-muted-foreground hover:underline">
            ← All sectors
          </Link>
          <h1 className="text-4xl font-bold tracking-tight">
            Pivoting into {meta.label}
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl">{meta.tagline}</p>
        </section>

        <section className="pb-6">
          <Card>
            <CardHeader>
              <CardTitle>AI-resilience reality check</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{meta.aiResilienceNotes}</p>
            </CardContent>
          </Card>
        </section>

        <section className="pb-6">
          <Card>
            <CardHeader>
              <CardTitle>Skills you bring from tech</CardTitle>
            </CardHeader>
            <CardContent>
              {meta.transferableFromTech.length === 0 ? (
                <p className="text-muted-foreground">
                  No specific transferable-skills story documented for this
                  sector yet. Expect to lead the pivot on general
                  professionalism (communication, written process discipline,
                  reliability) rather than role-specific skill carry-over.
                </p>
              ) : (
                <ul className="space-y-2">
                  {meta.transferableFromTech.map((s) => (
                    <li
                      key={s}
                      className={
                        scored.matchedSkills.includes(s)
                          ? "flex items-start gap-2 font-medium"
                          : "flex items-start gap-2"
                      }
                    >
                      <span className="text-primary">→</span>
                      <span>{s}</span>
                      {scored.matchedSkills.includes(s) && (
                        <Badge variant="default" className="text-xs">your skill</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {meta.requiresLicense && meta.licensingNotes && (
          <section className="pb-6">
            <Card>
              <CardHeader>
                <CardTitle>What you need to acquire</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{meta.licensingNotes}</p>
              </CardContent>
            </Card>
          </section>
        )}

        <section className="pb-6">
          <Card>
            <CardHeader>
              <CardTitle>Order of operations</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 list-decimal list-inside">
                <li>Verify the licensure path for your state — costs and timelines vary by 2–3×.</li>
                <li>Pick one entry role from: {meta.exampleRoles.slice(0, 3).join(", ")}.</li>
                <li>Build a resume in the recommended template (below).</li>
                <li>
                  <Link to={`/articles?sector=${meta.slug}&audience=pivot`} className="underline">
                    Read the full pivot guide
                  </Link>{" "}
                  for this sector.
                </li>
                <li>
                  Apply through{" "}
                  <Link to={`/jobs?sector=${meta.slug}`} className="underline">
                    {meta.label} jobs
                  </Link>{" "}
                  on hired.video.
                </li>
              </ol>
            </CardContent>
          </Card>
        </section>

        <section className="pb-12">
          <Card className="border-primary">
            <CardHeader>
              <CardTitle>Recommended template: {rec.displayName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">{rec.rationale}</p>
              <Button asChild>
                <Link to={`/resume-templates?sector=${meta.slug}`}>
                  Open template gallery →
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
    </AppShell>
  );
}
