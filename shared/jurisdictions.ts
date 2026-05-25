/**
 * Jurisdiction SoT for the dynamic region-aware Privacy / Terms / Cookie pages
 * (gap #1153) and any other surface that needs to branch on the user's legal
 * jurisdiction (consent UI, tax routing, breach notification, etc.).
 *
 * Resolution order — see useUserJurisdiction() on the frontend:
 *   1. Explicit URL override `?as=CA-QC` (legal review + user self-service)
 *   2. Authenticated user.jurisdiction (frozen at signup, future field)
 *   3. billing_address.country + billing_address.state (today's best signal)
 *   4. Geo-IP guess via Cloudflare `cf-ipcountry` request header
 *   5. "ROW" (rest of world) — generic notice variant
 *
 * Format: `<region>` or `<region>-<subdivision>`. Region uses Cloudflare /
 * GDPR conventions (`US`, `CA`, `MX`, `EEA`, `UK`, `ROW`). Subdivision is
 * the ISO 3166-2 code (`CA` for California in US-CA; `QC` for Quebec in
 * CA-QC). The `*` wildcard pattern matches any subdivision.
 *
 * The point of the wildcard: section components opt into a list of patterns
 * (`["US-*", "CA-*"]`) and `matchesJurisdiction()` decides whether to render.
 * Self-gating per the standing DRY rule — never prop-drill a
 * `canShowGdprSection` boolean.
 */

// EU/EEA members — single source of truth so the GDPR section component
// doesn't have to list them in every consumer. Keep alphabetised for diff
// hygiene. Iceland / Liechtenstein / Norway are EEA-not-EU; we treat them
// identically for privacy purposes since they've adopted GDPR.
export const EEA_COUNTRIES = new Set<string>([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
  // EEA-not-EU but GDPR-equivalent:
  "IS", "LI", "NO",
]);

/** US states with their own consumer-privacy law that the public Privacy
 *  Policy already enumerates. Membership here flips on per-state rights
 *  sections (the long list in PrivacyPolicy.tsx Regulatory Compliance). */
export const US_PRIVACY_STATES = new Set<string>([
  "CA", "VA", "CO", "CT", "UT", "TX", "OR", "MT", "DE", "IA", "TN", "IN",
  "NJ", "KY", "NH", "NE",
]);

export type Region = "US" | "CA" | "MX" | "EEA" | "UK" | "ROW";

/** Stable jurisdiction string — always `<region>` or `<region>-<subdivision>`.
 *  Use buildJurisdiction() rather than concatenating manually. */
export type Jurisdiction = string;

export type JurisdictionSource =
  | "url_override"        // ?as=CA-QC
  | "user_declared"       // user.jurisdiction set at signup (future)
  | "billing_address"     // billing_address.country + state
  | "geo_ip"              // cf-ipcountry header guess
  | "fallback";           // nothing matched → ROW

/** Compose a jurisdiction string from a (country, subdivision) pair. */
export function buildJurisdiction(country: string | null | undefined, subdivision?: string | null): Jurisdiction {
  const cc = (country ?? "").toUpperCase().trim();
  if (!cc) return "ROW";
  const region = regionForCountry(cc);
  const sub = (subdivision ?? "").toUpperCase().trim();
  // Subdivision is meaningful for US states + Canadian provinces only. Other
  // regions are routed by country alone (DE / FR / IT have their own quirks
  // but the GDPR base is what 95% of the privacy notice needs).
  if (sub && (region === "US" || region === "CA")) {
    return `${region}-${sub}`;
  }
  if (region === "EEA" && sub) {
    return `${region}-${cc}`;
  }
  return region;
}

function regionForCountry(cc: string): Region {
  if (cc === "US") return "US";
  if (cc === "CA") return "CA";
  if (cc === "MX") return "MX";
  if (cc === "GB") return "UK";
  if (EEA_COUNTRIES.has(cc)) return "EEA";
  return "ROW";
}

/** Wildcard-aware membership test. Patterns:
 *    "US"        — exact match against region only
 *    "US-CA"     — exact match against region + subdivision
 *    "US-*"      — region match, any subdivision (including none)
 *    "EEA-*"     — every EU/EEA country
 *  Empty/missing pattern lists default to "never matches" so a section
 *  component that forgot to declare its scope doesn't render globally. */
export function matchesJurisdiction(current: Jurisdiction, patterns: readonly string[]): boolean {
  if (patterns.length === 0) return false;
  const [region, sub = ""] = current.split("-");
  for (const pattern of patterns) {
    const [pRegion, pSub] = pattern.split("-");
    if (pRegion !== region) continue;
    if (!pSub) {
      // "US" — region-only pattern matches the base region (no subdivision)
      if (!sub) return true;
      continue;
    }
    if (pSub === "*") return true;        // any subdivision (including none)
    if (pSub === sub) return true;        // exact subdivision match
  }
  return false;
}

/** Friendly display label for the "viewing as" selector dropdown.
 *  Pure presentation — translation happens at the call site. */
export const JURISDICTION_DISPLAY_LABELS: Record<string, string> = {
  US: "United States",
  "US-CA": "California, USA",
  "US-VA": "Virginia, USA",
  "US-CO": "Colorado, USA",
  "US-CT": "Connecticut, USA",
  CA: "Canada",
  "CA-QC": "Quebec, Canada",
  "CA-ON": "Ontario, Canada",
  "CA-BC": "British Columbia, Canada",
  "CA-AB": "Alberta, Canada",
  MX: "Mexico",
  EEA: "European Union / EEA",
  "EEA-DE": "Germany (EEA)",
  "EEA-FR": "France (EEA)",
  "EEA-IE": "Ireland (EEA)",
  UK: "United Kingdom",
  ROW: "Rest of world",
};

/** Stable order for the selector dropdown — most relevant jurisdictions
 *  first, ROW last as the fallback choice. */
export const JURISDICTION_OPTIONS: readonly Jurisdiction[] = [
  "US", "US-CA", "US-VA", "US-CO", "US-CT",
  "CA", "CA-QC", "CA-ON", "CA-BC", "CA-AB",
  "MX",
  "EEA", "EEA-DE", "EEA-FR", "EEA-IE",
  "UK",
  "ROW",
];
