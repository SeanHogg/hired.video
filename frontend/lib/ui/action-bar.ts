/**
 * Shared styling for the page "action bar" — the interactive header that holds
 * a page's tabs + search + filters + view toggles (People, Companies, Jobs,
 * Resumes, the dashboard search, …). Two goals, both requested by design:
 *
 *  1. A distinct TONE — `bg-secondary` reads as a soft band that separates from
 *     both the page canvas (`bg-background`) and the white content cards
 *     (`bg-card`), in light and dark.
 *  2. STICKY — it pins just below the fixed top nav (which is `h-16` tall) as
 *     the list scrolls, so search + filters stay reachable. `z-30` keeps it
 *     under the nav (`z-50`) but above the scrolling content.
 *
 * Both the shared <PageHeader> and the dashboard <UnifiedSearch> compose these
 * so every action bar across the app reads identically (DRY).
 */
export const ACTION_BAR_STICKY = "sticky top-16 z-30";

export const ACTION_BAR_SURFACE =
  "rounded-xl border border-border bg-secondary/95 backdrop-blur-sm shadow-sm";
