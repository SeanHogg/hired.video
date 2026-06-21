/**
 * LocaleSwitcher — visitor-facing language picker.
 *
 * Mounted in BrandHeader, Navigation, and Footer so a logged-out visitor
 * can switch language before signup. Logged-in users get the same control
 * here as a quick mirror of the persisted picker in Settings.
 *
 * Convention notes (matches LinkedIn / Stripe / GitHub):
 *   - Each language label renders in its OWN script ("Español", not
 *     "Spanish") regardless of the active UI locale. These are proper
 *     nouns, not translatable strings.
 *   - The active locale is shown as the trigger label so the user can
 *     tell at a glance which one is set.
 *   - The W-debug locale is hidden from non-super-admins via a role
 *     check inside this component (per the DRY rule — consumers don't
 *     prop-drill a `canShowDebug` boolean).
 *
 * Persistence chain:
 *   - i18next-browser-languagedetector persists the choice to cookie +
 *     localStorage automatically when `changeLanguage` is called.
 *   - If the user is authenticated, we also fire-and-forget the
 *     persisted account pref so the choice survives across devices.
 */

import { Globe, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth, USER_ROLES } from "@/lib/auth";
import { applyLocale } from "@/lib/i18n/i18n";
import { NATIVE_LABELS, SHORT_TAGS } from "@/lib/i18n/locale-labels";
import { settingsService } from "@/lib/services/settings-service";
import {
  PUBLIC_LOCALES,
  normalizeLocale,
  type Locale,
} from "@shared/i18n";
import { cn } from "@/lib/utils";

export type LocaleSwitcherVariant = "compact" | "labeled";

export interface LocaleSwitcherProps {
  /** "compact" = globe icon + short tag (header use). "labeled" = globe
   *  icon + active language native name (footer use). */
  variant?: LocaleSwitcherVariant;
  className?: string;
  /** Override the dropdown alignment when the trigger sits at the edge
   *  of its container (default: "end" works for top-right mounts). */
  align?: "start" | "center" | "end";
  /** Trigger button style — defaults to the borderless "ghost". The top
   *  nav passes "outline" so it matches the cart's bordered-box chrome. */
  buttonVariant?: ButtonProps["variant"];
}

export function LocaleSwitcher({
  variant = "compact",
  className,
  align = "end",
  buttonVariant = "ghost",
}: LocaleSwitcherProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const isSuperAdmin = user?.role === USER_ROLES.SUPER_ADMIN;
  const available: readonly Locale[] = isSuperAdmin
    ? ([...PUBLIC_LOCALES, "w"] as const)
    : PUBLIC_LOCALES;

  const active = normalizeLocale(i18n.language) ?? "en";

  const handleSelect = async (loc: Locale) => {
    if (loc === active) return;
    applyLocale(loc);
    if (user) {
      try {
        await settingsService.updateAccountSettings({ language: loc });
      } catch (e) {
        // Detector cookie already holds the choice — a failed persist
        // doesn't break the in-session switch.
        console.error("LocaleSwitcher: failed to persist language", e);
      }
    }
  };

  const triggerLabel =
    variant === "labeled" ? NATIVE_LABELS[active] : SHORT_TAGS[active];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={buttonVariant}
          size="sm"
          className={cn(
            "gap-2 text-muted-foreground hover:text-foreground",
            className,
          )}
          aria-label={t("chrome.localeSwitcher.label")}
        >
          <Globe className="h-4 w-4" />
          <span>{triggerLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[12rem]">
        <DropdownMenuLabel>
          {t("chrome.localeSwitcher.title")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {available.map((loc) => {
          const isActive = loc === active;
          return (
            <DropdownMenuItem
              key={loc}
              onSelect={() => void handleSelect(loc)}
              className="flex items-center justify-between gap-3"
            >
              <span>{NATIVE_LABELS[loc]}</span>
              {isActive ? (
                <Check className="h-4 w-4 text-primary" aria-hidden />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default LocaleSwitcher;
