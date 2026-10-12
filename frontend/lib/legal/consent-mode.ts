/**
 * Google Consent Mode v2 wrapper.
 *
 * The `gtag("consent","default",...)` call lives in [index.html](../../index.html)
 * so it runs BEFORE GTM/GA load — every tag GTM ships defaults to denied until
 * we explicitly update. This module is the single seam through which the cookie
 * banner + Settings cookies panel + GPC signal flip those defaults.
 *
 * Per the DRY rule: consumers never call `window.gtag("consent","update",...)`
 * directly — they call `applyConsentToTagManagers(prefs)`. New ad/analytics
 * destinations get plumbed in here once, not at each call site.
 *
 * Consent Mode v2 surfaces (Google's contract):
 *   - ad_storage / ad_user_data / ad_personalization  → driven by `marketing`
 *   - analytics_storage                                → driven by `analytics`
 *   - personalization_storage                          → driven by `personalization`
 *   - functionality_storage / security_storage         → always granted (essential)
 */

import type { CookiePreferences } from "@/lib/services/settings-service";

type ConsentValue = "granted" | "denied";

interface ConsentUpdate {
  ad_storage: ConsentValue;
  ad_user_data: ConsentValue;
  ad_personalization: ConsentValue;
  analytics_storage: ConsentValue;
  personalization_storage: ConsentValue;
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
  interface Navigator {
    /** GPC signal — Brave / Firefox / extensions set this when the user has
     *  asked sites not to sell or share their data. CPRA requires honoring. */
    globalPrivacyControl?: boolean;
  }
}

/** True when the visitor's browser has set the Global Privacy Control signal.
 *  When this is true, the cookie banner defaults the optional categories to
 *  denied and records `consentedAt` immediately so we don't keep nagging the
 *  user with the banner on every page. */
export function isGpcEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.globalPrivacyControl === true;
}

function toConsentUpdate(prefs: CookiePreferences): ConsentUpdate {
  const marketing: ConsentValue = prefs.marketing ? "granted" : "denied";
  const analytics: ConsentValue = prefs.analytics ? "granted" : "denied";
  const personalization: ConsentValue = prefs.personalization ? "granted" : "denied";
  return {
    ad_storage: marketing,
    ad_user_data: marketing,
    ad_personalization: marketing,
    analytics_storage: analytics,
    personalization_storage: personalization,
  };
}

/** Push the user's current cookie preferences down to every tag manager we
 *  load. Call from the cookie banner / Settings → Cookies panel / hook init
 *  whenever the stored preference state changes. Idempotent. */
export function applyConsentToTagManagers(prefs: CookiePreferences): void {
  if (typeof window === "undefined") return;
  const gtag = window.gtag;
  if (typeof gtag !== "function") return;
  gtag("consent", "update", toConsentUpdate(prefs));
}

/** Synchronous category read for module-init consumers that fire before any
 *  React component mounts (e.g. paid-media pixel install). Mirrors the
 *  storage shape used by [useCookiePreferences](../../hooks/use-cookie-preferences.ts).
 *  Returns `denied` when no choice is stored — matches the index.html
 *  Consent Mode default and CPRA's "no consent = no firing" expectation.
 *  Logged-in users' server-side preference still wins, but it overlays via
 *  the hook fetch *after* this returns. */
const STORAGE_KEY = "hv_cookie_prefs";
type Category = "analytics" | "marketing" | "personalization";

export function hasStoredConsentFor(category: Category): boolean {
  if (typeof window === "undefined") return false;
  // GPC implicit reject — never load optional categories for these visitors
  // even if local storage somehow says otherwise. Matches the implicit
  // reject the hook applies on first render.
  if (isGpcEnabled()) return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed.consentedAt) return false;
    return parsed[category] === true;
  } catch {
    return false;
  }
}
