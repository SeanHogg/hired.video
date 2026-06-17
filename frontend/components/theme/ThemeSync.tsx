/**
 * ThemeSync — applies the signed-in user's saved `account_settings.theme` to
 * next-themes on load, so the preference follows them across devices (local
 * device persistence is already handled by next-themes' localStorage + the
 * no-FOUC bootstrap script in index.html). Reads the shared account-settings
 * cache, so it adds no fetch of its own. Mounted once; renders nothing.
 */
import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useAccountSettingsQuery } from "@/lib/account/account-settings-query";

export function ThemeSync(): null {
  const { data } = useAccountSettingsQuery();
  const { setTheme } = useTheme();
  useEffect(() => {
    if (data?.theme) setTheme(data.theme);
  }, [data?.theme, setTheme]);
  return null;
}
