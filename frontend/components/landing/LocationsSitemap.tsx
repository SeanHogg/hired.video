/**
 * LocationsSitemap — country → state → top-cities tree, fed by
 * /api/locations/sitemap. Single shared component used by both:
 *
 *   - /sitemap/locations page (variant="expanded", full collapsible tree)
 *   - Expanded Footer locations column (variant="footer-grid", flat list
 *     of top countries + a "Browse all locations →" link)
 *
 * Per DRY rule: ONE component, two variants, fed from the same backend
 * endpoint; no prop-drilled `mode` boolean from the consumer.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";

interface CityEntry {
  id: string;
  name: string;
  slug: string;
  population: number | null;
}
interface StateEntry {
  id: string;
  name: string;
  code: string | null;
  population: number | null;
  cities: CityEntry[];
}
interface CountryEntry {
  id: number;
  name: string;
  iso2: string;
  population: number | null;
  states: StateEntry[];
}

export interface LocationsSitemapProps {
  variant: "expanded" | "footer-grid";
}

const FOOTER_TOP_COUNTRIES = ["US", "CA", "GB", "AU", "MX"];

export function LocationsSitemap({ variant }: LocationsSitemapProps): JSX.Element {
  const [tree, setTree] = useState<CountryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiClient.get<CountryEntry[]>("/api/locations/sitemap", undefined, {
          suppressErrorEvent: true,
        });
        if (cancelled) return;
        setTree(res.data ?? []);
      } catch {
        if (cancelled) return;
        setError("Could not load locations.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-sm text-muted-foreground">{error}</p>;
  if (!tree) {
    return (
      <div className="space-y-3">
        {Array.from({ length: variant === "footer-grid" ? 5 : 3 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  if (variant === "footer-grid") {
    const topCountries = tree.filter((c) => FOOTER_TOP_COUNTRIES.includes(c.iso2));
    return (
      <div className="md:col-span-2">
        <h3 className="font-semibold text-foreground mb-4">Browse by location</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {topCountries.map((country) => {
            // Show country + a curated handful of top states (by population)
            // — enough SEO surface area without bloating the footer.
            const topStates = country.states
              .slice()
              .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
              .slice(0, 4);
            return (
              <div key={country.id}>
                <Link
                  to={`/in/${country.iso2.toLowerCase()}`}
                  className="font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {country.name}
                </Link>
                <div className="pl-2 space-y-1">
                  {topStates.map((s) => (
                    <Link
                      key={s.id}
                      to={`/in/${country.iso2.toLowerCase()}/${(s.code ?? s.name).toLowerCase()}`}
                      className="block text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {s.name}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4">
          <Link
            to="/sitemap/locations"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Browse all locations →
          </Link>
        </div>
      </div>
    );
  }

  // Expanded — full collapsible tree for the /sitemap/locations page.
  return (
    <div className="space-y-4">
      {tree.map((country) => (
        <CountryNode key={country.id} country={country} />
      ))}
    </div>
  );
}

function CountryNode({ country }: { country: CountryEntry }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} aria-label={open ? "Collapse" : "Expand"}>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          <Link to={`/in/${country.iso2.toLowerCase()}`} className="font-semibold hover:underline">
            {country.name}
          </Link>
          {country.states.length > 0 && (
            <span className="text-sm text-muted-foreground">
              ({country.states.length} {country.states.length === 1 ? "region" : "regions"})
            </span>
          )}
        </div>
      </div>
      {open && country.states.length > 0 && (
        <div className="mt-3 pl-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {country.states.map((s) => (
            <div key={s.id}>
              <Link
                to={`/in/${country.iso2.toLowerCase()}/${(s.code ?? s.name).toLowerCase()}`}
                className="text-sm font-medium hover:underline"
              >
                {s.name}
              </Link>
              {s.cities.length > 0 && (
                <div className="pl-3 mt-1 space-y-0.5">
                  {s.cities.map((city) => (
                    <Link
                      key={city.id}
                      to={`/in/${country.iso2.toLowerCase()}/${(s.code ?? s.name).toLowerCase()}/${city.slug}`}
                      className="block text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {city.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
