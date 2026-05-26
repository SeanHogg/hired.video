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
 *   4. Live jobs in this sector (top 8 from `/api/Job?sector=…`,
 *      omitted for content-only sectors like politics_civic)
 *   5. Top articles in this sector (top 4 from `/api/articles/public?sector=…`)
 *   6. Recommended resume template + link to gallery
 *   7. CTA: pivot from tech (job seekers)
 */

import { useEffect, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import {
  isValidSector,
  sectorMeta,
  type AIResilience,
  type Sector,
} from "@shared/sectors";
import { sectorTemplateRec } from "@shared/sector-templates";
import { jobService, type JobSummary } from "@/lib/services/job-service";
import { articleService, type PublicArticleCard } from "@/lib/services/article-service";
import { ArticleCard } from "@/components/article/ArticleCard";

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

interface SectorLiveData {
  jobs: JobSummary[];
  articles: PublicArticleCard[];
  loading: boolean;
}

/**
 * Co-located fetch hook — keeps the data dependencies of SectorLanding
 * in one place. Skips the jobs fetch for content-only sectors since
 * `politics_civic` has no recruitable jobs by design.
 */
function useSectorLiveData(sector: Sector, contentOnly: boolean): SectorLiveData {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [articles, setArticles] = useState<PublicArticleCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const jobsPromise = contentOnly
      ? Promise.resolve({ items: [] as JobSummary[] })
      : jobService.getPublicJobs({ sector, limit: 8 }).catch(() => ({ items: [] as JobSummary[] }));
    const articlesPromise = articleService
      .listPublished({ sector, limit: 4 })
      .catch(() => [] as PublicArticleCard[]);
    void Promise.all([jobsPromise, articlesPromise]).then(([jobsRes, articlesRes]) => {
      if (!alive) return;
      setJobs((jobsRes as { items: JobSummary[] }).items ?? []);
      setArticles(articlesRes);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [sector, contentOnly]);

  return { jobs, articles, loading };
}

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
  const { jobs, articles, loading } = useSectorLiveData(meta.slug, meta.contentOnly);

  return (
    <AppShell bgClassName="bg-background">
      <main className="pb-20">
        {/* Hero */}
        <section className="px-6 py-12">
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
        <section className="px-6 py-8">
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
        <section className="px-6 py-8 grid grid-cols-1 md:grid-cols-2 gap-6">
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

        {/* Live jobs — omitted for content-only sectors. */}
        {!meta.contentOnly && (
          <section className="px-6 py-8 space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-2xl font-semibold tracking-tight">Open roles</h2>
              <Link to={`/jobs?sector=${meta.slug}`} className="text-sm text-primary hover:underline">
                See all →
              </Link>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading jobs…</p>
            ) : jobs.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No {meta.label} jobs tagged yet — be the first to{" "}
                  <Link to="/jobs/create" className="underline">
                    post one
                  </Link>
                  .
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {jobs.map((job) => (
                  <SectorJobTile key={job.id} job={job} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Articles */}
        <section className="px-6 py-8 space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl font-semibold tracking-tight">Sector guides</h2>
            <Link to={`/articles?sector=${meta.slug}`} className="text-sm text-primary hover:underline">
              See all →
            </Link>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading articles…</p>
          ) : articles.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No articles published for {meta.label} yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {articles.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          )}
        </section>

        {/* Recommended resume template */}
        <section className="px-6 py-8">
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
          <section className="px-6 py-8">
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

function SectorJobTile({ job }: { job: JobSummary }) {
  return (
    <Link to={`/jobs/${job.id}`}>
      <Card className="h-full hover:border-primary/50 transition-colors">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm line-clamp-2">{job.title}</CardTitle>
          {job.company && (
            <p className="text-xs text-muted-foreground line-clamp-1">{job.company}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-1 text-xs text-muted-foreground">
          {job.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              <span className="line-clamp-1">{job.location}</span>
            </div>
          )}
          {job.isRemote && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              Remote
            </Badge>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
