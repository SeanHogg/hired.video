import React from "react";
import { Link, useLocation, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAdminPermissions } from "@/lib/admin-permissions";
import { useRoleAccess } from "@/hooks/use-role-access";
import { AppShell } from "@/components/AppShell";
import { ADMIN_GROUPS } from "@/lib/admin-nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { t } = useTranslation();
  const { hasAnyAccess, canAccess } = useAdminPermissions();
  const { canSee } = useRoleAccess();

  // No admin access at all — send back to dashboard
  if (!hasAnyAccess) return <Navigate to="/dashboard" replace />;

  // A group shows when at least one of its segments is readable (admin-permissions)
  // AND not hidden for this role via the role-access manifest (#2040). canSee
  // fail-opens, so this stays zero-regression by default. Per-segment gating is
  // re-applied inside AdminSection, so a visible group never renders a forbidden
  // view. (#2277 — was a flat 26-tab strip.)
  const visibleGroups = ADMIN_GROUPS.filter((g) =>
    g.segments.some((s) => canAccess(s.resource) && canSee(`admin_tab:${s.resource}`)),
  );

  return (
    <AppShell bgClassName="bg-background">
      {/* Horizontal admin tab bar — sticky action band (already full-width). */}
      <div className="sticky top-16 z-30 border-b border-border bg-actionbar/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 overflow-x-auto" aria-label={t("admin.nav.ariaLabel")}>
            {visibleGroups.map(({ id, labelKey, path, icon: Icon }) => {
              const active =
                location.pathname === path ||
                location.pathname.startsWith(path + "/");
              return (
                <Link
                  key={id}
                  to={path}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                    active
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(labelKey)}
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
