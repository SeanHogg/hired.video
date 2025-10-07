import {
  Home,
  Video,
  Briefcase,
  TrendingUp,
  Settings,
  HelpCircle,
  FileText,
  Building2,
  Users,
  Wrench,
  CheckSquare,
  Send,
  LogOut,
  UserCog,
  X,
  BarChart3,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { AccountSwitcher } from "@/components/account/AccountSwitcher";

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
  const location = useLocation();

  // Main navigation items - shown to all users
  const navigation = [
    { name: "Home", href: "/", icon: Home, exactMatch: true },
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: TrendingUp,
      exactMatch: false,
    },
    { name: "Resumes", href: "/resumes", icon: FileText, exactMatch: false },
    { name: "Jobs", href: "/jobs", icon: Briefcase, exactMatch: false },
    {
      name: "Companies",
      href: "/companies",
      icon: Building2,
      exactMatch: false,
    },
    { name: "People", href: "/people", icon: Users, exactMatch: false },
    { name: "Tools", href: "/tools", icon: Wrench, exactMatch: false },
    { name: "Tasks", href: "/tasks", icon: CheckSquare, exactMatch: false },
    { name: "Outreach", href: "/outreach", icon: Send, exactMatch: false },
    { name: "Account", href: "/account", icon: UserCog, exactMatch: false },
  ];

  // Additional navigation for unauthenticated users (mobile)
  const publicNavigation = [
    { name: "Pricing", href: "/pricing", icon: BarChart3, exactMatch: false },
    { name: "About", href: "/about", icon: HelpCircle, exactMatch: false },
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

    // Special handling for tools - match both /tools and /Tools paths
    if (item.href === "/tools") {
      return (
        location.pathname.startsWith("/tools") ||
        location.pathname.startsWith("/Tools")
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
          "fixed top-0 left-0 h-full bg-background border-r border-border z-50 transform transition-all duration-300 ease-in-out",
          collapsed ? "w-16 overflow-hidden" : "w-80 overflow-y-auto",
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
                  MyVideoResu.ME
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
                  Navigate
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

            {/* Public Navigation - Only for unauthenticated users */}
            {!isAuthenticated && (
              <div>
                {!collapsed && (
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Discover
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
                  title={collapsed ? `Profile: ${user.name}` : undefined}
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
                      <p className="text-xs text-muted-foreground truncate capitalize">
                        {user.role?.replace("_", " ")}
                      </p>
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
                  title={collapsed ? "Settings" : undefined}
                >
                  <Settings className="h-4 w-4" />
                  {!collapsed && "Settings"}
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
                  title={collapsed ? "Sign Out" : undefined}
                >
                  <LogOut className="h-4 w-4" />
                  {!collapsed && "Sign Out"}
                </button>
              </>
            ) : (
              <>
                {/* Authentication Buttons for Unauthenticated Users */}
                {!collapsed && (
                  <div className="space-y-2 mb-4">
                    <Link to="/login" onClick={onClose} className="block">
                      <Button
                        variant="ghost"
                        className="w-full justify-start font-medium"
                      >
                        Sign In
                      </Button>
                    </Link>
                    <Link to="/signup" onClick={onClose} className="block">
                      <Button className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 transition-opacity font-medium">
                        Get Started
                      </Button>
                    </Link>
                  </div>
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
                  title={collapsed ? "Settings" : undefined}
                >
                  <Settings className="h-4 w-4" />
                  {!collapsed && "Settings"}
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
                  title={collapsed ? "Help & Support" : undefined}
                >
                  <HelpCircle className="h-4 w-4" />
                  {!collapsed && "Help & Support"}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
