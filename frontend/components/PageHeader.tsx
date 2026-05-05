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
  /** Link target — full path with optional `?tab=` query. Omit for a
   *  non-navigating breadcrumb segment (e.g. the leaf "Current Page"
   *  marker on a detail surface). */
  to?: string;
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
  /** Page title. Accepts ReactNode so consumers can compose icon + text in the
   *  heading (e.g. tool pages that render a coloured icon tile alongside the
   *  name). Omit on surfaces that own their own heading (e.g. /people/:id). */
  title?: ReactNode;
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
    if (!tab.to) return false;
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
              const tabClass = cn(
                "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
              );
              const inner = (
                <>
                  {Icon && <Icon className="w-4 h-4" />}
                  {tab.label}
                  {tab.badge !== undefined && tab.badge !== null && tab.badge !== false && (
                    <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs font-normal">
                      {tab.badge}
                    </Badge>
                  )}
                </>
              );
              return (
                <li key={tab.key}>
                  {tab.to ? (
                    <Link to={tab.to} className={tabClass} aria-current={active ? "page" : undefined}>
                      {inner}
                    </Link>
                  ) : (
                    <span className={tabClass} aria-current={active ? "page" : undefined}>
                      {inner}
                    </span>
                  )}
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
