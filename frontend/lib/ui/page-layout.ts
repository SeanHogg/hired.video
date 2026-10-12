/**
 * Shared layout classes for signed-in app pages. Every workspace page sits in
 * the same 1200px content column the marketing bands use, so the app and the
 * public pages line up edge-to-edge.
 *
 * The padding stays `p-4 md:p-6` on purpose: `ACTION_BAR_SURFACE`
 * (lib/ui/action-bar.ts) bleeds out with `-mx-4 md:-mx-6`, so a sticky
 * PageHeader toolbar inside this column reaches the column edges exactly.
 */
export const APP_PAGE_COLUMN = "mx-auto w-full max-w-[1200px] p-4 md:p-6";

/** Narrow reading column (forms, single-record pages). */
export const APP_PAGE_COLUMN_NARROW = "mx-auto w-full max-w-4xl p-4 md:p-6";

/** Standard content card surface (matches the Card primitive). */
export const APP_CARD_SURFACE = "rounded-[20px] border border-border bg-card";

/** Positive / success callout (connected, verified, done). Token-only so it
 *  reads in light and dark. */
export const SUCCESS_CALLOUT =
  "rounded-xl border border-brand-green/30 bg-brand-green/10 text-foreground";
