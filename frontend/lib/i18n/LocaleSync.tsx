/**
 * LocaleSync — when an authenticated user lands, fetch their saved
 * `account_preferences.language` and switch i18next to it. Mounted once
 * inside <AuthProvider>; no UI of its own.
 *
 * Why a dedicated component instead of doing this inside AuthProvider:
 * the auth context doesn't expose `language` (it lives on a separate
 * settings table fetched lazily), and we don't want to grow AuthProvider
 * with an i18n dependency.
 */

import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { settingsService } from "@/lib/services/settings-service";
import { applyLocale } from "@/lib/i18n/i18n";

export function LocaleSync(): null {
  const { isAuthenticated } = useAuth();
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    settingsService
      .getAccountSettings()
      .then((s) => {
        if (cancelled) return;
        applyLocale(s.language);
      })
      .catch(() => {
        // Stay on the detector-resolved fallback; a failed settings
        // fetch should never break rendering.
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);
  return null;
}
