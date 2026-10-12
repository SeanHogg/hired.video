/**
 * /sitemap/locations — canonical sitemap-style page Google indexes
 * deeply. Reuses <LocationsSitemap /> so the layout
 * matches whatever the expanded footer also renders.
 */
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import { MarketingBand } from "@/components/marketing/MarketingBand";
import { LocationsSitemap } from "@/components/landing/LocationsSitemap";
import { SeoHero } from "@/components/landing/SeoHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";

export default function SitemapLocations(): JSX.Element {
  const location = useLocation();
  const { t } = useTranslation();
  useDefaultBreadcrumbs();
  // Meta lives in the central PAGE_SEO entry for /sitemap/locations
  // (gap #1968).
  useSEO(location.pathname);

  return (
    <AppShell bgClassName="bg-background">
      <SeoHero
        eyebrow={t("seoLanding.sitemap.eyebrow")}
        title={t("seoLanding.location.allLocations")}
        lede={t("seoLanding.sitemap.lede")}
        primary={null}
      />
      <MarketingBand tone="card" className="pt-10 sm:pt-12">
        <LocationsSitemap />
      </MarketingBand>
      <SeoFinalCta id="sitemap-locations" title={t("landing.final.title")} />
    </AppShell>
  );
}
