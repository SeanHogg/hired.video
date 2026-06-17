/**
 * /salary — index page for the programmatic salary SEO surface.
 *
 * Lists popular roles + popular cities and lets visitors jump to
 * /salary/:jobSlug or /salary/:jobSlug/:locationSlug. Pure SEO content:
 * the grid + crosslinks are what gives the leaf pages internal PageRank.
 *
 * Data comes from /api/discovery/seo/salary-index, which is itself
 * derived from active job listings (no manual curation).
 */

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { DollarSign, Loader2, MapPin, TrendingUp } from "lucide-react";

import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";

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
interface SalaryIndex {
  roles: PopularRole[];
  cities: PopularCity[];
}

function titleCase(input: string) {
  return input
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export default function SalaryIndexPage() {
  const location = useLocation();
  const [data, setData] = useState<SalaryIndex | null>(null);
  const [loading, setLoading] = useState(true);

  // Meta (incl. pinned canonical) lives in the central PAGE_SEO entry for
  // /salary (gap #1968).
  useSEO(location.pathname);
  useBreadcrumbs([
    { name: "Jobs", url: "/jobs" },
    { name: "Salary Guides", url: "/salary" },
  ]);

  useEffect(() => {
    setLoading(true);
    apiClient
      .get<SalaryIndex>("/api/discovery/seo/salary-index", null as any)
      .then((res: any) => setData(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell bgClassName="bg-background">
      <div className="px-4 py-10 sm:px-6 lg:px-8 space-y-8">
        <nav className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Link to="/" className="hover:text-foreground">
            Home
          </Link>
          <span>/</span>
          <Link to="/jobs" className="hover:text-foreground">
            Jobs
          </Link>
          <span>/</span>
          <span className="text-foreground">Salary Guides</span>
        </nav>

        <header className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Salary Guides</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              Real compensation data from active listings on hired.video. Pick a
              role to see the range, or drill into a specific city.
            </p>
          </div>
        </header>

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Popular roles
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No role data yet.
                  </p>
                ) : (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                    {data.roles.slice(0, 40).map((r) => (
                      <li key={r.slug}>
                        <Link
                          to={`/salary/${r.slug}`}
                          className="block py-1.5 text-sm hover:underline"
                        >
                          {titleCase(r.title)}{" "}
                          <span className="text-xs text-muted-foreground">
                            ({r.jobCount})
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Popular cities
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.cities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No city data yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                    {/* Static (non-collapsible) city × role grid: every leaf
                        `/salary/:role/:city` link sits in the rendered DOM so
                        crawlers see the full internal link graph and the leaf
                        pages get the internal-PageRank signal. (#1212 — the
                        former <details> hid these behind a click.) Role list is
                        already capped at 6/city and cities at 30, so the link
                        count stays bounded. */}
                    {data.cities.slice(0, 30).map((city) => (
                      <div key={city.slug} className="py-1.5">
                        <div className="text-sm font-medium flex items-center gap-1">
                          <span>{city.label}</span>
                          <span className="text-xs text-muted-foreground">
                            ({city.jobCount})
                          </span>
                        </div>
                        <ul className="mt-1 ml-1 border-l pl-3 space-y-1">
                          {data.roles.slice(0, 6).map((r) => (
                            <li key={`${city.slug}-${r.slug}`}>
                              <Link
                                to={`/salary/${r.slug}/${city.slug}`}
                                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                              >
                                {titleCase(r.title)} in {city.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
