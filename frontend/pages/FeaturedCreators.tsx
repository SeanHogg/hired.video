// FeaturedCreators — marketplace discovery landing for top-ranked creators
// (#1772). Reuses the `/api/featured-creators` ranking endpoint via the shared
// FeaturedCreatorsCarousel: an overall top-N row plus one row per creator-
// program category. `/creators/featured/:category` focuses a single category
// (the per-category landing). Each carousel self-gates to null when its slice
// is empty, so sparse categories simply don't render.

import { useMemo } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import FeaturedCreatorsCarousel from "@/components/creators/FeaturedCreatorsCarousel";
import { useSEO } from "@/lib/seo";
import { PROGRAM_CATEGORY } from "@shared/creator-programs";
import { CREATOR_PROGRAM_LABEL } from "@/lib/services/creator-service";

// The creator-program categories surfaced as discovery rows, in display order.
// Each maps to the `creator_profiles.categories` slug the ranking endpoint
// filters on (PROGRAM_CATEGORY) + its human label.
const DISCOVERY_PROGRAMS = ["video", "voice", "services", "articles", "courses", "templates"] as const;
const CATEGORY_ROWS = DISCOVERY_PROGRAMS.map((p) => ({
  slug: PROGRAM_CATEGORY[p],
  label: CREATOR_PROGRAM_LABEL[p],
}));

export default function FeaturedCreators() {
  const location = useLocation();
  const { category } = useParams<{ category?: string }>();

  const focused = useMemo(
    () => (category ? CATEGORY_ROWS.find((r) => r.slug === category) ?? null : null),
    [category],
  );
  const focusLabel = focused?.label ?? (category ?? null);

  useSEO(location.pathname, {
    title: focusLabel
      ? `Featured ${focusLabel} Creators — hired.video`
      : "Featured Creators — hired.video",
    description: focusLabel
      ? `Top-ranked ${focusLabel.toLowerCase()} creators on hired.video.`
      : "Discover the top-ranked creators across promo video, voice, services, articles, courses and templates.",
  });

  const trail = [
    { name: "Creators", url: "/creators/featured" },
    ...(focusLabel && category ? [{ name: focusLabel, url: `/creators/featured/${category}` }] : []),
  ];

  return (
    <AppShell bgClassName="bg-background">
      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-6xl mx-auto space-y-8">
        <Breadcrumbs items={trail} />

        <header className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            {focusLabel ? `Featured ${focusLabel} Creators` : "Featured Creators"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Ranked by rating, reviews, completed projects and engagement.
          </p>
        </header>

        {/* Single-category landing focuses one slice; the index lists all. */}
        {category && focused ? (
          <FeaturedCreatorsCarousel category={focused.slug} heading={`Top ${focused.label} creators`} limit={24} />
        ) : (
          <>
            <FeaturedCreatorsCarousel heading="Top creators overall" limit={24} />
            {CATEGORY_ROWS.map((row) => (
              <div key={row.slug} className="space-y-2">
                <FeaturedCreatorsCarousel category={row.slug} heading={row.label} limit={16} />
              </div>
            ))}
          </>
        )}

        <p className="text-sm text-muted-foreground">
          Are you a creator?{" "}
          <Link to="/services" className="text-primary hover:underline">
            Join the Creator Program
          </Link>{" "}
          to get featured.
        </p>
      </div>
    </AppShell>
  );
}
