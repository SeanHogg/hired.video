import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Moon } from "lucide-react";
import { AuthButtons } from "@/components/AuthButtons";
import { useThemePreference } from "@/lib/theme/use-theme-preference";
import {
  PUBLIC_NAV_LINKS,
  PUBLIC_SECONDARY_LINKS,
  isPublicNavLinkActive,
} from "@/lib/nav/public-nav";
import { cn } from "@/lib/utils";

const SECONDARY_ROW =
  "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Light/dark switch as a labelled menu row (the phone menu's "Dark mode"). */
function DarkModeRow() {
  const { t } = useTranslation();
  const { resolvedTheme, select } = useThemePreference();
  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-pressed={isDark}
      onClick={() => select(isDark ? "light" : "dark")}
      className={SECONDARY_ROW}
    >
      <Moon className="h-4 w-4" aria-hidden="true" />
      <span className="flex-1 text-left">{t("nav.drawer.darkMode")}</span>
    </button>
  );
}

/**
 * The signed-out phone menu (consolidated-header mockup, Mobile board): the
 * five header links large, a divider, Rewards + Dark mode, and Sign in + Make
 * your video pinned at the bottom. Rendered inside the Sidebar drawer.
 */
export function PublicDrawerMenu({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
    <div className="flex flex-1 flex-col">
      <nav aria-label={t("nav.drawer.ariaLabel")} className="flex flex-col gap-0.5 px-3 pt-2">
        {PUBLIC_NAV_LINKS.map((link) => {
          const active = isPublicNavLinkActive(link, pathname);
          return (
            <Link
              key={link.href}
              to={link.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[52px] items-center rounded-[10px] px-3 text-[17px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted",
              )}
            >
              {t(link.labelKey)}
            </Link>
          );
        })}
      </nav>

      <div className="mx-6 mt-2 flex flex-col gap-1 border-t border-border pt-4">
        {PUBLIC_SECONDARY_LINKS.map((link) => (
          <Link
            key={link.href}
            to={link.href}
            onClick={onNavigate}
            aria-current={isPublicNavLinkActive(link, pathname) ? "page" : undefined}
            className={cn(SECONDARY_ROW, "-mx-3 w-auto")}
          >
            {t(link.labelKey)}
          </Link>
        ))}
        <div className="-mx-3">
          <DarkModeRow />
        </div>
      </div>

      <div
        className="mt-auto border-t border-border bg-background px-4 pt-3"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <AuthButtons layout="bar" onNavigate={onNavigate} />
      </div>
    </div>
  );
}
