/**
 * /in/[country]/[state?]/[city?] — geographic Resource Map (#1628).
 *
 * Resolves the slug triple via /api/locations/resolve, then renders the
 * SAME <ResourceMap> stack the audience pages use — just on the geo axis
 * instead of the audience axis (#1663). One render surface for both
 * axes; new card features land once, not twice.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import MarketingFAQ from "@/components/MarketingFAQ";
import { ResourceMap } from "@/components/landing/ResourceMap";
import { useSEO } from "@/lib/seo";
import { apiClient } from "@/lib/api-client";

interface ResolvedLocation {
  country: { id: number; name: string; iso2: string };
  state: { id: string; name: string; code: string | null } | null;
  city: { id: string; name: string; slug: string } | null;
}

export default function LocationLandingPage(): JSX.Element {
  const params = useParams<{ country: string; state?: string; city?: string }>();
  const location = useLocation();

  const [resolved, setResolved] = useState<ResolvedLocation | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "notfound">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    void (async () => {
      const url = new URL("/api/locations/resolve", window.location.origin);
      url.searchParams.set("country", params.country ?? "");
      if (params.state) url.searchParams.set("state", params.state);
      if (params.city) url.searchParams.set("city", params.city);
      try {
        const res = await apiClient.get<ResolvedLocation>(url.pathname + url.search, undefined, {
          suppressErrorEvent: true,
        });
        if (cancelled) return;
        if (!res.data) {
          setStatus("notfound");
          return;
        }
        setResolved(res.data);
        setStatus("ok");
      } catch {
        if (cancelled) return;
        setStatus("notfound");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.country, params.state, params.city]);

  const headerTitle = useMemo(() => {
    if (!resolved) return "";
    if (resolved.city) {
      return `${resolved.city.name}, ${resolved.state?.code ?? resolved.state?.name ?? resolved.country.iso2}`;
    }
    if (resolved.state) return `${resolved.state.name}, ${resolved.country.iso2}`;
    return resolved.country.name;
  }, [resolved]);

  const subTitle = useMemo(() => {
    if (!resolved) return "";
    if (resolved.city) return `Jobs, employers, and resources for ${resolved.city.name}.`;
    if (resolved.state) return `Browse opportunities across ${resolved.state.name}.`;
    return `Explore work and opportunities in ${resolved.country.name}.`;
  }, [resolved]);

  useSEO(
    location.pathname,
    resolved
      ? {
          title: `${headerTitle} — Jobs & Career Resources · hired.video`,
          description: subTitle,
          ogTitle: `${headerTitle} on hired.video`,
          ogDescription: subTitle,
        }
      : undefined,
  );

  if (status === "loading") {
    return (
      <AppShell bgClassName="bg-background">
        <div className="px-4 py-20 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-12">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  if (status === "notfound" || !resolved) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="px-4 py-20 text-center max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">Location not found</h1>
          <p className="text-muted-foreground mb-6">We couldn't find a page for that location. Try the sitemap.</p>
          <Button asChild>
            <Link to="/sitemap/locations">Browse all locations</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell bgClassName="bg-background">
      <section className="px-4 py-20 text-center sm:px-6 lg:px-8 bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        <div className="max-w-3xl mx-auto">
          <Badge variant="outline" className="mb-4">{resolved.country.iso2}</Badge>
          <h1 className="mb-4 text-5xl font-bold">{headerTitle}</h1>
          <p className="mb-8 text-xl text-muted-foreground">{subTitle}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link
                to={`/jobs?${new URLSearchParams({
                  ...(resolved.city ? { cityId: resolved.city.id } : {}),
                  ...(resolved.state ? { stateId: resolved.state.id } : {}),
                  countryId: String(resolved.country.id),
                }).toString()}`}
              >
                Browse jobs here
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/sitemap/locations">All locations</Link>
            </Button>
          </div>
        </div>
      </section>

      <ResourceMap
        filter={{
          geo: {
            countryId: resolved.country.id,
            stateId: resolved.state?.id,
            cityId: resolved.city?.id,
          },
        }}
        kinds={["job", "article", "template", "video", "learning_path"]}
        heading={`In ${headerTitle}`}
        subheading="Jobs, articles, templates, and learning paths tagged to this location."
      />

      <MarketingFAQ
        schemaId="in-location-faq"
        items={[
          { question: `Is this page just for ${headerTitle}?`, answer: "Yes — jobs, articles, templates, and video resumes tagged with this location appear here. Content is filtered geographically, not just by free-text matching." },
          { question: "How do you decide which cities get pages?", answer: "Cities with at least 10 active jobs or 1 tagged article get an auto-generated page. The top metros also get hand-curated relocation guides and key-employer lists." },
          { question: "I want to write a relocation guide. How?", answer: "Authenticated users with residency tenure on this location can submit relocation guides through the article publish flow — they earn the 'City Guide' badge plus points when accepted." },
        ]}
      />
    </AppShell>
  );
}
