/**
 * /sitemap/locations — canonical sitemap-style page Google indexes
 * deeply. Reuses <LocationsSitemap variant="expanded" /> so the layout
 * matches whatever the expanded footer also renders.
 */
import { useLocation } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import { LocationsSitemap } from "@/components/landing/LocationsSitemap";

export default function SitemapLocations(): JSX.Element {
  const location = useLocation();
  useDefaultBreadcrumbs();
  // Meta lives in the central PAGE_SEO entry for /sitemap/locations
  // (gap #1968).
  useSEO(location.pathname);

  return (
    <AppShell bgClassName="bg-background">
      <section className="px-4 py-16 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-4">All locations</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Jobs and career resources by region. Click a country to expand its states / provinces; click a city for local jobs, employers, and relocation guides.
        </p>
        <LocationsSitemap variant="expanded" />
      </section>
    </AppShell>
  );
}
