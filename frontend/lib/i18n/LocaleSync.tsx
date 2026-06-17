/**
 * LocaleSync — when an authenticated user lands, read their saved
 * `account_preferences.language` and switch i18next to it. Mounted once
 * inside <AuthProvider>; no UI of its own.
 *
 * Why a dedicated component instead of doing this inside AuthProvider:
 * the auth context doesn't expose `language` (it lives on a separate
 * settings table fetched lazily), and we don't want to grow AuthProvider
 * with an i18n dependency. Reads the shared account-settings cache so the
 * settings endpoint is fetched once and shared with <ThemeSync>.
 */

import { useEffect } from "react";
import { useAccountSettingsQuery } from "@/lib/account/account-settings-query";
import { applyLocale } from "@/lib/i18n/i18n";

export function LocaleSync(): null {
  const { data } = useAccountSettingsQuery();
  useEffect(() => {
    // A failed/absent settings fetch leaves us on the detector-resolved
    // fallback — never break rendering over it.
    if (data?.language) applyLocale(data.language);
  }, [data?.language]);
  return null;
}
