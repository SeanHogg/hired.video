import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { DollarSign, TrendingUp, MapPin, Briefcase, ArrowRight, Loader2 } from "lucide-react";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";
import { aiCoachHref } from "@/lib/ai-context";

interface PopularRole {
  slug: string;
  title: string;
  jobCount: number;
}
interface PopularCity {
  slug: string;
  label: string;
  jobCount: number;
}

interface SalaryData {
  jobTitle: string;
  jobSlug: string;
  location: string | null;
  locationSlug: string | null;
  currency: string;
  averageSalary: number | null;
  minSalary: number | null;
  maxSalary: number | null;
  sampleSize: number;
  relatedCities: PopularCity[];
  relatedRoles: PopularRole[];
  lastUpdated: string;
}

function fmt(n: number | null) {
  if (!n) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function slugToTitle(slug: string) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export default function SalaryPage() {
  const { jobSlug, locationSlug } = useParams<{ jobSlug: string; locationSlug?: string }>();
  const location = useLocation();
  const [data, setData] = useState<SalaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const roleTitle = data?.jobTitle ? slugToTitle(data.jobSlug) : slugToTitle(jobSlug ?? "");
  const locationLabel = locationSlug ? slugToTitle(locationSlug) : null;
  const headingSuffix = locationLabel ? ` in ${locationLabel}` : "";
  const pageTitle = `${roleTitle} Salary${headingSuffix}`;

  useSEO(location.pathname, {
    title: `${pageTitle} — hired.video`,
    description: data?.averageSalary
      ? `${roleTitle}${headingSuffix} salaries average ${fmt(data.averageSalary)} based on ${data.sampleSize} active listings on hired.video.`
      : `${roleTitle}${headingSuffix} salary data from active job listings on hired.video.`,
    canonical: `https://hired.video${location.pathname}`,
  });
  useBreadcrumbs(
    locationLabel
      ? [
          { name: "Jobs", url: "/jobs" },
          { name: "Salary Guides", url: "/salary" },
          { name: `${roleTitle} Salary`, url: `/salary/${jobSlug ?? ""}` },
          { name: locationLabel, url: location.pathname },
        ]
      : [
          { name: "Jobs", url: "/jobs" },
          { name: "Salary Guides", url: "/salary" },
          { name: `${roleTitle} Salary`, url: location.pathname },
        ],
  );

  useEffect(() => {
    if (!jobSlug) return;
    setLoading(true);
    setError(false);
    const path = locationSlug
      ? `/api/discovery/seo/salary/${jobSlug}/${locationSlug}`
      : `/api/discovery/seo/salary/${jobSlug}`;
    apiClient
      .get(path, null as any)
      .then((res: any) => setData(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [jobSlug, locationSlug]);

  return (
    <AppShell bgClassName="bg-background">
      <div className="px-4 py-12 sm:px-6 lg:px-8">

          {/* Breadcrumb */}
          <nav className="text-xs text-muted-foreground mb-6 flex items-center gap-1.5 flex-wrap">
            <Link to="/" className="hover:text-foreground">Home</Link>
            <span>/</span>
            <Link to="/jobs" className="hover:text-foreground">Jobs</Link>
            <span>/</span>
            <Link to="/salary" className="hover:text-foreground">Salary Guides</Link>
            <span>/</span>
            {locationLabel ? (
              <>
                <Link to={`/salary/${jobSlug ?? ""}`} className="hover:text-foreground">
                  {roleTitle} Salary
                </Link>
                <span>/</span>
                <span className="text-foreground">{locationLabel}</span>
              </>
            ) : (
              <span className="text-foreground">{roleTitle} Salary</span>
            )}
          </nav>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-3xl font-bold">{pageTitle} Guide</h1>
          </div>
          <p className="text-muted-foreground mb-8">
            Real salary data from active job listings on hired.video. Updated regularly.
          </p>

          {loading && (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Salary data unavailable for this role right now. <Link to="/jobs" className="text-primary underline">Browse jobs instead</Link>.</p>
              </CardContent>
            </Card>
          )}

          {data && !loading && (
            <div className="space-y-6">
              {/* Main salary card */}
              <Card className="border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-muted-foreground font-normal">
                    <TrendingUp className="w-4 h-4" /> Average annual salary{locationLabel ? ` in ${locationLabel}` : ""}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-5xl font-black text-foreground">{fmt(data.averageSalary)}</p>
                  <p className="text-sm text-muted-foreground mt-1">Based on {data.sampleSize} listings · Last updated {new Date(data.lastUpdated).toLocaleDateString()}</p>
                </CardContent>
              </Card>

              {/* Range */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-5">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Entry level</p>
                    <p className="text-2xl font-bold">{fmt(data.minSalary)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Senior level</p>
                    <p className="text-2xl font-bold">{fmt(data.maxSalary)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Salary in other cities — only on the role-level page */}
              {!locationSlug && data.relatedCities.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="w-4 h-4" /> {roleTitle} salary by city
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                      {data.relatedCities.map((city) => (
                        <li key={city.slug}>
                          <Link
                            to={`/salary/${data.jobSlug}/${city.slug}`}
                            className="text-sm hover:underline"
                          >
                            {city.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Related roles — present on both leaf + role pages */}
              {data.relatedRoles.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Briefcase className="w-4 h-4" /> Related roles
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                      {data.relatedRoles.map((r) => (
                        <li key={r.slug}>
                          <Link
                            to={
                              locationSlug
                                ? `/salary/${r.slug}/${locationSlug}`
                                : `/salary/${r.slug}`
                            }
                            className="text-sm hover:underline"
                          >
                            {slugToTitle(r.title)}{locationLabel ? ` in ${locationLabel}` : ""}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* FAQ-style content for SEO */}
              <div className="prose prose-sm max-w-none text-foreground space-y-5 pt-4 border-t border-border">
                <h2 className="text-lg font-semibold">How much does a {roleTitle} make{locationLabel ? ` in ${locationLabel}` : ""}?</h2>
                <p>
                  The average {roleTitle} salary{locationLabel ? ` in ${locationLabel}` : ""} is <strong>{fmt(data.averageSalary)}</strong> per year,
                  ranging from {fmt(data.minSalary)} at the entry level to {fmt(data.maxSalary)} for senior roles.
                  Compensation varies based on years of experience, company size, industry, and location.
                </p>

                <h2 className="text-lg font-semibold">What factors affect {roleTitle} salaries?</h2>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li><strong>Experience:</strong> Senior professionals typically earn 40–60% more than entry-level.</li>
                  <li><strong>Location:</strong> Tech hubs (San Francisco, New York, Seattle) pay 20–40% above national average.</li>
                  <li><strong>Industry:</strong> Finance and tech companies generally offer higher total compensation.</li>
                  <li><strong>Company size:</strong> Enterprise roles often include equity, bonuses, and better benefits.</li>
                </ul>

                <h2 className="text-lg font-semibold">How to negotiate your {roleTitle} salary</h2>
                <p>
                  Use this data as your baseline. Research the specific company's pay band using Levels.fyi or Glassdoor,
                  then anchor 10–15% above your target. Ask your AI CHRO for a personalized negotiation script.
                </p>
              </div>

              {/* CTA */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button asChild className="gap-2">
                  <Link to={`/jobs?q=${encodeURIComponent(roleTitle)}${locationLabel ? `&location=${encodeURIComponent(locationLabel)}` : ""}`}>
                    <Briefcase className="w-4 h-4" /> Browse {roleTitle} Jobs
                  </Link>
                </Button>
                <Button variant="outline" asChild className="gap-2">
                  <Link to={aiCoachHref(`Help me negotiate my salary as a ${roleTitle}`)}>
                    Ask AI CHRO <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </div>
    </AppShell>
  );
}
