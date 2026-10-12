// FeaturedCreators — marketplace discovery landing for top-ranked creators
// (#1772). Reuses the `/api/featured-creators` ranking endpoint via the shared
// FeaturedCreatorsCarousel: an overall top-N row plus one row per creator-
// program category. `/creators/featured/:category` focuses a single category
// (the per-category landing). Each carousel self-gates to null when its slice
// is empty, so sparse categories simply don't render.

import { useMemo } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import FeaturedCreatorsCarousel from "@/components/creators/FeaturedCreatorsCarousel";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
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
  const { t } = useTranslation();
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
    { name: t("featuredCreators.breadcrumb"), url: "/creators/featured" },
    ...(focusLabel && category ? [{ name: focusLabel, url: `/creators/featured/${category}` }] : []),
  ];
  useBreadcrumbs(trail);

  return (
    <AppShell bgClassName="bg-background">
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-6 pb-24 pt-8">
        <Breadcrumbs items={trail} />

        <header className="flex flex-col gap-[18px]">
          <span className="self-start rounded-full bg-accent px-2.5 py-1.5 font-mono text-xs uppercase tracking-[0.08em] text-accent-foreground">
            {t("featuredCreators.eyebrow")}
          </span>
          <h1 className="font-display text-[clamp(36px,4.6vw,60px)] font-bold leading-[0.98] tracking-[-0.035em] text-foreground">
            {focusLabel ? t("featuredCreators.titleFocused", { label: focusLabel }) : t("featuredCreators.title")}
          </h1>
          <p className="max-w-[32em] text-lg leading-relaxed text-muted-foreground">
            {t("featuredCreators.subtitle")}
          </p>
        </header>

        {/* Single-category landing focuses one slice; the index lists all. */}
        {category && focused ? (
          <FeaturedCreatorsCarousel
            category={focused.slug}
            heading={t("featuredCreators.topIn", { label: focused.label })}
            limit={24}
          />
        ) : (
          <>
            <FeaturedCreatorsCarousel heading={t("featuredCreators.topOverall")} limit={24} />
            {CATEGORY_ROWS.map((row) => (
              <FeaturedCreatorsCarousel key={row.slug} category={row.slug} heading={row.label} limit={16} />
            ))}
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-border bg-card p-6">
          <p className="text-base text-foreground">{t("featuredCreators.joinPrompt")}</p>
          <Link to="/services" className="inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline">
            {t("featuredCreators.joinLink")}
          </Link>
        </div>
      </main>
    </AppShell>
  );
}
