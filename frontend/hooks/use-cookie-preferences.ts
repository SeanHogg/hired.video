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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiReady } from "@/lib/auth";
import { queryKeys } from "@/lib/query-keys";
import { useViewerId } from "@/hooks/queries/use-viewer-id";
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

/** Server read for a signed-in viewer. If the server has no record yet and
 *  the anonymous visitor had already made a choice, push the local choice up
 *  so they don't have to re-consent after logging in. Runs ONCE per identity
 *  (shared React Query entry) no matter how many surfaces mount the hook —
 *  the banner, Settings, /cookies and /privacy/opt-out all read it. */
async function fetchServerPreferences(): Promise<CookiePreferences> {
  const server = await settingsService.getCookiePreferences();
  const local = readLocal();
  const resolved =
    !server.consentedAt && local.consentedAt
      ? await settingsService.updateCookiePreferences({
          analytics: local.analytics,
          marketing: local.marketing,
          personalization: local.personalization,
        })
      : server;
  writeLocal(resolved);
  applyConsentToTagManagers(resolved);
  return resolved;
}

export function useCookiePreferences(): UseCookiePreferencesApi {
  const apiReady = useApiReady();
  const viewerId = useViewerId();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.cookiePreferences.byUser(viewerId);
  const [localPreferences, setLocalPreferences] = useState<CookiePreferences>(() => {
    const initial = readLocal();
    // Fan out the bootstrap state to Consent Mode v2 immediately so any
    // tag that loaded between the index.html consent default and this hook
    // mounting sees the user's actual choice (or implicit GPC opt-out).
    applyConsentToTagManagers(initial);
    return initial;
  });

  // Prefs only change through this hook's `commit` (which writes the cache),
  // so the server row never goes stale within a session.
  const serverQuery = useQuery<CookiePreferences>({
    queryKey,
    queryFn: fetchServerPreferences,
    enabled: apiReady,
    staleTime: Infinity,
  });
  const preferences = apiReady && serverQuery.data ? serverQuery.data : localPreferences;
  const loading = apiReady && serverQuery.isPending;

  // If the visitor was bootstrapped via GPC into an implicit reject, persist
  // that to localStorage immediately so subsequent reads short-circuit and
  // we don't re-stamp `consentedAt` on every refresh.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isGpcEnabled()) return;
    if (window.localStorage.getItem(STORAGE_KEY)) return;
    writeLocal(preferences);
  }, [preferences]);

  // Signed out (or api not ready / failed server read): fall back to the
  // latest localStorage choice.
  useEffect(() => {
    if (!apiReady || serverQuery.isError) setLocalPreferences(readLocal());
  }, [apiReady, serverQuery.isError]);

  const commit = useCallback(
    async (next: Pick<CookiePreferences, OptionalCategory>) => {
      const stamped: CookiePreferences = {
        essential: true,
        ...next,
        consentedAt: new Date().toISOString(),
      };
      setLocalPreferences(stamped);
      writeLocal(stamped);
      applyConsentToTagManagers(stamped);
      if (apiReady) {
        // Drop any in-flight read so it can't overwrite the new choice.
        await queryClient.cancelQueries({ queryKey });
        queryClient.setQueryData<CookiePreferences>(queryKey, stamped);
        try {
          const saved = await settingsService.updateCookiePreferences(next);
          queryClient.setQueryData<CookiePreferences>(queryKey, saved);
          setLocalPreferences(saved);
          writeLocal(saved);
          applyConsentToTagManagers(saved);
        } catch (e) {
          console.error("Failed to save cookie preferences", e);
        }
      }
    },
    // queryKey is derived from viewerId (a fresh array each render), so the
    // stable viewerId stands in for it.
    [apiReady, queryClient, viewerId],
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
