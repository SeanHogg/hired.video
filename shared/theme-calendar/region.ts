/**
 * The theme calendar's region for a jurisdiction (shared/jurisdictions.ts:
 * "US-MI", "CA-ON", "EEA-DE"…). Calendar events are scoped to "US",
 * "US-MW" (Midwest: Sweetest Day…) or "CA"; everyone else gets the
 * region-free events only.
 */
const MIDWEST = new Set(["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"]);

export function themeRegionOf(jurisdiction: string | null | undefined): string | null {
  const [region, sub] = (jurisdiction ?? "").toUpperCase().split("-");
  if (region === "US") return sub && MIDWEST.has(sub) ? "US-MW" : "US";
  if (region === "CA") return "CA";
  return null;
}
