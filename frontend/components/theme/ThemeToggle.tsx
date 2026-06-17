/**
 * ThemeToggle — a one-tap light/dark switch for the top nav. Self-contained:
 * it reads the live resolved theme and flips it through the shared
 * useThemePreference seam (which applies + persists), so consumers just drop
 * <ThemeToggle /> with no props. Available to everyone, signed in or not —
 * next-themes persists to localStorage even without an account.
 */
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useThemePreference } from "@/lib/theme/use-theme-preference";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, select } = useThemePreference();
  const { t } = useTranslation();
  const isDark = resolvedTheme === "dark";
  const label = isDark
    ? t("settings.appearance.switchToLight")
    : t("settings.appearance.switchToDark");

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => select(isDark ? "light" : "dark")}
      className={cn(className)}
    >
      {isDark ? (
        <Sun className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5" aria-hidden="true" />
      )}
    </Button>
  );
}
