/**
 * LocationsSitemap — country → state → top-cities collapsible tree for the
 * /sitemap/locations page, fed by /api/locations/sitemap.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

export function LocationsSitemap(): JSX.Element {
  const { t } = useTranslation();
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
        setError(t("seoLanding.sitemap.loadError"));
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
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {tree.map((country) => (
        <CountryNode key={country.id} country={country} />
      ))}
    </ul>
  );
}

function CountryNode({ country }: { country: CountryEntry }): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const iso = country.iso2.toLowerCase();
  const panelId = `sitemap-country-${country.id}`;
  return (
    <li className="rounded-[20px] border border-border bg-background p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={
            open
              ? t("seoLanding.sitemap.collapse", { place: country.name })
              : t("seoLanding.sitemap.expand", { place: country.name })
          }
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
        <Link
          to={`/in/${iso}`}
          className="font-display text-lg font-bold tracking-[-0.01em] text-foreground hover:text-primary hover:underline"
        >
          {country.name}
        </Link>
        {country.states.length > 0 && (
          <span className="font-mono text-xs uppercase text-muted-foreground">
            {t("seoLanding.sitemap.regions", { count: country.states.length })}
          </span>
        )}
      </div>
      {open && country.states.length > 0 && (
        <div
          id={panelId}
          className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4 border-t border-border pl-3 pt-4 sm:pl-12"
        >
          {country.states.map((s) => {
            const stateSlug = (s.code ?? s.name).toLowerCase();
            return (
              <div key={s.id}>
                <Link
                  to={`/in/${iso}/${stateSlug}`}
                  className="text-sm font-semibold text-foreground hover:text-primary hover:underline"
                >
                  {s.name}
                </Link>
                {s.cities.length > 0 && (
                  <div className="mt-1 space-y-0.5 pl-3">
                    {s.cities.map((city) => (
                      <Link
                        key={city.id}
                        to={`/in/${iso}/${stateSlug}/${city.slug}`}
                        className="block py-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {city.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}
