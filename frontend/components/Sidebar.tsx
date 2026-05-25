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
  Calendar,
  MapPin,
  Send,
  LogOut,
  X,
  BarChart3,
  ShieldCheck,
  ShoppingBag,
  Store,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AuthButtons } from "@/components/AuthButtons";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { cn } from "@/lib/utils";
import { AccountSwitcher } from "@/components/account/AccountSwitcher";
import { AITokenPill } from "@/components/AITokenPill";
import { PointsPill } from "@/components/PointsPill";
import { UpgradeAccountButton } from "@/components/UpgradeAccountButton";
import { useAdminPermissions } from "@/lib/admin-permissions";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  collapsed?: boolean;
}

export default function Sidebar({
  isOpen,
  onClose,
  collapsed = false,
}: SidebarProps) {
  const { isAuthenticated, user, logout } = useAuth();
  const { hasAnyAccess: hasAdminAccess } = useAdminPermissions();
  const { isPro } = useSubscription();
  const location = useLocation();
  const { t } = useTranslation();

  // Main navigation items - shown to all users
  const navigation = [
    {
      name: t("labels.dashboard"),
      href: "/dashboard",
      icon: TrendingUp,
      exactMatch: false,
    },
    { name: t("labels.resumes"), href: "/resumes", icon: FileText, exactMatch: false },
    { name: t("labels.studio"), href: "/studio", icon: Video, exactMatch: false },
    { name: t("labels.jobs"), href: "/jobs", icon: Briefcase, exactMatch: false },
    {
      name: t("labels.companies"),
      href: "/companies",
      icon: Building2,
      exactMatch: false,
    },
    { name: t("labels.people"), href: "/people", icon: Users, exactMatch: false },
    { name: t("labels.events", { defaultValue: "Events" }), href: "/events", icon: Calendar, exactMatch: false },
    { name: t("labels.map", { defaultValue: "Map" }), href: "/map", icon: MapPin, exactMatch: false },
    { name: t("labels.tools"), href: "/tools", icon: Wrench, exactMatch: false },
    { name: t("labels.tasksAndEvents", { defaultValue: "Tasks / Events" }), href: "/tasks", icon: CheckSquare, exactMatch: false },
    { name: t("labels.outreach"), href: "/outreach", icon: Send, exactMatch: false },
    { name: t("labels.marketplace"), href: "/search", icon: Store, exactMatch: false },
    { name: t("labels.myServices"), href: "/services", icon: ShoppingBag, exactMatch: false },
  ];

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

    // Special handling for tools - match /tools, /Tools, and /chrome-extension
    if (item.href === "/tools") {
      return (
        location.pathname.startsWith("/tools") ||
        location.pathname.startsWith("/Tools") ||
        location.pathname.startsWith("/chrome-extension")
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
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed top-0 left-0 h-full bg-background border-r border-border z-50 transform transition-all duration-500 ease-in-out",
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
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="lg:hidden"
            >
              <X className="h-5 w-5" />
            </Button>
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
                {navigation.map((item) => (
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
            {isAuthenticated && user ? (
              <>
                {/* Upgrade Account CTA — free-tier users only */}
                <UpgradeAccountButton
                  fullWidth
                  collapsed={collapsed}
                  className={cn(collapsed ? "mb-1" : "mb-3")}
                  onNavigate={onClose}
                />

                {/* AI Token Budget Pill */}
                <div className={cn(collapsed ? "mb-1" : "mb-3")}>
                  <AITokenPill collapsed={collapsed} onNavigate={onClose} />
                </div>

                {/* Points + streak pill (self-gates on role; job_seeker only in V1) */}
                <div className={cn(collapsed ? "mb-1" : "mb-3")}>
                  <PointsPill collapsed={collapsed} onNavigate={onClose} />
                </div>

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
                <button
                  onClick={() => {
                    logout();
                    onClose();
                  }}
                  className={cn(
                    "w-full flex items-center text-sm text-muted-foreground hover:text-foreground rounded-md transition-colors",
                    collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                  )}
                  title={collapsed ? t("actions.signOut") : undefined}
                >
                  <LogOut className="h-4 w-4" />
                  {!collapsed && t("actions.signOut")}
                </button>
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
