/**
 * useUserTimezone — the single source of truth for rendering dates in the
 * user's preferred timezone. Reads the IANA zone saved on the Appearance tab
 * of /settings (account_preferences.timezone) and falls back to the browser's
 * detected zone, then to "UTC".
 *
 * Why a dedicated hook: every screen that shows a timestamp (applications,
 * messages, notifications, scheduled events) was previously formatting with
 * the browser's default locale, which meant a user in Tokyo viewing the app
 * from a laptop still on Pacific Time saw the wrong day. Routing every date
 * through this hook + `formatInUserTimezone` keeps the zone consistent with
 * whatever the user picked in settings.
 *
 * Safe to call on unauthenticated pages — it simply returns the fallback.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApiReady } from "@/lib/auth";
import { settingsService } from "@/lib/services/settings-service";
import { intlLocale } from "@shared/i18n";

const FALLBACK_TZ = "UTC";

/** Detect the browser's IANA timezone, or "UTC" if the runtime refuses. */
export function detectBrowserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.length > 0 ? tz : FALLBACK_TZ;
  } catch {
    return FALLBACK_TZ;
  }
}

/** True if the given string is an IANA zone the runtime recognises. */
export function isValidTimezone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Format a Date/ISO string in the given IANA zone. Exposed separately from
 * the hook so non-React code (services, utilities) can use it too.
 */
export function formatInUserTimezone(
  value: Date | string | number | null | undefined,
  timezone: string,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
  locale?: string,
): string {
  if (value == null) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const zone = isValidTimezone(timezone) ? timezone : FALLBACK_TZ;
  // intlLocale() maps the debug 'w' locale to 'en' so Intl doesn't throw
  // RangeError on the single-letter tag.
  return new Intl.DateTimeFormat(intlLocale(locale), { ...options, timeZone: zone }).format(date);
}

type UserTimezoneApi = {
  /** IANA zone name currently in effect. Never empty. */
  timezone: string;
  /** True until the saved preference has been fetched once. */
  loading: boolean;
  /** Format a date in the user's zone AND active i18n locale —
   *  convenience wrapper around `formatInUserTimezone`. */
  format: (
    value: Date | string | number | null | undefined,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
};

/**
 * Read the current user's preferred timezone. Fetches once per auth session,
 * caches in component state, and falls back to the browser's detected zone
 * while the request is in-flight so UIs never render with an empty zone.
 */
export function useUserTimezone(): UserTimezoneApi {
  const apiReady = useApiReady();
  // Pull the active i18n locale so date/month formatting matches the
  // strings around it. Subscribing to i18n re-renders on locale change.
  const { i18n } = useTranslation();
  const [timezone, setTimezone] = useState<string>(() => detectBrowserTimezone());
  const [loading, setLoading] = useState<boolean>(apiReady);

  useEffect(() => {
    if (!apiReady) {
      setTimezone(detectBrowserTimezone());
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    settingsService
      .getAccountSettings()
      .then((a) => {
        if (cancelled) return;
        const saved = a.timezone && isValidTimezone(a.timezone) ? a.timezone : detectBrowserTimezone();
        setTimezone(saved);
      })
      .catch(() => {
        if (cancelled) return;
        setTimezone(detectBrowserTimezone());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiReady]);

  return {
    timezone,
    loading,
    format: (value, options) =>
      formatInUserTimezone(value, timezone, options, i18n.language),
  };
}
