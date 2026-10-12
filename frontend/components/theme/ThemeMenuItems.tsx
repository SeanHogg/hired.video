/**
 * ThemeMenuItems — the light / dark / system choice as plain menu items
 * (leading with its own separator) for embedding INSIDE an existing
 * DropdownMenuContent, e.g. the avatar menu that now owns every top-bar
 * control. Reads and writes through the same `useThemePreference` seam as the
 * nav <ThemeToggle> and the Settings appearance select, so there is still one
 * apply + persist path (DRY).
 */
import { useTranslation } from "react-i18next";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useThemePreference, type ThemeChoice } from "@/lib/theme/use-theme-preference";

const CHOICES: ReadonlyArray<{ value: ThemeChoice; labelKey: string; Icon: typeof Sun }> = [
  { value: "light", labelKey: "settings.appearance.themeOption.light", Icon: Sun },
  { value: "dark", labelKey: "settings.appearance.themeOption.dark", Icon: Moon },
  { value: "system", labelKey: "settings.appearance.themeOption.system", Icon: Monitor },
];

export function ThemeMenuItems(): JSX.Element {
  const { t } = useTranslation();
  const { theme, select } = useThemePreference();

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>{t("settings.appearance.themeLabel")}</DropdownMenuLabel>
      {CHOICES.map(({ value, labelKey, Icon }) => (
        <DropdownMenuItem
          key={value}
          onSelect={() => select(value)}
          className="flex items-center justify-between gap-3"
        >
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4" aria-hidden="true" />
            {t(labelKey)}
          </span>
          {theme === value ? <Check className="h-4 w-4 text-primary" aria-hidden="true" /> : null}
        </DropdownMenuItem>
      ))}
    </>
  );
}
