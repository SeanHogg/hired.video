/**
 * /salary/:jobSlug[/:locationSlug] — programmatic salary page for one role
 * (optionally one city): average + range, cross-links to other cities and
 * related roles, salary FAQ. Data: /api/discovery/seo/salary/….
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import MarketingFAQ from "@/components/MarketingFAQ";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { SeoHero } from "@/components/landing/SeoHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { SeoCrumbs, type Crumb } from "@/components/landing/SeoCrumbs";
import { PILL_LINK_CLASS } from "@/components/landing/LinkTile";
import { formatUsd, slugToTitle } from "@/components/landing/seo-format";
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

const STAT_LABEL = "font-mono text-xs uppercase tracking-[0.08em]";

export default function SalaryPage() {
  const { t, i18n } = useTranslation();
  const { jobSlug, locationSlug } = useParams<{ jobSlug: string; locationSlug?: string }>();
  const location = useLocation();
  const [data, setData] = useState<SalaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const money = (n: number | null) => formatUsd(n, i18n.language);
  const roleTitle = data?.jobTitle ? slugToTitle(data.jobSlug) : slugToTitle(jobSlug ?? "");
  const locationLabel = locationSlug ? slugToTitle(locationSlug) : null;
  const pageTitle = locationLabel
    ? t("seoLanding.salary.titleInCity", { role: roleTitle, city: locationLabel })
    : t("seoLanding.salary.title", { role: roleTitle });
  const roleSalaryLabel = t("seoLanding.salary.title", { role: roleTitle });

  useSEO(location.pathname, {
    title: t("seoLanding.salary.seoTitle", { title: pageTitle }),
    description: data?.averageSalary
      ? t("seoLanding.salary.seoDescription", { title: pageTitle, average: money(data.averageSalary), listings: data.sampleSize })
      : t("seoLanding.salary.seoDescriptionNoData", { title: pageTitle }),
    canonical: `https://hired.video${location.pathname}`,
  });
  useBreadcrumbs(
    locationLabel
      ? [
          { name: t("labels.jobs"), url: "/jobs" },
          { name: t("seoLanding.salary.guides"), url: "/salary" },
          { name: roleSalaryLabel, url: `/salary/${jobSlug ?? ""}` },
          { name: locationLabel, url: location.pathname },
        ]
      : [
          { name: t("labels.jobs"), url: "/jobs" },
          { name: t("seoLanding.salary.guides"), url: "/salary" },
          { name: roleSalaryLabel, url: location.pathname },
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

  // Memoised so MarketingFAQ's JSON-LD effect doesn't re-run every render.
  const faqItems = useMemo(() => {
    if (!data) return [];
    const where = locationLabel ? t("seoLanding.salary.inCity", { city: locationLabel }) : "";
    return [
      {
        question: t("seoLanding.salary.faq.make.q", { role: roleTitle, where }),
        answer: t("seoLanding.salary.faq.make.a", {
          role: roleTitle,
          where,
          average: formatUsd(data.averageSalary, i18n.language),
          min: formatUsd(data.minSalary, i18n.language),
          max: formatUsd(data.maxSalary, i18n.language),
        }),
      },
      {
        question: t("seoLanding.salary.faq.factors.q", { role: roleTitle }),
        answer: t("seoLanding.salary.faq.factors.a"),
      },
      {
        question: t("seoLanding.salary.faq.negotiate.q", { role: roleTitle }),
        answer: t("seoLanding.salary.faq.negotiate.a"),
      },
    ];
  }, [data, locationLabel, roleTitle, t, i18n.language]);

  const crumbs: Crumb[] = [
    { label: t("labels.home"), to: "/" },
    { label: t("labels.jobs"), to: "/jobs" },
    { label: t("seoLanding.salary.guides"), to: "/salary" },
    ...(locationLabel
      ? [{ label: roleSalaryLabel, to: `/salary/${jobSlug ?? ""}` }, { label: locationLabel }]
      : [{ label: roleSalaryLabel }]),
  ];

  const jobsHref = `/jobs?q=${encodeURIComponent(roleTitle)}${
    locationLabel ? `&location=${encodeURIComponent(locationLabel)}` : ""
  }`;

  return (
    <AppShell bgClassName="bg-background">
      <SeoCrumbs items={crumbs} />
      <SeoHero
        className="pt-8"
        eyebrow={t("seoLanding.salary.eyebrow")}
        title={t("seoLanding.salary.guideTitle", { title: pageTitle })}
        lede={t("seoLanding.salary.lede")}
        primary={{ to: jobsHref, label: t("seoLanding.salary.browseRoleJobs", { role: roleTitle }) }}
        secondary={{ to: aiCoachHref(`Help me negotiate my salary as a ${roleTitle}`), label: t("seoLanding.common.askCoach") }}
      />

      {loading && (
        <div className="flex justify-center pb-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label={t("status.loading")} />
        </div>
      )}

      {error && (
        <MarketingBand tone="card" className="py-12 sm:py-14">
          <p className="text-muted-foreground">
            {t("seoLanding.salary.unavailable")}{" "}
            <Link to="/jobs" className="font-semibold text-primary hover:underline">
              {t("seoLanding.salary.browseInstead")}
            </Link>
          </p>
        </MarketingBand>
      )}

      {data && !loading && (
        <>
          <MarketingBand tone="card" className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-5">
            {/* Main salary stat */}
            <div className="col-span-full flex flex-col gap-2 rounded-[20px] bg-ink p-6 text-ink-foreground sm:p-8">
              <span className={`${STAT_LABEL} text-ink-muted`}>
                {locationLabel
                  ? t("seoLanding.salary.averageInCity", { city: locationLabel })
                  : t("seoLanding.salary.average")}
              </span>
              <p className="font-display text-[clamp(44px,6vw,72px)] font-bold leading-none tracking-[-0.035em] text-ink-positive">
                {money(data.averageSalary)}
              </p>
              <p className="text-sm text-ink-muted">
                {t("seoLanding.salary.basedOn", {
                  listings: data.sampleSize,
                  date: new Date(data.lastUpdated).toLocaleDateString(i18n.language),
                })}
              </p>
            </div>
            <div className="flex flex-col gap-1 rounded-[20px] border border-border bg-background p-6">
              <span className={`${STAT_LABEL} text-muted-foreground`}>{t("seoLanding.salary.entry")}</span>
              <p className="font-display text-3xl font-bold tracking-[-0.02em]">{money(data.minSalary)}</p>
            </div>
            <div className="flex flex-col gap-1 rounded-[20px] border border-border bg-background p-6">
              <span className={`${STAT_LABEL} text-muted-foreground`}>{t("seoLanding.salary.senior")}</span>
              <p className="font-display text-3xl font-bold tracking-[-0.02em]">{money(data.maxSalary)}</p>
            </div>
          </MarketingBand>

          {/* Salary in other cities — only on the role-level page */}
          {!locationSlug && data.relatedCities.length > 0 && (
            <MarketingBand labelledBy="salary-by-city-title" className="flex flex-col gap-6">
              <MarketingSectionIntro id="salary-by-city-title" title={t("seoLanding.salary.byCity", { role: roleTitle })} />
              <ul className="flex flex-wrap gap-2.5">
                {data.relatedCities.map((city) => (
                  <li key={city.slug}>
                    <Link to={`/salary/${data.jobSlug}/${city.slug}`} className={PILL_LINK_CLASS}>
                      {city.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </MarketingBand>
          )}

          {/* Related roles — present on both leaf + role pages */}
          {data.relatedRoles.length > 0 && (
            <MarketingBand
              tone={!locationSlug && data.relatedCities.length > 0 ? "card" : "page"}
              labelledBy="salary-related-title"
              className="flex flex-col gap-6"
            >
              <MarketingSectionIntro id="salary-related-title" title={t("seoLanding.salary.relatedRoles")} />
              <ul className="flex flex-wrap gap-2.5">
                {data.relatedRoles.map((r) => (
                  <li key={r.slug}>
                    <Link
                      to={locationSlug ? `/salary/${r.slug}/${locationSlug}` : `/salary/${r.slug}`}
                      className={PILL_LINK_CLASS}
                    >
                      {locationLabel
                        ? t("seoLanding.salary.roleInCity", { role: slugToTitle(r.title), city: locationLabel })
                        : slugToTitle(r.title)}
                    </Link>
                  </li>
                ))}
              </ul>
            </MarketingBand>
          )}

          <MarketingFAQ
            variant="plain"
            defaultOpenIndex={0}
            schemaId="salary"
            items={faqItems}
            className="mx-auto max-w-[820px] px-6 py-20"
          />
        </>
      )}

      <SeoFinalCta
        id="salary"
        title={t("landing.final.title")}
        secondary={{ to: jobsHref, label: t("seoLanding.salary.browseRoleJobs", { role: roleTitle }) }}
      />
    </AppShell>
  );
}
