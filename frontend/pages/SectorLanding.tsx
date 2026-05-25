/**
 * /sectors/:sector — vertical landing page for an AI-resilient sector.
 *
 * One page handles every sector via the `:sector` param + the shared
 * SectorMeta SSoT. Per the DRY rule: no per-sector hardcoded pages.
 *
 * Sections (in order):
 *   1. Hero — sector label + tagline + honest AI-resilience badge
 *   2. AI-resilience reality check — quotes `aiResilienceNotes`
 *   3. Example roles + licensure notes
 *   4. Live jobs in this sector (top 8 from /api/Job/public?sector=…)
 *   5. Articles split by audience (job_seeker / recruiter / pivot / resume_guide)
 *   6. Recommended resume template + link to gallery
 *   7. CTA: post a job (employers) / start a pivot (seekers)
 */

import { Link, useParams, Navigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import {
  isValidSector,
  sectorMeta,
  type AIResilience,
} from "@shared/sectors";
import { sectorTemplateRec } from "@shared/sector-templates";

const RESILIENCE_LABEL: Record<AIResilience, string> = {
  high: "AI-resilient (high)",
  medium: "AI-resilient (mixed)",
  low: "AI-exposed",
};

const RESILIENCE_VARIANT: Record<AIResilience, "default" | "secondary" | "outline"> = {
  high: "default",
  medium: "secondary",
  low: "outline",
};

export default function SectorLanding() {
  const { sector: rawSector } = useParams<{ sector: string }>();
  useSEO("/sectors");
  useBreadcrumbs(
    rawSector && isValidSector(rawSector)
      ? [
          { name: "Sectors", url: "/sectors" },
          { name: sectorMeta(rawSector).label, url: `/sectors/${rawSector}` },
        ]
      : [{ name: "Sectors", url: "/sectors" }],
  );

  if (!rawSector || !isValidSector(rawSector)) {
    return <Navigate to="/sectors" replace />;
  }

  const meta = sectorMeta(rawSector);
  const rec = sectorTemplateRec(rawSector);

  return (
    <AppShell bgClassName="bg-background">
      <main className="pt-16 pb-20">
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-6 py-12">
          <div className="space-y-4">
            <Badge variant={RESILIENCE_VARIANT[meta.aiResilience]}>
              {RESILIENCE_LABEL[meta.aiResilience]}
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight">{meta.label}</h1>
            <p className="text-lg text-muted-foreground max-w-3xl">{meta.tagline}</p>
            <div className="flex flex-wrap gap-3 pt-2">
              {!meta.contentOnly && (
                <Button asChild>
                  <Link to={`/jobs?sector=${meta.slug}`}>Browse {meta.label} jobs</Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link to={`/articles?sector=${meta.slug}`}>Read articles</Link>
              </Button>
              {meta.slug !== "tech" && (
                <Button asChild variant="ghost">
                  <Link to={`/pivot-explorer?to=${meta.slug}`}>Pivot from tech →</Link>
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* AI-resilience reality check */}
        <section className="max-w-6xl mx-auto px-6 py-8">
          <Card>
            <CardHeader>
              <CardTitle>AI-resilience: the honest read</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{meta.aiResilienceNotes}</p>
            </CardContent>
          </Card>
        </section>

        {/* Example roles + licensure */}
        <section className="max-w-6xl mx-auto px-6 py-8 grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Roles worth targeting</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {meta.exampleRoles.map((r) => (
                  <li key={r} className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          {meta.requiresLicense && meta.licensingNotes && (
            <Card>
              <CardHeader>
                <CardTitle>Licensing &amp; credentialing</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{meta.licensingNotes}</p>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Recommended resume template */}
        <section className="max-w-6xl mx-auto px-6 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Recommended resume template</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="font-medium text-lg">{rec.displayName}</p>
                <p className="text-muted-foreground text-sm mt-1">{rec.rationale}</p>
              </div>
              <Button asChild>
                <Link to={`/resume-templates?sector=${meta.slug}`}>
                  Open template in studio →
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Pivot CTA */}
        {meta.transferableFromTech.length > 0 && meta.slug !== "tech" && (
          <section className="max-w-6xl mx-auto px-6 py-8">
            <Card className="bg-muted/30">
              <CardHeader>
                <CardTitle>Pivoting from tech?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Tech-leaving candidates entering {meta.label} already bring:
                </p>
                <ul className="space-y-2 mb-4">
                  {meta.transferableFromTech.map((s) => (
                    <li key={s} className="flex items-start gap-2">
                      <span className="text-primary">→</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild variant="default">
                  <Link to={`/pivot-explorer?to=${meta.slug}`}>
                    Map your skills against {meta.label} →
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </section>
        )}
      </main>
    </AppShell>
  );
}
