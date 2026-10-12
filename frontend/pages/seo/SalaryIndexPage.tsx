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
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { SeoHero } from "@/components/landing/SeoHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { SeoCrumbs } from "@/components/landing/SeoCrumbs";
import { titleCase } from "@/components/landing/seo-format";
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

export default function SalaryIndexPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const [data, setData] = useState<SalaryIndex | null>(null);
  const [loading, setLoading] = useState(true);

  // Meta (incl. pinned canonical) lives in the central PAGE_SEO entry for
  // /salary (gap #1968).
  useSEO(location.pathname);
  useBreadcrumbs([
    { name: t("labels.jobs"), url: "/jobs" },
    { name: t("seoLanding.salary.guides"), url: "/salary" },
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
      <SeoCrumbs
        items={[
          { label: t("labels.home"), to: "/" },
          { label: t("labels.jobs"), to: "/jobs" },
          { label: t("seoLanding.salary.guides") },
        ]}
      />
      <SeoHero
        className="pt-8"
        eyebrow={t("seoLanding.salary.eyebrow")}
        title={t("seoLanding.salary.guides")}
        lede={t("seoLanding.salary.indexLede")}
        secondary={{ to: "/jobs", label: t("audienceHiring.browseJobs") }}
      />

      {loading && (
        <div className="flex justify-center pb-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label={t("status.loading")} />
        </div>
      )}

      {!loading && data && (
        <>
          <MarketingBand tone="card" labelledBy="salary-roles-title" className="flex flex-col gap-8">
            <MarketingSectionIntro id="salary-roles-title" title={t("seoLanding.salary.popularRoles")} />
            {data.roles.length === 0 ? (
              <p className="text-muted-foreground">{t("seoLanding.salary.noRoles")}</p>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-x-6">
                {data.roles.slice(0, 40).map((r) => (
                  <li key={r.slug} className="border-b border-border">
                    <Link
                      to={`/salary/${r.slug}`}
                      className="flex min-h-[44px] items-center justify-between gap-3 text-[15px] text-foreground hover:text-primary"
                    >
                      <span>{titleCase(r.title)}</span>
                      <span className="font-mono text-xs text-muted-foreground">{r.jobCount}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </MarketingBand>

          <MarketingBand labelledBy="salary-cities-title" className="flex flex-col gap-8">
            <MarketingSectionIntro id="salary-cities-title" title={t("seoLanding.salary.popularCities")} />
            {data.cities.length === 0 ? (
              <p className="text-muted-foreground">{t("seoLanding.salary.noCities")}</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-5">
                {/* Static (non-collapsible) city × role grid: every leaf
                    `/salary/:role/:city` link sits in the rendered DOM so
                    crawlers see the full internal link graph and the leaf
                    pages get the internal-PageRank signal. (#1212 — the
                    former <details> hid these behind a click.) Role list is
                    already capped at 6/city and cities at 30, so the link
                    count stays bounded. */}
                {data.cities.slice(0, 30).map((city) => (
                  <div key={city.slug} className="flex flex-col gap-2 rounded-[20px] border border-border bg-card p-5">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-display text-lg font-bold tracking-[-0.01em]">{city.label}</h3>
                      <span className="font-mono text-xs text-muted-foreground">{city.jobCount}</span>
                    </div>
                    <ul className="flex flex-col">
                      {data.roles.slice(0, 6).map((r) => (
                        <li key={`${city.slug}-${r.slug}`}>
                          <Link
                            to={`/salary/${r.slug}/${city.slug}`}
                            className="block py-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
                          >
                            {t("seoLanding.salary.roleInCity", { role: titleCase(r.title), city: city.label })}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </MarketingBand>
        </>
      )}

      <SeoFinalCta id="salary-index" title={t("landing.final.title")} />
    </AppShell>
  );
}
