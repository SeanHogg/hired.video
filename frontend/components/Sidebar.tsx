import {
  Video,
  Sparkles,
  Briefcase,
  TrendingUp,
  HelpCircle,
  FileText,
  Building2,
  Users,
  Wrench,
  CheckSquare,
  Send,
  X,
  BarChart3,
  ShieldCheck,
  ShoppingBag,
  Store,
  Palette,
  Handshake,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AuthButtons } from "@/components/AuthButtons";
import { useAuth } from "@/lib/auth";
import { useRoleAccess } from "@/hooks/use-role-access";
import { cn } from "@/lib/utils";
import { AccountSwitcher } from "@/components/account/AccountSwitcher";
import { AITokenPill } from "@/components/AITokenPill";
import { PointsPill } from "@/components/PointsPill";
import { UpgradeAccountButton } from "@/components/UpgradeAccountButton";
import { useAdminPermissions } from "@/lib/admin-permissions";

// Icon-name → component map. The Feature Registry (shared/feature-registry.ts)
// stores icon names as strings (it can't import React components); the Sidebar
// resolves them here. A missing/unknown name falls back to a neutral icon.
const NAV_ICONS: Record<string, typeof TrendingUp> = {
  TrendingUp,
  Palette,
  Wrench,
  FileText,
  Briefcase,
  Building2,
  Users,
  CheckSquare,
  Send,
  Store,
  Handshake,
  ShoppingBag,
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  collapsed?: boolean;
}

// Shared nav-item classes — a rail item is either the active brand chip or a
// muted row that lifts on hover. One place so every list (main / admin /
// public) styles identically (DRY) rather than repeating the ternary.
function navItemClasses(active: boolean, collapsed: boolean): string {
  return cn(
    "flex items-center text-sm font-medium rounded-md transition-colors",
    collapsed ? "px-2 py-2 justify-center" : "px-3 py-2",
    active
      ? "bg-rail-active text-rail-active-foreground"
      : "text-rail-foreground/85 hover:text-rail-foreground hover:bg-rail-hover",
  );
}

