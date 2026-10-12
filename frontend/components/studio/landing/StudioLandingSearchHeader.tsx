import HeaderSearch from "@/components/HeaderSearch";
import StudioNewMenu from "@/components/studio/shared/StudioNewMenu";
import DistributionHubLink from "@/components/studio/distribution/DistributionHubLink";
import { ACTION_BAR_SURFACE, ACTION_BAR_STICKY } from "@/lib/ui/action-bar";
import { cn } from "@/lib/utils";

/**
 * The search header IS the /studio page's action panel and the single sticky
 * band — it pins under the top nav as the user scrolls past the sections
 * below. The section bars (templates / my content) carry the same SURFACE
 * tone but don't stick, so they never fight for the top.
 */
export default function StudioLandingSearchHeader({
  onQueryChange,
}: {
  onQueryChange: (query: string) => void;
}) {
  return (
    <header className={cn(ACTION_BAR_STICKY, ACTION_BAR_SURFACE, "mb-0 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between")}>
      {/* Site-wide search relocated inline (was docked in the top bar;
          users routinely missed it there). Page title + description are
          dropped — the chooser body labels itself with the "Templates"
          and "My projects" section headings below. */}
      {/* Single primary search — the global header search doubles as the
          live filter for both sections below via `onQueryChange` (#1917),
          so there's no separate per-section search box. Enter still runs
          the global "search everything" navigation. */}
      <div className="min-w-0 flex-1">
        <HeaderSearch onQueryChange={onQueryChange} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {/* Scheduled posts + the queue (#2047); self-hides when signed out. */}
        <DistributionHubLink />
        {/* ONE "+ New":Get hired (a career kit — résumé, letter and video
            at once — Start with AI, the job-seeker templates) then More
            formats. Replaces the Wizard button + "New <template>" split. */}
        <StudioNewMenu />
      </div>
    </header>
  );
}
