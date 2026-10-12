import { Menu } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import HeaderSearch from "@/components/HeaderSearch";
import CartPanel from "@/components/cart/CartPanel";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { EmulationExpiryWatcher, useEmulationStyle } from "@/components/EmulationBar";
import { HeaderActionsOutlet } from "@/components/chrome/HeaderActions";
import { Button } from "@/components/ui/button";
import { AuthButtons } from "@/components/AuthButtons";
import { BrandLogo } from "@/components/BrandHeader";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { PUBLIC_NAV_LINKS, isPublicNavLinkActive } from "@/lib/nav/public-nav";
import { useHashScroll } from "@/hooks/use-hash-scroll";

interface NavigationProps {
  onMenuClick?: () => void;
  onSidebarToggle?: () => void;
  sidebarCollapsed?: boolean;
  /** Full-height editing surface (AppShell "workspace", e.g. the kit workspace): the bar
   *  spans the full width like the workspace under it, and carries no
   *  marketing links — only the page's own actions and the account controls. */
  workspace?: boolean;
}

/**
 * Routes whose pages render their own HeaderSearch inline (via PageHeader's
 * `search` slot). The global top-bar search is suppressed on these exact
 * paths so the same input doesn't appear twice. Detail surfaces (e.g.
 * `/jobs/123`) are unaffected — they keep the global search because they
 * don't host an inline one.
 */
const INLINE_HEADER_SEARCH_ROUTES: ReadonlySet<string> = new Set([
  "/jobs",
  "/tasks",
  "/tools",
  "/people",
  "/companies",
  "/resumes",
  "/search",
  "/studio",
]);

function pathIsInlineHeaderSearch(pathname: string): boolean {
  return INLINE_HEADER_SEARCH_ROUTES.has(pathname);
}

export default function Navigation({
  onMenuClick,
  onSidebarToggle,
  sidebarCollapsed,
  workspace = false,
}: NavigationProps) {
  const { isAuthenticated } = useAuth();
  const emulationStyle = useEmulationStyle();
  const location = useLocation();
  const { t } = useTranslation();
  // `/#watch`-style links (header + phone menu) land on their section.
  useHashScroll();

  const navCls = cn(
    "fixed top-0 left-0 right-0 z-50 border-b transition-colors duration-200",
    emulationStyle === "amber"
      ? "bg-amber-50/95 border-amber-300"
      : emulationStyle === "blue"
      ? "bg-accent/95 border-primary/30"
      : "bg-sidebar/80 backdrop-blur-md border-sidebar-border",
  );

  return (
    <nav className={navCls}>
      <div
        id="nav-bar-wrapper"
        className={cn(
          "mx-auto",
          // Signed-in = the app bar spans the full width, so the menu + logo
          // sit far left over the docked rail (a centred max-width column
          // floated them into the middle on wide screens). A full-width
          // workspace gets the same full-width bar for every visitor, so its
          // logo lines up with the panel edge under it. Signed-out pages = the
          // marketing header: same 1200px / 24px column as the landing bands
          // so the logo and CTA line up with the content.
          isAuthenticated || workspace ? "px-4 sm:px-6" : "max-w-[1200px] px-4 sm:px-6",
        )}
      >
        <div id="nav-bar" className="flex justify-between items-center h-16">
          {/* Left side: Hamburger (mobile) / Sidebar Toggle (desktop) + Logo.
              `shrink-0` so the left group keeps its width and the flexible
              header search shrinks first; tight gap on mobile so the hamburger
              + logo read as one left-anchored group. */}
          <div className="flex items-center shrink-0 space-x-1 sm:space-x-3">
            {/* Hamburger must stay `lg:hidden` to match Sidebar's `lg:translate-x-0` dock — anything tighter (e.g. `md:hidden`) leaves a 768–1023px dead zone. Plain (ghost) icon — no border/box, just the hamburger. */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onMenuClick}
              className="lg:hidden -ml-2 h-11 w-11"
              aria-label={t("nav.openMenu")}
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Desktop Sidebar Collapse Toggle — only when the rail is docked
                (signed-in app); signed-out pages have no desktop rail. */}
            {onSidebarToggle && (
              <Button
                variant="ghost"
                onClick={onSidebarToggle}
                className="hidden lg:flex h-10 w-10 px-2 py-2 justify-center -ml-4"
                title={sidebarCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
                aria-label={sidebarCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
              >
                <Menu className="h-4 w-4" />
              </Button>
            )}

            {/* Logo — shared canonical mark (see BrandLogo). */}
            <BrandLogo />
          </div>

          {/* Header search (signed-in only) — hidden on the home page and on
           * top-level surfaces that render it inline via PageHeader's `search`
           * slot (keep INLINE_HEADER_SEARCH_ROUTES in sync with those pages).
           * Signed-out visitors get the lean marketing header instead. */}
          {isAuthenticated && location.pathname !== "/" && !pathIsInlineHeaderSearch(location.pathname) && (
            <div className="flex-none md:flex-1 min-w-0 md:max-w-md ml-auto md:ml-4 mr-1 md:mr-4">
              <HeaderSearch />
            </div>
          )}

          {/* Signed-out primary links (consolidated-header mockup) — plain
              links, no dropdowns. lg+ only: below that the five links don't
              fit beside the CTAs, and the hamburger drawer carries them. */}
          {!isAuthenticated && !workspace && (
            <ul className="hidden lg:flex items-center gap-x-1 ml-8 mr-auto">
              {PUBLIC_NAV_LINKS.map((link) => {
                const active = isPublicNavLinkActive(link, location.pathname);
                return (
                  <li key={link.href}>
                    <Link
                      to={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "bg-primary/10 font-semibold text-primary"
                          : "font-medium text-foreground/80 hover:text-foreground",
                      )}
                    >
                      {t(link.labelKey)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Right side. Signed in, the bar carries ONE control: the avatar.
              Inbox, cart, appearance, language, SuperAdmin tools and every
              account link live inside <UserMenu> (its badge shows unread), so
              the bar stays legible at any width. Signed out: theme toggle,
              then Sign in + Make your video (desktop; the phone bottom bar and
              menu drawer carry those below md). Language lives in the footer.
              `shrink-0` so this group is never clipped (the search shrinks). */}
          <div className={cn("flex items-center shrink-0 gap-1 sm:gap-2", !isAuthenticated && "ml-auto")}>
            {!isAuthenticated && (
              <ThemeToggle
                variant="ghost"
                className="hidden md:inline-flex h-11 w-11 text-muted-foreground hover:text-foreground"
              />
            )}
            {!isAuthenticated && <AuthButtons className="hidden md:flex" />}

            {/* Page actions (e.g. the kit's Canvas + Post video) — pages fill
                this through <HeaderActions>, so a page never stacks a second
                header under this one. Collapses when unused. */}
            <HeaderActionsOutlet />

            <UserMenu />
          </div>
        </div>
      </div>

      {/* Chrome that renders nothing until something asks for it: the cart
          drawer (opened from the avatar menu and every "add to cart" button)
          and the impersonation-expiry countdown, which can't live in the menu
          because menu content unmounts on close. */}
      <CartPanel />
      <EmulationExpiryWatcher />
    </nav>
  );
}
