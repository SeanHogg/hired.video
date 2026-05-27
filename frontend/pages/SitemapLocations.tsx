/**
 * /sitemap/locations — canonical sitemap-style page Google indexes
 * deeply. Reuses <LocationsSitemap variant="expanded" /> so the layout
 * matches whatever the expanded footer also renders.
 */
import { useLocation } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useSEO } from "@/lib/seo";
import { LocationsSitemap } from "@/components/landing/LocationsSitemap";

export default function SitemapLocations(): JSX.Element {
  const location = useLocation();
  useSEO(location.pathname, {
    title: "All Locations — Jobs Worldwide · hired.video",
    description:
      "Browse jobs and career resources by country, state, province, and city. Comprehensive sitemap of every region we cover.",
    ogTitle: "Hired.video — Browse Jobs by Location",
    ogDescription:
      "Find jobs and career resources in every country, state, and major city. Click through to local employers, relocation guides, and open roles.",
  });

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
