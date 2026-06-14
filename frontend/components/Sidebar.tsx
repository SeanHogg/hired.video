import {
  Video,
  Briefcase,
  TrendingUp,
  Settings,
  Crown,
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
  Heart,
  Palette,
  Handshake,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AuthButtons } from "@/components/AuthButtons";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { useAuth } from "@/lib/auth";
import { useRoleAccess } from "@/hooks/use-role-access";
import { useSubscription } from "@/lib/hooks/useSubscription";
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
  /** Desktop-only: collapse the docked rail to its icon strip. The header
   *  (X) uses this on `lg+` where the sidebar can't be dismissed entirely. */
  onCollapse?: () => void;
  collapsed?: boolean;
}

export default function Sidebar({
  isOpen,
  onClose,
  onCollapse,
  collapsed = false,
}: SidebarProps) {
  const { isAuthenticated, user } = useAuth();
  const { hasAnyAccess: hasAdminAccess } = useAdminPermissions();
  const { isPro } = useSubscription();
  const location = useLocation();
  const { t } = useTranslation();

  // Main navigation is now resolved from the SuperAdmin-curated, per-role
  // manifest (Feature Registry ⊕ role_feature_access overrides), so each role
  // only sees its relevant items and the owner can tune any role's menu live
  // from /admin/role-access — no code change. useRoleAccess keys on the
  // effective role, so it respects SuperAdmin impersonation + Preview-as-role.
  // Replaces the old hardcoded `hideForRoles` deny-list (#1995 → #2037).
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
    // For non-exact matches, check if current path starts with the menu item path
    // But make sure we don't match "/" for everything
    if (item.href === "/") {
      return location.pathname === "/";
    }

    // Special handling for tools — match /tools, /Tools, /learning (the
    // SEO alias for the Learning Content Library tab), /chrome-extension,
    // and the course-detail / learner surfaces (/courses/* + /learn/*) so
    // the nav stays anchored while a learner is inside a course.
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

    // Marketplace also owns the /marketplace/* surface — preview pages,
    // listings, and the upcoming reviews/cross-sell features all highlight
    // the same nav item.
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
          "fixed top-0 left-0 h-full bg-background border-r border-border z-[60] transform transition-all duration-500 ease-in-out",
          collapsed ? "w-16 overflow-hidden" : "w-[90%] lg:w-80 overflow-y-auto",
          // Mobile: hidden by default, show when isOpen
          isOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: always visible, ignore isOpen state
          "lg:translate-x-0 lg:fixed lg:z-auto",
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <Link to="/" className="flex items-center space-x-2">
              <Video className="h-6 w-6 text-primary" />
              {!collapsed && (
                <span className="font-bold text-lg bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  hired.video
                </span>
              )}
            </Link>
            {/* Mobile: dismiss the slide-out drawer entirely. */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="lg:hidden"
              aria-label={t("nav.closeMenu")}
            >
              <X className="h-5 w-5" />
            </Button>
            {/* Desktop: the rail is docked and can't be hidden, so (X)
                collapses it to the icon strip. Hidden once already
                collapsed — the nav's menu button re-expands it. */}
            {!collapsed && onCollapse && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onCollapse}
                className="hidden lg:flex"
                aria-label={t("nav.collapseSidebar")}
                title={t("nav.collapseSidebar")}
              >
                <X className="h-5 w-5" />
              </Button>
            )}
          </div>

          <div
            className={cn(
              "flex-1 p-4 space-y-6",
              collapsed ? "overflow-hidden" : "overflow-y-auto",
            )}
          >
            {/* Main Navigation */}
            <div>
              {!collapsed && (
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {t("headings.navigate")}
                </h3>
              )}
              <nav className="space-y-1">
                {visibleNavigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn(
                      "flex items-center text-sm font-medium rounded-md transition-colors",
                      collapsed ? "px-2 py-2 justify-center" : "px-3 py-2",
                      isMenuItemActive(item)
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                    onClick={onClose}
                    title={collapsed ? item.name : undefined}
                  >
                    <item.icon
                      className={cn("h-4 w-4", !collapsed && "mr-3")}
                    />
                    {!collapsed && item.name}
                  </Link>
                ))}
              </nav>
            </div>

            {/* Admin Navigation - roles with any admin CRUD access */}
            {isAuthenticated && hasAdminAccess && (
              <div>
                {!collapsed && (
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    {t("headings.administration")}
                  </h3>
                )}
                <nav className="space-y-1">
                  <Link
                    to="/admin/dashboard"
                    className={cn(
                      "flex items-center text-sm font-medium rounded-md transition-colors",
                      collapsed ? "px-2 py-2 justify-center" : "px-3 py-2",
                      location.pathname.startsWith("/admin")
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted",
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
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    {t("headings.discover")}
                  </h3>
                )}
                <nav className="space-y-1">
                  {publicNavigation.map((item) => (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={cn(
                        "flex items-center text-sm font-medium rounded-md transition-colors",
                        collapsed ? "px-2 py-2 justify-center" : "px-3 py-2",
                        isMenuItemActive(item)
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted",
                      )}
                      onClick={onClose}
                      title={collapsed ? item.name : undefined}
                    >
                      <item.icon
                        className={cn("h-4 w-4", !collapsed && "mr-3")}
                      />
                      {!collapsed && item.name}
                    </Link>
                  ))}
                </nav>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border p-4 space-y-2">
            {/* AI Token Budget Pill — self-gates on auth: shows a free-tier
                teaser linking to /pricing for signed-out visitors so the
                marketing surface is always reachable from the sidebar. */}
            <div className={cn(collapsed ? "mb-1" : "mb-3")}>
              <AITokenPill collapsed={collapsed} onNavigate={onClose} />
            </div>

            {/* Points + streak pill — self-gates on auth + role: shows a
                "X badges to earn" teaser linking to /rewards for signed-out
                visitors; renders null for ineligible authed roles. */}
            <div className={cn(collapsed ? "mb-1" : "mb-3")}>
              <PointsPill collapsed={collapsed} onNavigate={onClose} />
            </div>

            {isAuthenticated && user ? (
              <>
                {/* Upgrade Account CTA — free-tier users only */}
                <UpgradeAccountButton
                  fullWidth
                  collapsed={collapsed}
                  className={cn(collapsed ? "mb-1" : "mb-3")}
                  onNavigate={onClose}
                />

                {/* Account Switcher */}
                {!collapsed && (
                  <div className="mb-3">
                    <AccountSwitcher className="w-full" />
                  </div>
                )}

                {/* User Profile Section */}
                <Link
                  to="/profile"
                  className={cn(
                    "flex items-center text-sm hover:bg-accent rounded-md transition-colors p-2",
                    collapsed ? "justify-center" : "gap-3",
                  )}
                  onClick={onClose}
                  title={collapsed ? t("labels.profileOf", { name: user.name }) : undefined}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.avatar} />
                    <AvatarFallback className="text-xs">
                      {user.name
                        ?.split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {!collapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {user.name}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs text-muted-foreground truncate capitalize">
                          {user.role?.replace("_", " ")}
                        </p>
                        {isPro ? (
                          <Crown className="h-3 w-3 text-amber-500 flex-shrink-0" />
                        ) : (
                          <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">
                            {t("labels.freeTier")}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </Link>

                {/* Wishlist — saved courses */}
                <Link
                  to="/wishlist"
                  className={cn(
                    "flex items-center text-sm rounded-md transition-colors",
                    collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                    isMenuItemActive({ href: "/wishlist", exactMatch: false })
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                  onClick={onClose}
                  title={collapsed ? t("labels.wishlist", { defaultValue: "Wishlist" }) : undefined}
                >
                  <Heart className="h-4 w-4" />
                  {!collapsed && t("labels.wishlist", { defaultValue: "Wishlist" })}
                </Link>

                {/* Settings */}
                <Link
                  to="/settings"
                  className={cn(
                    "flex items-center text-sm rounded-md transition-colors",
                    collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                    isMenuItemActive({ href: "/settings", exactMatch: false })
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                  onClick={onClose}
                  title={collapsed ? t("labels.accountSettings") : undefined}
                >
                  <Settings className="h-4 w-4" />
                  {!collapsed && t("labels.accountSettings")}
                </Link>

                {/* Sign Out */}
                <SignOutButton collapsed={collapsed} onAfter={onClose} />
              </>
            ) : (
              <>
                {/* Authentication Buttons for Unauthenticated Users */}
                {!collapsed && (
                  <AuthButtons
                    orientation="vertical"
                    onNavigate={onClose}
                    className="mb-4"
                  />
                )}

                {/* Settings and Help for Unauthenticated Users */}
                <Link
                  to="/settings"
                  className={cn(
                    "flex items-center text-sm rounded-md transition-colors",
                    collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                    isMenuItemActive({ href: "/settings", exactMatch: false })
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                  onClick={onClose}
                  title={collapsed ? t("labels.accountSettings") : undefined}
                >
                  <Settings className="h-4 w-4" />
                  {!collapsed && t("labels.accountSettings")}
                </Link>
                <Link
                  to="/help"
                  className={cn(
                    "flex items-center text-sm rounded-md transition-colors",
                    collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                    isMenuItemActive({ href: "/help", exactMatch: false })
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                  onClick={onClose}
                  title={collapsed ? t("labels.helpSupport") : undefined}
                >
                  <HelpCircle className="h-4 w-4" />
                  {!collapsed && t("labels.helpSupport")}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
