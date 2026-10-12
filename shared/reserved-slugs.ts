/**
 * Vanity slugs a user may NOT claim (#2312). A profile's vanity slug is the
 * author segment of `/people/<slug>` and `/articles/<slug>/<article>`, so
 * a slug equal to a static route under either prefix would be shadowed by
 * that route (React Router ranks a static segment above a `:param`).
 *
 * Keep in sync with the static `/people/*` and `/articles/*` routes in
 * frontend/App.tsx — `__tests__/shared/reserved-slugs.test.ts` fails when a
 * new static segment isn't listed here.
 *
 * Existing data: a profile that claimed one of these before the list
 * existed keeps it (no data migration); its `/people/<slug>` link is
 * shadowed until the owner picks another.
 */
export const RESERVED_VANITY_SLUGS: ReadonlySet<string> = new Set([
  // /articles/<static>
  "by-id",
  // /people/<static>
  "me",
  "goals",
  "hiring",
  "one-on-ones",
  "pitch-decks",
  "roster",
  "s",
  "scorecards",
  "tco",
  "team-health",
]);

/** True when `slug` (any case) collides with a static public route. */
export function isReservedVanitySlug(slug: string): boolean {
  return RESERVED_VANITY_SLUGS.has(slug.trim().toLowerCase());
}