export default function Sidebar({
  isOpen,
  onClose,
  collapsed = false,
}: SidebarProps) {
  const { isAuthenticated, user } = useAuth();
  const { hasAnyAccess: hasAdminAccess } = useAdminPermissions();
  const location = useLocation();
  const { t } = useTranslation();

  // Main navigation is resolved from the SuperAdmin-curated, per-role manifest
  // (Feature Registry ⊕ role_feature_access overrides) — see useRoleAccess.
  const { navItems } = useRoleAccess();
  const visibleNavigation = navItems().map((s) => ({
    name: t(s.labelKey, { defaultValue: s.label }),
    href: s.href ?? "#",
    icon: NAV_ICONS[s.icon ?? ""] ?? TrendingUp,
    exactMatch: false,
  }));

  // Additional navigation for unauthenticated users (mobile)
  const publicNavigation = [
    { name: t("labels.pricing"), href: "/pricing", icon: BarChart3, exactMatch: false },
    { name: t("labels.about"), href: "/about", icon: HelpCircle, exactMatch: false },
  ];

  // Helper function to determine if a menu item is active
  const isMenuItemActive = (item: { href: string; exactMatch: boolean }) => {
    if (item.exactMatch) {
      return location.pathname === item.href;
    }
    if (item.href === "/") {
      return location.pathname === "/";
    }

    // Tools owns /tools, /Tools, /learning (SEO alias), /chrome-extension, and
    // the course-detail / learner surfaces so the nav stays anchored inside a course.
    if (item.href === "/tools") {
      return (
        location.pathname.startsWith("/tools") ||
        location.pathname.startsWith("/Tools") ||
        location.pathname.startsWith("/learning") ||
        location.pathname.startsWith("/chrome-extension") ||
        location.pathname.startsWith("/courses") ||
        location.pathname.startsWith("/learn")
      );
    }

    // Marketplace also owns the /marketplace/* surface.
    if (item.href === "/search") {
      return (
        location.pathname.startsWith("/search") ||
        location.pathname.startsWith("/marketplace")
      );
    }

    return location.pathname.startsWith(item.href);
  };

  return (
    <>
      {/* Overlay for mobile — sits above the fixed top Navigation (z-50) so
          the dimmed backdrop covers the whole screen and the drawer header
          (with its close X) is never occluded. */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[55] bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          // z-[60] keeps the mobile drawer (and its close X header) above the
          // top Navigation bar (z-50); lg:z-auto drops it back to the docked
          // rail's normal stacking on desktop where there's no overlay.
          "fixed top-0 left-0 h-full bg-rail border-r border-rail-border z-[60] transform transition-all duration-500 ease-in-out",
          collapsed ? "w-16 overflow-hidden" : "w-[90%] lg:w-80 overflow-y-auto",
          isOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0 lg:fixed lg:z-auto",
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header — drawer-only (below lg). On lg+ the docked rail sits beneath
              the full-width fixed Navigation bar, which renders the logo. This
              band mirrors that top nav bar exactly — same `bg-sidebar` surface
              and the same gradient brand logo (Video + Sparkles + gradient
              wordmark) — so the drawer reads as a continuation of the header,
              not a differently-toned panel. */}
          <div className="flex items-center justify-between p-4 border-b border-sidebar-border bg-sidebar lg:hidden">
            <Link to="/" className="flex items-center space-x-2">
              <div className="relative">
                <Video className="h-7 w-7 text-primary" />
                <Sparkles className="h-4 w-4 text-brand-blue absolute -top-1 -right-1" />
              </div>
              {!collapsed && (
                <span className="text-lg font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  hired.video
                </span>
              )}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={t("nav.closeMenu")}
              className="text-foreground hover:bg-muted"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* ── MENU ZONE — scrollable nav, flex-fills the rail. ─────────── */}
          <div
            className={cn(
              "flex-1 p-4 space-y-6 lg:pt-20",
              collapsed ? "overflow-hidden" : "overflow-y-auto",
            )}
          >
            {/* Main Navigation */}
            <div>
              {!collapsed && (
                <h3 className="text-xs font-bold text-rail-muted uppercase tracking-wider mb-3">
                  {t("headings.navigate")}
                </h3>
              )}
              <nav className="space-y-1">
                {visibleNavigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={navItemClasses(isMenuItemActive(item), collapsed)}
                    onClick={onClose}
                    title={collapsed ? item.name : undefined}
                  >
                    <item.icon className={cn("h-4 w-4", !collapsed && "mr-3")} />
                    {!collapsed && item.name}
                  </Link>
                ))}
              </nav>
            </div>

            {/* Admin Navigation - roles with any admin CRUD access */}
            {isAuthenticated && hasAdminAccess && (
              <div>
                {!collapsed && (
                  <h3 className="text-xs font-bold text-rail-muted uppercase tracking-wider mb-3">
                    {t("headings.administration")}
                  </h3>
                )}
                <nav className="space-y-1">
                  <Link
                    to="/admin/dashboard"
                    className={navItemClasses(
                      location.pathname.startsWith("/admin"),
                      collapsed,
                    )}
                    onClick={onClose}
                    title={collapsed ? t("labels.adminPanel") : undefined}
                  >
                    <ShieldCheck className={cn("h-4 w-4", !collapsed && "mr-3")} />
                    {!collapsed && t("labels.adminPanel")}
                  </Link>
                </nav>
              </div>
            )}

            {/* Public Navigation - Only for unauthenticated users */}
            {!isAuthenticated && (
              <div>
                {!collapsed && (
                  <h3 className="text-xs font-bold text-rail-muted uppercase tracking-wider mb-3">
                    {t("headings.discover")}
                  </h3>
                )}
                <nav className="space-y-1">
                  {publicNavigation.map((item) => (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={navItemClasses(isMenuItemActive(item), collapsed)}
                      onClick={onClose}
                      title={collapsed ? item.name : undefined}
                    >
                      <item.icon className={cn("h-4 w-4", !collapsed && "mr-3")} />
                      {!collapsed && item.name}
                    </Link>
                  ))}
                </nav>
              </div>
            )}
          </div>

          {/* Account actions sit between the menu and the usage band — on the
              menu-zone background, not the coloured usage band. */}
          {isAuthenticated && user ? (
            <div
              className={cn(
                "px-4 pb-3 space-y-2",
                collapsed && "px-2",
              )}
            >
              <UpgradeAccountButton
                fullWidth
                collapsed={collapsed}
                onNavigate={onClose}
              />
              {!collapsed && <AccountSwitcher className="w-full" />}
            </div>
          ) : (
            !collapsed && (
              <div className="px-4 pb-3">
                <AuthButtons orientation="vertical" onNavigate={onClose} />
              </div>
            )
          )}

          {/* ── USAGE ZONE — distinct band pinned at the bottom. The pills
              style themselves for a light surface; `.rail-usage-chips` (in
              global.css) re-skins their chip + text to translucent-white so
              they stay legible on the coloured band in both themes. ───────── */}
          <div className="border-t border-rail-usage-border bg-rail-usage text-rail-usage-foreground p-4 space-y-2">
            {!collapsed && (
              <div className="text-[10px] font-bold uppercase tracking-wider text-rail-usage-muted mb-1 px-1">
                {t("headings.usage")}
              </div>
            )}
            <div className="rail-usage-chips space-y-2">
              <AITokenPill collapsed={collapsed} onNavigate={onClose} />
              <PointsPill collapsed={collapsed} onNavigate={onClose} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
