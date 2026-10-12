/**
 * Security registry — single source of truth for country gating across
 * hired.video. Every gate (FE form self-hide, BE handler
 * reject, SuperAdmin filter, bot globe legend) imports from here.
 *
 * No copies. No "candidate-focused" hand-picked subsets. If a country
 * needs to move between lists, it moves here and propagates.
 */

// US OFAC Specially Designated Nationals — comprehensive country
// embargoes. Account creation from these jurisdictions is a hard 403
// because accepting their data is a sanctions violation. This list
// runs FIRST in canCreateAccount, before geo soft-block.
//
// "VE" (Venezuela) is on partial sanctions; we apply the cautious
// reading and treat it as hard-blocked here. If product policy
// loosens, edit this constant — not consumers.
export const SANCTIONED_COUNTRIES: readonly string[] = [
  "CU", // Cuba
  "IR", // Iran
  "KP", // North Korea
  "SY", // Syria
  "VE", // Venezuela (partial; treated as full)
] as const;

// North + South America. ISO-3166-1 alpha-2. Account *creation* is
// allowed from these countries; *viewing* the site stays global.
export const ALLOWED_SIGNUP_COUNTRIES: readonly string[] = [
  // North America
  "US", "CA", "MX", "GT", "BZ", "SV", "HN", "NI", "CR", "PA",
  // Caribbean (geographic North America for ISO purposes — covers
  // diaspora users and remote-first workers; CU intentionally omitted
  // because OFAC takes precedence)
  "DO", "JM", "HT", "TT", "BS", "BB", "AG", "GD", "KN", "LC", "VC",
  "DM",
  // South America
  "AR", "BO", "BR", "CL", "CO", "EC", "GY", "PY", "PE", "SR", "UY",
] as const;

const SANCTIONED_SET = new Set<string>(SANCTIONED_COUNTRIES.map((c) => c.toUpperCase()));
const ALLOWED_SET = new Set<string>(ALLOWED_SIGNUP_COUNTRIES.map((c) => c.toUpperCase()));

/** Hard-block check — runs FIRST in any gate. */
export function isSanctioned(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false;
  return SANCTIONED_SET.has(countryCode.toUpperCase());
}

/**
 * Soft-block check — true means "may create an account". Returns false
 * for sanctioned AND non-allowlisted countries. Callers that need to
 * distinguish hard-403 from soft-block-with-waitlist should call
 * `isSanctioned` first and `canCreateAccount` second.
 *
 * `null`/unknown country → true (fail-open). Cloudflare almost always
 * provides cf-ipcountry; the only path that lacks it is local dev or
 * an edge-routing misconfiguration. Failing-closed there would lock
 * out engineers and is more harmful than the small fraction of geo
 * misses it would catch.
 */
export function canCreateAccount(countryCode: string | null | undefined): boolean {
  if (!countryCode) return true;
  const upper = countryCode.toUpperCase();
  if (SANCTIONED_SET.has(upper)) return false;
  return ALLOWED_SET.has(upper);
}

/**
 * Three-state classification consumed by /api/geo/eligible. The FE
 * RegisterPage reads this directly and self-hides / shows-waitlist
 * accordingly — no canSignup prop drilling.
 */
export type SignupEligibility = "allowed" | "waitlist" | "sanctioned";

export function classifySignupEligibility(
  countryCode: string | null | undefined,
): SignupEligibility {
  if (isSanctioned(countryCode)) return "sanctioned";
  if (canCreateAccount(countryCode)) return "allowed";
  return "waitlist";
}
