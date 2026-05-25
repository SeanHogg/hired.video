/**
 * Inbound attribution capture — single source of truth for `?ref=CODE`
 * (affiliate) and the five UTM querystring params (campaign).
 *
 * Closes gaps #1194, #1195, #1199. Before this module existed:
 *   • `?ref=CODE` was captured in `Signup.tsx` only, into sessionStorage
 *     (tab-scoped → lost on close).
 *   • UTM params were captured in `App.tsx GTMPageTracker`, also into
 *     sessionStorage, also tab-scoped, and never wired to the backend.
 *   • There was no first-touch policy: a second `?ref=` visit overwrote
 *     the first.
 *
 * Now:
 *   • One module owns the read + write of every attribution key.
 *   • Storage is a 30-day cookie (SameSite=Lax) so a click on Monday and
 *     a signup on Tuesday still attribute. Falls back to sessionStorage
 *     if cookies are blocked (privacy modes).
 *   • Policy is FIRST-TOUCH: once a key has a value, subsequent `?ref=`
 *     or `utm_*` querystrings in the same browser are ignored. The
 *     affiliate / campaign that hooked the visitor gets credit even if
 *     a later visit lacks the param.
 *   • Consumers (Signup.tsx, GTMPageTracker, future Checkout) read via
 *     `readAttribution()` — no consumer duplicates the cookie key list,
 *     no consumer makes its own first-touch decision.
 */

const COOKIE_PREFIX = "attr_";
const COOKIE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// The 6 keys we persist. `ref` is the affiliate code; the rest are UTMs.
// `landingReferrer` is filled from `document.referrer` (not a querystring)
// when the very first hit lands without a UTM — useful for organic / dark
// social analysis.
const ATTRIBUTION_KEYS = [
  "ref",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "landing_referrer",
] as const;

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];

export interface AttributionSnapshot {
  ref?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  landingReferrer?: string;
}

function readStorageValue(key: AttributionKey): string | undefined {
  // Cookie first — survives tab close. Then sessionStorage fallback for
  // visitors who blocked cookies but the SPA still wants to behave.
  try {
    const match = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${COOKIE_PREFIX}${key}=`));
    if (match) {
      const v = decodeURIComponent(match.slice(COOKIE_PREFIX.length + key.length + 1));
      if (v) return v;
    }
  } catch {
    // no-op (SSR, cookies disabled)
  }
  try {
    const v = sessionStorage.getItem(key);
    if (v) return v;
  } catch {
    // no-op (Safari private)
  }
  return undefined;
}

function writeStorageValue(key: AttributionKey, value: string): void {
  // Sanitise — refs/UTMs in our schema cap at 64 / 128 chars. Truncate
  // here so a malicious / mistakenly-long URL can't poison the cookie
  // with megabyte payloads or smuggle in path-traversal characters.
  const safe = value.replace(/[\r\n;]/g, "").slice(0, key === "ref" ? 64 : 256);
  try {
    document.cookie =
      `${COOKIE_PREFIX}${key}=${encodeURIComponent(safe)}; ` +
      `Max-Age=${COOKIE_TTL_SECONDS}; Path=/; SameSite=Lax`;
  } catch {
    // no-op
  }
  try {
    sessionStorage.setItem(key, safe);
  } catch {
    // no-op
  }
}

/**
 * Capture attribution from the current URL. First-touch policy: keys
 * that already have a stored value are NOT overwritten.
 *
 * Called from `useAttributionCapture` on every route change so any page
 * a visitor lands on can capture, not just `/signup`. Idempotent.
 */
export function captureAttribution(search: string, referrer?: string): void {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return;
  }

  // Map URL param names → stored keys. `?ref=...` is our affiliate
  // convention; the 5 UTM params keep their canonical names.
  const urlToStored: Record<string, AttributionKey> = {
    ref: "ref",
    utm_source: "utm_source",
    utm_medium: "utm_medium",
    utm_campaign: "utm_campaign",
    utm_term: "utm_term",
    utm_content: "utm_content",
  };

  for (const [urlKey, storedKey] of Object.entries(urlToStored)) {
    const incoming = params.get(urlKey);
    if (!incoming) continue;
    if (readStorageValue(storedKey)) continue; // first-touch wins
    writeStorageValue(storedKey, incoming);
  }

  // Landing referrer is filled once on the first hit that arrived from
  // an external origin. Skipped when same-origin so the value reflects
  // the actual entry point (e.g. a LinkedIn share), not the last route
  // change inside the SPA.
  if (referrer && !readStorageValue("landing_referrer")) {
    try {
      const origin = new URL(referrer).origin;
      if (origin && origin !== window.location.origin) {
        writeStorageValue("landing_referrer", referrer);
      }
    } catch {
      // malformed referrer — skip
    }
  }
}

/**
 * Read the current attribution snapshot. Empty object if nothing was
 * captured. Safe to call from any page; consumers should send the result
 * with the signup / checkout / lead payload.
 */
export function readAttribution(): AttributionSnapshot {
  return {
    ref: readStorageValue("ref"),
    utmSource: readStorageValue("utm_source"),
    utmMedium: readStorageValue("utm_medium"),
    utmCampaign: readStorageValue("utm_campaign"),
    utmTerm: readStorageValue("utm_term"),
    utmContent: readStorageValue("utm_content"),
    landingReferrer: readStorageValue("landing_referrer"),
  };
}

/**
 * Server-side payload shape — keys match `RegisterSchema` in
 * `api/src/routes/auth.ts`. Drops `undefined`-valued keys so the payload
 * stays minimal for organic signups.
 */
export function attributionPayload(): Partial<{
  referralCode: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
  landingReferrer: string;
}> {
  const snap = readAttribution();
  const out: Record<string, string> = {};
  if (snap.ref) out.referralCode = snap.ref;
  if (snap.utmSource) out.utmSource = snap.utmSource;
  if (snap.utmMedium) out.utmMedium = snap.utmMedium;
  if (snap.utmCampaign) out.utmCampaign = snap.utmCampaign;
  if (snap.utmTerm) out.utmTerm = snap.utmTerm;
  if (snap.utmContent) out.utmContent = snap.utmContent;
  if (snap.landingReferrer) out.landingReferrer = snap.landingReferrer;
  return out;
}
