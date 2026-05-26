import {
  Menu,
  Video,
  Sparkles,
  ChevronDown,
  FileText,
  Briefcase,
  Building2,
  Users,
  Wrench,
  CheckSquare,
  Send,
  Clapperboard,
  Chrome,
  ShoppingBag,
  Store,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import HeaderSearch from "@/components/HeaderSearch";
import ShoppingCart from "@/components/ShoppingCart";
import CommunicationHub from "@/components/CommunicationHub";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { Badge } from "@/components/ui/badge";
import { EmulationHeaderControls, useEmulationStyle } from "@/components/EmulationBar";
import { Button } from "@/components/ui/button";
import { AuthButtons } from "@/components/AuthButtons";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface NavigationProps {
  onMenuClick?: () => void;
  onSidebarToggle?: () => void;
  sidebarCollapsed?: boolean;
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
}: NavigationProps) {
  const [isFeaturesOpen, setIsFeaturesOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const emulationStyle = useEmulationStyle();
  const location = useLocation();
  const { t } = useTranslation();
  const featuresRef = useRef<HTMLDivElement>(null);

  // Item shape: `id` matches both `labels.<id>` and `nav.descriptions.<id>`
  // in the catalogue so the translator only manages strings, never code.
  const navigationItems = [
    { id: "videoStudio", href: "/studio", icon: Clapperboard },
    { id: "aiTools", href: "/tools", icon: Wrench },
    { id: "videoResumes", href: "/resumes", icon: FileText },
    { id: "chromeExtensions", href: "/chrome-extension", icon: Chrome },
    { id: "smartJobs", href: "/jobs", icon: Briefcase },
    { id: "marketplace", href: "/search", icon: Store },
    { id: "careerServices", href: "/services", icon: ShoppingBag },
    { id: "forCompanies", href: "/companies", icon: Building2 },
    { id: "professionalNetwork", href: "/people", icon: Users },
    { id: "smartOutreach", href: "/outreach", icon: Send },
    { id: "taskManagement", href: "/tasks", icon: CheckSquare },
  ] as const;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // Only apply the outside-click close behavior for the desktop mega menu.
      // On mobile, this would immediately close the menu before the Link's click
      // event can fire, preventing navigation (especially on iOS Safari).
      const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;
      if (!isDesktop) return;

      if (
        featuresRef.current &&
        !featuresRef.current.contains(event.target as Node)
      ) {
        setIsFeaturesOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const navCls = cn(
    "fixed top-0 left-0 right-0 z-50 border-b transition-colors duration-200",
    emulationStyle === "amber"
      ? "bg-amber-50/95 border-amber-300"
      : emulationStyle === "blue"
      ? "bg-blue-50/95 border-blue-300"
      : "bg-background/80 backdrop-blur-md border-border",
  );

  return (
    <nav className={navCls}>
      <div id="nav-bar-wrapper" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div id="nav-bar" className="flex justify-between items-center h-16">
          {/* Left side: Hamburger (mobile) / Sidebar Toggle (desktop) + Logo */}
          <div className="flex items-center space-x-3">
            {/* Hamburger must stay `lg:hidden` to match Sidebar's `lg:translate-x-0` dock — anything tighter (e.g. `md:hidden`) leaves a 768–1023px dead zone. */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onMenuClick}
              className="lg:hidden"
              aria-label={t("nav.openMenu")}
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Desktop Sidebar Collapse Toggle */}
            <Button
              variant="ghost"
              onClick={onSidebarToggle}
              className="hidden lg:flex h-10 w-10 px-2 py-2 justify-center -ml-4"
              title={sidebarCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
              aria-label={sidebarCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
            >
              <Menu className="h-4 w-4" />
            </Button>

            {/* Logo */}
            <Link to="/" className="flex items-center space-x-2">
              <div className="relative">
                <Video className="h-8 w-8 text-primary" />
                <Sparkles className="h-4 w-4 text-brand-blue absolute -top-1 -right-1" />
              </div>
              <span className="hidden sm:inline text-xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                hired.video
              </span>
            </Link>
          </div>

          {/* Header search — hidden on the home page where the hero + sticky search are already prominent,
           * and on top-level surfaces that relocated the search inline (PageHeader `search` slot) because
           * users were missing it docked in the top bar. The inline suppression only applies to authed
           * users; unauth visitors landing on the marketing branches of those routes get no inline
           * search slot, so we keep the global one to preserve the SEO funnel. Keep this list in sync
           * with the pages that pass `search={<HeaderSearch />}` to PageHeader. */}
          {location.pathname !== "/" && !(isAuthenticated && pathIsInlineHeaderSearch(location.pathname)) && (
            <div className="flex-1 max-w-md mx-2 sm:mx-4 min-w-0">
              <HeaderSearch />
            </div>
          )}

          {/* Desktop Navigation - Hidden on mobile */}
          <div className="hidden md:flex items-center space-x-8">
            {!isAuthenticated && (
              <>
                {/* Features Mega Menu */}
                <div className="relative" ref={featuresRef}>
                  <button
                    onClick={() => setIsFeaturesOpen(!isFeaturesOpen)}
                    onMouseEnter={() => setIsFeaturesOpen(true)}
                    className="flex items-center gap-1 text-foreground/70 hover:text-foreground transition-colors font-medium"
                  >
                    {t("labels.features")}
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${isFeaturesOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isFeaturesOpen && (
                    <div
                      className="absolute top-full left-0 mt-2 w-[600px] bg-background border border-border rounded-lg shadow-lg p-6 z-50"
                      onMouseLeave={() => setIsFeaturesOpen(false)}
                    >
                      <div className="grid grid-cols-2 gap-4">
                        {navigationItems.map((item) => {
                          const Icon = item.icon;
                          return (
                            <Link
                              key={item.id}
                              to={item.href}
                              className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent transition-colors group"
                              onClick={() => setIsFeaturesOpen(false)}
                            >
                              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                                <Icon className="h-5 w-5 text-primary" />
                              </div>
                              <div className="flex-1">
                                <h4 className="font-semibold text-sm text-foreground">
                                  {t(`labels.${item.id}`)}
                                </h4>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {t(`nav.descriptions.${item.id}`)}
                                </p>
                              </div>
                            </Link>
                          );
                        })}
                      </div>

                      <div className="border-t border-border mt-4 pt-4">
                        <Link
                          to="/pricing"
                          className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                          onClick={() => setIsFeaturesOpen(false)}
                        >
                          {t("actions.viewAllFeatures")}
                          <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                <Link
                  to="/pricing"
                  className={cn(
                    "transition-colors font-medium",
                    location.pathname === "/pricing"
                      ? "text-primary"
                      : "text-foreground/70 hover:text-foreground",
                  )}
                >
                  {t("labels.pricing")}
                </Link>
              </>
            )}
          </div>

          {/* Right side: SuperAdmin controls + Inbox + Shopping Cart + Desktop CTA Buttons */}
          <div className="flex items-center space-x-4">
            {/* SuperAdmin controls (idle or active) */}
            <EmulationHeaderControls />

            {/* Unified communication hub - bell with merged inbox */}
            <CommunicationHub />

            {/* Shopping Cart - Visible on both mobile and desktop */}
            <ShoppingCart />

            {/* Language switcher — same component used in BrandHeader +
                Footer so a visitor can switch language from any chrome
                surface. Hidden below md to keep the mobile top bar tight;
                the Footer mount stays available on mobile. */}
            <LocaleSwitcher variant="compact" className="hidden md:inline-flex" />

            {/* Desktop CTA Buttons - Hidden on mobile */}
            {!isAuthenticated && <AuthButtons className="hidden md:flex" />}
          </div>
        </div>
      </div>
    </nav>
  );
}
