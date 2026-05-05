import type { ComponentType, ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * PageHeader — the shared "tab strip + heading" pattern used by every
 * top-level surface (Services, Resumes, Jobs, People, Companies, …).
 *
 * Layout matches /services: a horizontal underlined tab nav sits above
 * the page title, acting as a breadcrumb. A page that has only one tab
 * still gets the tab strip — it reads as a single-segment breadcrumb.
 *
 * Tabs may navigate either by route (`to: "/jobs/candidates"`) or by
 * query (`to: "/jobs?tab=candidates"`). The active state is derived
 * from `activeTabKey` (when the page already knows) or by matching
 * pathname / `?tab=` against each tab's `key` and optional
 * `matchPrefixes`.
 */
export interface PageHeaderTab {
  /** Stable key used to mark the active tab. */
  key: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  /** Link target — full path with optional `?tab=` query. */
  to: string;
  /** Optional badge (count / status pill). */
  badge?: ReactNode;
  /** Mark active when pathname starts with any of these prefixes. */
  matchPrefixes?: string[];
}

export interface PageHeaderProps {
  /** Tabs render above the title. Omit for plain heading. */
  tabs?: PageHeaderTab[];
  /** Active tab key — overrides automatic derivation. */
  activeTabKey?: string;
  /** Page title. Omit on surfaces that own their own heading (e.g. /people/:id). */
  title?: string;
  description?: ReactNode;
  /** Right-side action buttons (next to the title). */
  actions?: ReactNode;
  /** Extra content rendered in the title row, below the description. */
  meta?: ReactNode;
  /** Override the wrapper className when a page needs less bottom margin. */
  className?: string;
}

export default function PageHeader({
  tabs,
  activeTabKey,
  title,
  description,
  actions,
  meta,
  className,
}: PageHeaderProps): JSX.Element {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const isActive = (tab: PageHeaderTab): boolean => {
    if (activeTabKey !== undefined) return activeTabKey === tab.key;
    const tabParam = searchParams.get("tab");
    if (tabParam) return tabParam === tab.key;
    if (tab.matchPrefixes?.some((p) => location.pathname.startsWith(p))) return true;
    // Strip query/hash from `to` for path comparison.
    const toPath = tab.to.split("?")[0]?.split("#")[0] ?? tab.to;
    return location.pathname === toPath;
  };

  return (
    <div className={cn("mb-6", className)}>
      {tabs && tabs.length > 0 && (
        <nav className="mb-4 border-b" aria-label="Section">
          <ul className="flex gap-1 -mb-px overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = isActive(tab);
              return (
                <li key={tab.key}>
                  <Link
                    to={tab.to}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                      active
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    {Icon && <Icon className="w-4 h-4" />}
                    {tab.label}
                    {tab.badge !== undefined && tab.badge !== null && tab.badge !== false && (
                      <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs font-normal">
                        {tab.badge}
                      </Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {(title || description || actions || meta) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0 flex-1">
            {title && <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>}
            {description && (
              <div className="text-sm sm:text-base text-muted-foreground mt-1">
                {description}
              </div>
            )}
            {meta && <div className="mt-2">{meta}</div>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </div>
      )}
    </div>
  );
}
