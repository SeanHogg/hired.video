/**
 * AdminSection — renders one consolidated admin group: a segment pill bar plus
 * the active segment's page, swapped via the `?view=` query param (#2277).
 *
 * Self-gating (DRY): a segment renders only when the role can read its resource
 * AND the SuperAdmin hasn't hidden `admin_tab:<resource>` for that role. The
 * pill bar is suppressed for single-segment groups. If the role can see no
 * segment in this group (e.g. a direct URL to a forbidden group), it bounces to
 * the first admin group it CAN see, else back to the dashboard.
 *
 * Content comes in as a `view → ReactNode` map (App.tsx) so the pages stay
 * lazy-loaded; only the active node mounts.
 */
import React, { Suspense } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAdminPermissions } from "@/lib/admin-permissions";
import { useRoleAccess } from "@/hooks/use-role-access";
import { ADMIN_GROUPS, type AdminGroup, type AdminSegment } from "@/lib/admin-nav";

/** Shared visibility gate — a segment shows when readable AND not role-hidden. */
function useVisibleSegments(group: AdminGroup): AdminSegment[] {
  const { canAccess } = useAdminPermissions();
  const { canSee } = useRoleAccess();
  return group.segments.filter(
    (s) => canAccess(s.resource) && canSee(`admin_tab:${s.resource}`),
  );
}

/** First top-level admin group the current role can see (for fallback routing). */
function useFirstVisibleGroupPath(): string | null {
  const { canAccess } = useAdminPermissions();
  const { canSee } = useRoleAccess();
  const group = ADMIN_GROUPS.find((g) =>
    g.segments.some((s) => canAccess(s.resource) && canSee(`admin_tab:${s.resource}`)),
  );
  return group?.path ?? null;
}

export function AdminSection({
  group,
  elements,
}: {
  group: AdminGroup;
  elements: Record<string, React.ReactNode>;
}) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const visible = useVisibleSegments(group);
  const fallbackPath = useFirstVisibleGroupPath();

  // Role can't see any segment here — bounce to a group it can see.
  if (visible.length === 0) {
    return <Navigate to={fallbackPath ?? "/dashboard"} replace />;
  }

  const requested = params.get("view");
  const active =
    visible.find((s) => s.view === requested) ?? visible[0];

  const selectView = (view: string) => {
    const next = new URLSearchParams(params);
    if (view) next.set("view", view);
    else next.delete("view");
    setParams(next, { replace: true });
  };

  return (
    <div>
      {visible.length > 1 && (
        <div
          className="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-border bg-muted/50 p-1"
          role="tablist"
          aria-label={t(group.labelKey)}
        >
          {visible.map(({ view, labelKey, icon: Icon }) => {
            const isActive = view === active.view;
            return (
              <Link
                key={view || group.id}
                to={{ search: view ? `?view=${view}` : "" }}
                role="tab"
                aria-selected={isActive}
                onClick={(e) => {
                  e.preventDefault();
                  selectView(view);
                }}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {t(labelKey)}
              </Link>
            );
          })}
        </div>
      )}

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        }
      >
        {elements[active.view]}
      </Suspense>
    </div>
  );
}

export default AdminSection;
