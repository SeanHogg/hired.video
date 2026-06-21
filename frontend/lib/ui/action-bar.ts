/**
 * Shared styling for the page "action bar" — the interactive header that holds
 * a page's tabs + search + filters + view toggles (People, Companies, Jobs,
 * Resumes, Studio, Admin, Services, the dashboard search, …).
 *
 *  1. A distinct TONE — `bg-actionbar` is a bright, faintly-tinted band that
 *     lifts off the page canvas in both light and dark.
 *  2. FLAT + FULL-WIDTH — no rounded corners, no boxed border; just a bottom
 *     hairline. It breaks out of the standard page padding (`p-4 md:p-6`) so
 *     the band spans the content section edge-to-edge, then restores its own
 *     inner padding.
 *  3. STICKY (opt-in) — add `ACTION_BAR_STICKY` to pin the band just below the
 *     fixed top nav (`h-16`) as the page scrolls. `z-30` keeps it under the nav
 *     (`z-50`) but above the scrolling content. A page with TWO action panels
 *     (e.g. Studio) uses the SURFACE alone so they don't fight for the top.
 *
 * Every action bar across the app composes these so they read identically (DRY).
 */

/** The flat, full-bleed visual band. Assumes the host wraps content in
 *  `p-4 md:p-6` — the negative x-margins cancel that so the band reaches the
 *  content edges, and the matching px restores inner padding. */
export const ACTION_BAR_SURFACE =
  "-mx-4 md:-mx-6 px-4 md:px-6 py-3 mb-4 " +
  "border-b border-border bg-actionbar/95 backdrop-blur-md";

/** Add alongside SURFACE to pin the band to the top of the scroll. The negative
 *  top-margin pulls it flush under the nav (cancels the page's top padding). */
export const ACTION_BAR_STICKY = "sticky top-16 z-30 -mt-4 md:-mt-6";
