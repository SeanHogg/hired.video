/**
 * Canonical read-through cache for the signed-in user's account settings
 * (`/api/settings/account`). Both <LocaleSync> (applies `language`) and
 * <ThemeSync> (applies `theme`) read from this single React-Query entry, so
 * the settings endpoint is fetched once per session and deduped across all
 * consumers — never one fetch per syncing concern.
 *
 * Mutations that change a field (e.g. the appearance theme select) should
 * optimistically patch `ACCOUNT_SETTINGS_QUERY_KEY` so the cache stays the
 * source of truth without an extra round-trip.
 */
import { useQuery } from "@tanstack/react-query";
import { useApiReady } from "@/lib/auth";
import { settingsService } from "@/lib/services/settings-service";

export const ACCOUNT_SETTINGS_QUERY_KEY = ["account-settings"] as const;

export function useAccountSettingsQuery() {
  // The settings endpoint requires a verified account; gating on apiReady keeps
  // it from 403-ing (and burning rate-limit budget) during the verify-email gate.
  const apiReady = useApiReady();
  return useQuery({
    queryKey: ACCOUNT_SETTINGS_QUERY_KEY,
    queryFn: () => settingsService.getAccountSettings(),
    enabled: apiReady,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}
