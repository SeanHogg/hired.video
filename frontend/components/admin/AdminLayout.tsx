import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  Users,
  Shield,
  CreditCard,
  Package,
  ScrollText,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const ADMIN_TABS = [
  { label: "Overview",    href: "/admin/dashboard",  icon: BarChart3   },
  { label: "Users",       href: "/admin/users",       icon: Users       },
  { label: "Roles",       href: "/admin/roles",       icon: Shield      },
  { label: "Billing",     href: "/admin/billing",     icon: CreditCard  },
  { label: "Modules",     href: "/admin/modules",     icon: Package     },
  { label: "Audit Log",   href: "/admin/audit",       icon: ScrollText  },
  { label: "Settings",    href: "/admin/settings",    icon: Settings    },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isSuperAdmin } = useAuth();

  if (!isSuperAdmin) return null;

  return (
    <div>
      {/* Horizontal admin tab bar */}
      <div className="border-b border-border bg-muted/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 overflow-x-auto">
            {ADMIN_TABS.map(({ label, href, icon: Icon }) => {
              const active = location.pathname === href || location.pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
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
  );
}
