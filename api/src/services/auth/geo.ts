/**
 * Geographic gate — wraps the shared securityRegistry for backend use.
 *
 * Re-exports the canonical fns so consumers (auth handlers, register
 * route, /api/geo/eligible, admin filters) all import from one place
 * within the api package. The real source of truth is
 * shared/security/securityRegistry.ts so the FE imports the same lists.
 */

export {
  ALLOWED_SIGNUP_COUNTRIES,
  SANCTIONED_COUNTRIES,
  isSanctioned,
  canCreateAccount,
  classifySignupEligibility,
  type SignupEligibility,
} from "../../../../shared/security/securityRegistry.js";

/**
 * Pull the country code for the request. Cloudflare's `cf-ipcountry`
 * header is the primary; fall back to the `X-Country` header pattern
 * for tests and local dev. Null when unknown.
 */
export function detectCountry(headers: {
  get?: (name: string) => string | null;
  [key: string]: any;
}): string | null {
  const get = (name: string) => {
    if (typeof headers.get === "function") return headers.get(name);
    return headers[name] ?? headers[name.toLowerCase()] ?? null;
  };
  const cf = get("cf-ipcountry") ?? get("CF-IPCountry");
  if (cf && cf !== "XX" && cf !== "T1") return cf.toUpperCase();
  const x = get("x-country");
  if (x) return x.toUpperCase();
  return null;
}
