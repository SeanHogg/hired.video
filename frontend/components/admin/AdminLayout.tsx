import React from "react";
import { Link, useLocation, Navigate } from "react-router-dom";
import {
  BarChart3,
  Megaphone,
  Users,
  Building2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Briefcase,
  Video,
  HardDrive,
  CreditCard,
  Package,
  ScrollText,
  Settings,
  Wand2,
  Workflow,
  Mail,
  Puzzle,
  MonitorPlay,
  Sparkles,
  Activity,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminPermissions, type AdminResource } from "@/lib/admin-permissions";
import { useRoleAccess } from "@/hooks/use-role-access";
import { AppShell } from "@/components/AppShell";

const TABS: { resource: AdminResource; label: string; href: string; icon: React.ElementType }[] = [
  { resource: "dashboard", label: "Overview",  href: "/admin/dashboard", icon: BarChart3  },
  { resource: "feed",      label: "Feed",      href: "/admin/feed",      icon: Megaphone  },
  { resource: "feed",      label: "Dashboard Feed", href: "/admin/dashboard-feed", icon: Sparkles },
  { resource: "campaigns", label: "Campaigns", href: "/admin/campaigns", icon: Mail       },
  { resource: "users",     label: "Users",     href: "/admin/users",     icon: Users      },
  { resource: "companies", label: "Companies", href: "/admin/companies", icon: Building2   },
  { resource: "roles",     label: "Roles",     href: "/admin/roles",     icon: Shield     },
  { resource: "roleAccess", label: "Role Access", href: "/admin/role-access", icon: ShieldCheck },
  { resource: "jobs",      label: "Jobs",      href: "/admin/jobs",      icon: Briefcase  },
  { resource: "studio",   label: "Studio",    href: "/admin/studio",    icon: Video      },
  // Page → video embed placements (#1866) — gated on the studio resource.
  { resource: "studio",   label: "Page Videos", href: "/admin/page-embeds", icon: MonitorPlay },
  // Managed brand accounts powering the free "Post via hired.video" lane (PRD §5.0).
  { resource: "studio",   label: "Social Accounts", href: "/admin/social-accounts", icon: Megaphone },
  { resource: "storage",   label: "Storage",   href: "/admin/storage",   icon: HardDrive  },
  { resource: "billing",   label: "Billing",   href: "/admin/billing",   icon: CreditCard },
  { resource: "modules",   label: "Modules",   href: "/admin/modules",   icon: Package    },
  { resource: "audit",     label: "Audit Log", href: "/admin/audit",     icon: ScrollText },
  { resource: "security",  label: "Security",  href: "/admin/security",  icon: ShieldAlert },
  { resource: "toolUsage", label: "Tool Usage", href: "/admin/tool-usage", icon: Wand2     },
  { resource: "workers",   label: "Workers",   href: "/admin/workers",   icon: Workflow   },
  { resource: "settings",  label: "Settings",  href: "/admin/settings",  icon: Settings   },
  { resource: "moderation", label: "Moderation", href: "/admin/moderation", icon: ShieldCheck },
  { resource: "accountAnalytics", label: "Account Analytics", href: "/admin/account-analytics", icon: Mail },
  { resource: "accountAnalytics", label: "Active Users", href: "/admin/active-users", icon: Activity },
  { resource: "extensionTelemetry", label: "Extension", href: "/admin/extension-telemetry", icon: Puzzle },
  { resource: "aiVendors", label: "AI Vendors", href: "/admin/ai-vendors", icon: Cpu },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { hasAnyAccess, canAccess } = useAdminPermissions();
  const { canSee } = useRoleAccess();

  // No admin access at all — send back to dashboard
  if (!hasAnyAccess) return <Navigate to="/dashboard" replace />;

  // A tab shows when the role has CRUD read access (admin-permissions) AND the
  // SuperAdmin hasn't hidden it for this role via the role-access manifest
  // (#2040). canSee fail-opens, so this is zero-regression by default.
  const visibleTabs = TABS.filter(
    ({ resource }) => canAccess(resource) && canSee(`admin_tab:${resource}`),
  );

  return (
    <AppShell bgClassName="bg-background">
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
    </AppShell>
  );
}
