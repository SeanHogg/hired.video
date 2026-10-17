/**
 * useThemePreference — the single seam for reading and changing the app color
 * theme. Wraps next-themes (which applies the `dark` class + persists to
 * localStorage) and, for signed-in users, mirrors the choice to the server
 * (`account_settings.theme`) so it follows them across devices.
 *
 * Both the nav <ThemeToggle> and the Settings appearance select consume this,
 * so the "apply + persist + cache-patch" logic lives in exactly one place
 * rather than being duplicated (or prop-drilled) at each call site.
 */
import { useCallback } from "react";
import { useTheme } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  settingsService,
  type AccountSettings,
} from "@/lib/services/settings-service";
import { ACCOUNT_SETTINGS_QUERY_KEY } from "@/lib/account/account-settings-query";
import { logger } from "@/lib/logger";

export type ThemeChoice = NonNullable<AccountSettings["theme"]>;

export function useThemePreference() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const select = useCallback(
    (next: ThemeChoice) => {
      // 1) Apply instantly + persist to localStorage (next-themes).
      setTheme(next);
      if (!isAuthenticated) return;
      // 2) Keep the shared cache authoritative without a refetch…
      queryClient.setQueryData<AccountSettings | undefined>(
        ACCOUNT_SETTINGS_QUERY_KEY,
        (prev) => (prev ? { ...prev, theme: next } : prev),
      );
      // 3) …then mirror to the server for cross-device sync. Fire-and-forget:
      // a failed persist must never block the visual switch.
      settingsService
        .updateAccountSettings({ theme: next })
        .catch((e) =>
          logger.error("Failed to persist theme preference", {
            error: e instanceof Error ? e.message : String(e),
          }),
        );
    },
    [setTheme, isAuthenticated, queryClient],
  );

  return {
    /** The user's explicit choice: "light" | "dark" | "system". */
    theme: (theme ?? "system") as ThemeChoice,
    /** What "system" currently resolves to: "light" | "dark". */
    resolvedTheme: (resolvedTheme ?? "light") as "light" | "dark",
    select,
  };
}
