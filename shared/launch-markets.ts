/**
 * Launch-market SSoT — which countries the product is actively marketed in.
 *
 * Distinct from shared/jurisdictions.ts (which is about LEGAL region for
 * privacy/consent/tax). This is about GO-TO-MARKET: where do we surface
 * geographic landing pages, the footer Locations column, and the
 * /sitemap/locations tree.
 *
 *   live     — fully launched + promoted (USA today)
 *   building — support being stood up; show but don't headline (CA, MX)
 *   planned  — not promoting yet; HIDE from all marketing surfaces
 *              (everything else — AU, UK, EU, etc.)
 *
 * Anything not in MARKET_STATUS is treated as `planned` (hidden).
 * Adding a market = one line here; every consumer (sitemap endpoint,
 * footer, /sitemap/locations page) filters off this single map.
 */
export type MarketStatus = "live" | "building" | "planned";

export const MARKET_STATUS: Record<string, MarketStatus> = {
  US: "live",
  CA: "building",
  MX: "building",
};

/** ISO2 codes we surface on marketing geo pages (live + building). */
export const PROMOTABLE_MARKET_ISO2: string[] = Object.entries(MARKET_STATUS)
  .filter(([, status]) => status === "live" || status === "building")
  .map(([iso2]) => iso2);

export function marketStatus(iso2: string | null | undefined): MarketStatus {
  if (!iso2) return "planned";
  return MARKET_STATUS[iso2.toUpperCase()] ?? "planned";
}

/** True when a country should appear on public geo marketing surfaces.
 *  Self-gating helper so consumers never hand-maintain a country list. */
export function isPromotableMarket(iso2: string | null | undefined): boolean {
  const status = marketStatus(iso2);
  return status === "live" || status === "building";
}
