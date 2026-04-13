import React from "react";
import { Link, useLocation, Navigate } from "react-router-dom";
import {
  BarChart3,
  Megaphone,
  Users,
  Shield,
  Briefcase,
  Video,
  CreditCard,
  Package,
  ScrollText,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminPermissions, type AdminResource } from "@/lib/admin-permissions";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import { useSidebar } from "@/hooks/use-sidebar";

const TABS: { resource: AdminResource; label: string; href: string; icon: React.ElementType }[] = [
  { resource: "dashboard", label: "Overview",  href: "/admin/dashboard", icon: BarChart3  },
  { resource: "feed",      label: "Feed",      href: "/admin/feed",      icon: Megaphone  },
  { resource: "users",     label: "Users",     href: "/admin/users",     icon: Users      },
  { resource: "roles",     label: "Roles",     href: "/admin/roles",     icon: Shield     },
  { resource: "jobs",      label: "Jobs",      href: "/admin/jobs",      icon: Briefcase  },
  { resource: "studio",   label: "Studio",    href: "/admin/studio",    icon: Video      },
  { resource: "billing",   label: "Billing",   href: "/admin/billing",   icon: CreditCard },
  { resource: "modules",   label: "Modules",   href: "/admin/modules",   icon: Package    },
  { resource: "audit",     label: "Audit Log", href: "/admin/audit",     icon: ScrollText },
  { resource: "settings",  label: "Settings",  href: "/admin/settings",  icon: Settings   },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { hasAnyAccess, canAccess } = useAdminPermissions();
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();

  // No admin access at all — send back to dashboard
  if (!hasAnyAccess) return <Navigate to="/dashboard" replace />;

  const visibleTabs = TABS.filter(({ resource }) => canAccess(resource));

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />
        <div className="pt-16">
          {/* Horizontal admin tab bar */}
          <div className="border-b border-border bg-muted/40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <nav className="flex gap-1 overflow-x-auto" aria-label="Admin navigation">
                {visibleTabs.map(({ resource, label, href, icon: Icon }) => {
                  const active =
                    location.pathname === href ||
                    location.pathname.startsWith(href + "/");
                  return (
                    <Link
                      key={resource}
                      to={href}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                        active
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Page content */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
