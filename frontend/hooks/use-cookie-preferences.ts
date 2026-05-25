/**
 * useCookiePreferences — single source of truth for the cookie consent
 * categories shown on /cookies and Settings → Cookies.
 *
 * Anonymous visitors: preferences live in localStorage so third-party scripts
 * (analytics, marketing pixels, personalization) can check consent before
 * loading. Logged-in users: preferences round-trip through
 * /api/Settings/cookies so the same choice follows them across devices.
 *
 * When a user signs in after setting preferences anonymously, the first
 * authenticated fetch seeds the server from localStorage *only if* the server
 * has no row yet — so a first login doesn't clobber an existing saved choice
 * from another device.
 *
 * GPC: when the browser asserts `navigator.globalPrivacyControl`, the very
 * first visit records an implicit reject-optional consent so the banner stops
 * showing AND every tag manager / paid pixel sees the denied state on first
 * render. CPRA explicitly requires honoring this signal as an opt-out.
 */

import { useCallback, useEffect, useState } from "react";
import { useApiReady } from "@/lib/auth";
import {
  type CookiePreferences,
  settingsService,
} from "@/lib/services/settings-service";
import { applyConsentToTagManagers, isGpcEnabled } from "@/lib/legal/consent-mode";

const STORAGE_KEY = "hv_cookie_prefs";

type OptionalCategory = "analytics" | "marketing" | "personalization";

const DEFAULTS: CookiePreferences = {
  essential: true,
  analytics: false,
  marketing: false,
  personalization: false,
  consentedAt: null,
};

/** Default state for a first-time visitor. When GPC is set, we stamp
 *  `consentedAt` immediately and persist the implicit reject so the banner
 *  doesn't keep showing on every page. */
function initialDefaults(): CookiePreferences {
  if (!isGpcEnabled()) return DEFAULTS;
  return {
    essential: true,
    analytics: false,
    marketing: false,
    personalization: false,
    consentedAt: new Date().toISOString(),
  };
}

function readLocal(): CookiePreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialDefaults();
    const parsed = JSON.parse(raw);
    return {
      essential: true,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      personalization: Boolean(parsed.personalization),
      consentedAt: typeof parsed.consentedAt === "string" ? parsed.consentedAt : null,
    };
  } catch {
    return initialDefaults();
  }
}

function writeLocal(prefs: CookiePreferences) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      analytics: prefs.analytics,
      marketing: prefs.marketing,
      personalization: prefs.personalization,
      consentedAt: prefs.consentedAt,
    }));
  } catch {
    // ignore — private mode / quota
  }
}

export type UseCookiePreferencesApi = {
  preferences: CookiePreferences;
  loading: boolean;
  /** True once the user has made an explicit choice (vs. the default). */
  hasConsented: boolean;
  setCategory: (category: OptionalCategory, enabled: boolean) => Promise<void>;
  acceptAll: () => Promise<void>;
  rejectOptional: () => Promise<void>;
};

export function useCookiePreferences(): UseCookiePreferencesApi {
  const apiReady = useApiReady();
  const [preferences, setPreferences] = useState<CookiePreferences>(() => {
    const initial = readLocal();
    // Fan out the bootstrap state to Consent Mode v2 immediately so any
    // tag that loaded between the index.html consent default and this hook
    // mounting sees the user's actual choice (or implicit GPC opt-out).
    applyConsentToTagManagers(initial);
    return initial;
  });
  const [loading, setLoading] = useState<boolean>(apiReady);

  // If the visitor was bootstrapped via GPC into an implicit reject, persist
  // that to localStorage immediately so subsequent reads short-circuit and
  // we don't re-stamp `consentedAt` on every refresh.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isGpcEnabled()) return;
    if (window.localStorage.getItem(STORAGE_KEY)) return;
    writeLocal(preferences);
  }, [preferences]);

  // On api-ready transition: pull server prefs. If the server has no record
  // yet and the anonymous visitor had already made a choice, push the local
  // choice up so they don't have to re-consent after logging in.
  useEffect(() => {
    if (!apiReady) {
      setPreferences(readLocal());
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    settingsService
      .getCookiePreferences()
      .then(async (server) => {
        if (cancelled) return;
        const local = readLocal();
        const serverHasChoice = !!server.consentedAt;
        const localHasChoice = !!local.consentedAt;
        if (!serverHasChoice && localHasChoice) {
          const synced = await settingsService.updateCookiePreferences({
            analytics: local.analytics,
            marketing: local.marketing,
            personalization: local.personalization,
          });
          if (cancelled) return;
          setPreferences(synced);
          writeLocal(synced);
          applyConsentToTagManagers(synced);
        } else {
          setPreferences(server);
          writeLocal(server);
          applyConsentToTagManagers(server);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPreferences(readLocal());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiReady]);

  const commit = useCallback(
    async (next: Pick<CookiePreferences, OptionalCategory>) => {
      const stamped: CookiePreferences = {
        essential: true,
        ...next,
        consentedAt: new Date().toISOString(),
      };
      setPreferences(stamped);
      writeLocal(stamped);
      applyConsentToTagManagers(stamped);
      if (apiReady) {
        try {
          const saved = await settingsService.updateCookiePreferences(next);
          setPreferences(saved);
          writeLocal(saved);
          applyConsentToTagManagers(saved);
        } catch (e) {
          console.error("Failed to save cookie preferences", e);
        }
      }
    },
    [apiReady],
  );

  const setCategory = useCallback(
    (category: OptionalCategory, enabled: boolean) =>
      commit({
        analytics: category === "analytics" ? enabled : preferences.analytics,
        marketing: category === "marketing" ? enabled : preferences.marketing,
        personalization:
          category === "personalization" ? enabled : preferences.personalization,
      }),
    [commit, preferences.analytics, preferences.marketing, preferences.personalization],
  );

  const acceptAll = useCallback(
    () => commit({ analytics: true, marketing: true, personalization: true }),
    [commit],
  );

  const rejectOptional = useCallback(
    () => commit({ analytics: false, marketing: false, personalization: false }),
    [commit],
  );

  return {
    preferences,
    loading,
    hasConsented: !!preferences.consentedAt,
    setCategory,
    acceptAll,
    rejectOptional,
  };
}
