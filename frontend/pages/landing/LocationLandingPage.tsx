/**
 * /in/[country]/[state?]/[city?] — geographic Resource Map (#1628).
 *
 * Resolves the slug triple via /api/locations/resolve, then renders the
 * SAME <ResourceMap> stack the audience pages use — just on the geo axis
 * instead of the audience axis (#1663). One render surface for both
 * axes; new card features land once, not twice.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import MarketingFAQ from "@/components/MarketingFAQ";
import { ResourceMap } from "@/components/landing/ResourceMap";
import { SeoHero, SeoHeroSkeleton } from "@/components/landing/SeoHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import LocationResources from "@/components/resources/LocationResources";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import { apiClient } from "@/lib/api-client";

interface ResolvedLocation {
  country: { id: number; name: string; iso2: string };
  state: { id: string; name: string; code: string | null } | null;
  city: { id: string; name: string; slug: string } | null;
}

export default function LocationLandingPage(): JSX.Element {
  const params = useParams<{ country: string; state?: string; city?: string }>();
  const location = useLocation();
  const { t } = useTranslation();

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
    if (resolved.city) return t("seoLanding.location.sub.city", { place: resolved.city.name });
    if (resolved.state) return t("seoLanding.location.sub.state", { place: resolved.state.name });
    return t("seoLanding.location.sub.country", { place: resolved.country.name });
  }, [resolved, t]);

  // Memoised so MarketingFAQ's JSON-LD effect doesn't re-run every render.
  const faqItems = useMemo(
    () =>
      (["scope", "cities", "guide"] as const).map((id) => ({
        question: t(`seoLanding.location.faq.${id}.q`, { place: headerTitle }),
        answer: t(`seoLanding.location.faq.${id}.a`),
      })),
    [t, headerTitle],
  );

  useDefaultBreadcrumbs();
  // Runtime SEO override is intentional here (gap #1968): the title /
  // description are derived from the resolved location (country / state /
  // city names fetched from /api/locations/resolve), so they can't live
  // as a static literal in PAGE_SEO. The static `/in/:country` registry
  // entry is the fallback used before `resolved` arrives.
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
        <SeoHeroSkeleton />
      </AppShell>
    );
  }

  if (status === "notfound" || !resolved) {
    return (
      <AppShell bgClassName="bg-background">
        <SeoHero
          title={t("seoLanding.location.notFound.title")}
          lede={t("seoLanding.location.notFound.body")}
          primary={{ to: "/sitemap/locations", label: t("seoLanding.location.notFound.cta") }}
        />
      </AppShell>
    );
  }

  const jobsHref = `/jobs?${new URLSearchParams({
    ...(resolved.city ? { cityId: resolved.city.id } : {}),
    ...(resolved.state ? { stateId: resolved.state.id } : {}),
    countryId: String(resolved.country.id),
  }).toString()}`;

  return (
    <AppShell bgClassName="bg-background">
      <SeoHero
        eyebrow={resolved.country.iso2}
        title={headerTitle}
        lede={subTitle}
        primary={{ to: jobsHref, label: t("seoLanding.location.browseJobs") }}
        secondary={{ to: "/sitemap/locations", label: t("seoLanding.location.allLocations") }}
      />

      <ResourceMap
        filter={{
          geo: {
            countryId: resolved.country.id,
            stateId: resolved.state?.id,
            cityId: resolved.city?.id,
          },
        }}
        kinds={["job", "article", "template", "video", "learning_path"]}
        heading={t("seoLanding.location.resourcesHeading", { place: headerTitle })}
        subheading={t("seoLanding.location.resourcesSub")}
      />

      <div className="mx-auto w-full max-w-[1200px] py-6">
        <LocationResources
          countryCode={(params.country ?? "").toLowerCase()}
          stateCode={params.state ? params.state.toLowerCase() : null}
          citySlug={params.city ? params.city.toLowerCase() : null}
          locationLabel={headerTitle}
        />
      </div>

      <MarketingFAQ
        variant="plain"
        defaultOpenIndex={0}
        schemaId="in-location-faq"
        items={faqItems}
        className="mx-auto max-w-[820px] px-6 pb-24 pt-8"
      />

      <SeoFinalCta id="in-location" title={t("landing.final.title")} />
    </AppShell>
  );
}
