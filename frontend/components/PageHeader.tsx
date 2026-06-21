import { useEffect, useRef, type ComponentType, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { tabItemClass, TabItemContent } from "@/components/ui/tab-item";
import { ACTION_BAR_STICKY, ACTION_BAR_SURFACE } from "@/lib/ui/action-bar";

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
  /** Click handler — use instead of `to` when the tab switches local state
   *  or needs custom URL surgery a plain `<Link>` can't express (e.g. Tasks
   *  surface tabs that must clear `tab`/`view` params on switch). Renders a
   *  `<button>` rather than a `<Link>`. Ignored when `to` is set. */
  onClick?: () => void;
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
  /** Inline search slot. When provided, fills the flex space where
   *  title/description normally render. Used on top-level surfaces that
   *  relocated the global header search inline (Jobs, People, etc.) after
   *  users repeatedly missed it docked in the top bar. Pages that pass this
   *  should also be listed in `INLINE_HEADER_SEARCH_ROUTES` so the global
   *  HeaderSearch is hidden in Navigation. */
  search?: ReactNode;
  /** Right-side action buttons (next to the title). */
  actions?: ReactNode;
  /** Extra content rendered in the title row, below the description. */
  meta?: ReactNode;
  /** Override the wrapper className when a page needs less bottom margin. */
  className?: string;
  /** Render as a sticky, tonally-distinct action toolbar — the tabs + search +
   *  filters pin just below the top nav as the list scrolls. Defaults to ON
   *  whenever an inline `search` slot is present (the signal that this header is
   *  an interactive list toolbar rather than a plain page title). */
  sticky?: boolean;
}

export default function PageHeader({
  tabs,
  activeTabKey,
  title,
  description,
  search,
  actions,
  meta,
  className,
  sticky,
}: PageHeaderProps): JSX.Element {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // An interactive list header (one with an inline search) becomes the sticky,
  // tonally-distinct action bar; a plain title header stays inline.
  const asActionBar = sticky ?? Boolean(search);

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

  /**
   * Merge tab `to` with the current URL's search params (gap #335).
   * Tabs like `/jobs?tab=saved` used to drop `q=`, `list_id=`, sort, etc.
   * Now: the tab's own query params take precedence (so `tab=saved` flips
   *      cleanly), the rest of the page's existing params survive.
   * Cross-route tab Links (different pathname) bypass the merge so a
   * page transition doesn't inherit unrelated query state.
   *
   * `tab` is special: the destination's tab state always wins, including
   * its absence. EntityHubShell omits `?tab=` on the default tab, so
   * clicking "My Resumes" from `?tab=sourced` must clear it — otherwise
   * the click navigates to the same URL and the tab doesn't change.
   */
  const buildTo = (to: string): string => {
    const [pathPart, queryPart] = to.split("?");
    const targetPath = pathPart ?? to;
    // Cross-route navigation — don't inherit current params.
    if (targetPath !== location.pathname) return to;
    const merged = new URLSearchParams(searchParams);
    const tabParams = new URLSearchParams(queryPart ?? "");
    merged.delete("tab");
    tabParams.forEach((value, key) => merged.set(key, value));
    const queryString = merged.toString();
    return queryString ? `${targetPath}?${queryString}` : targetPath;
  };

  // #471 — scroll the active tab into view on mount + whenever it changes
  // so users landing on a tool whose tab sits to the right (SkillExtractor,
  // ValueProposition, VendorSync, etc.) see the highlight without having to
  // scroll the overflow row themselves. `inline: "center"` keeps the active
  // tab visible even when adjacent tabs grow.
  const activeLiRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    activeLiRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [activeTabKey, location.pathname]);

  // When the action bar holds ONLY the tab strip (no title/search/actions row
  // below), the band's own bottom hairline is the separator — so the nav drops
  // its own `mb-4 border-b` to avoid a redundant double line floating in the
  // band. With a row below (People, Jobs, …) the nav border still divides tabs
  // from search/actions.
  const hasRowBelow = Boolean(title || description || search || actions || meta);
  const navClass =
    asActionBar && !hasRowBelow ? "" : "mb-4 border-b";

  const inner = (
    <>
      {tabs && tabs.length > 0 && (
        <nav className={cn(navClass)} aria-label="Section">
          <ul className="flex gap-1 -mb-px overflow-x-auto">
            {tabs.map((tab) => {
              const active = isActive(tab);
              const tabClass = tabItemClass(active);
              const tabInner = <TabItemContent label={tab.label} icon={tab.icon} badge={tab.badge} />;
              return (
                <li key={tab.key} ref={active ? activeLiRef : undefined}>
                  {tab.to ? (
                    <Link to={buildTo(tab.to)} className={tabClass} aria-current={active ? "page" : undefined}>
                      {tabInner}
                    </Link>
                  ) : tab.onClick ? (
                    <button
                      type="button"
                      onClick={tab.onClick}
                      className={tabClass}
                      aria-current={active ? "page" : undefined}
                    >
                      {tabInner}
                    </button>
                  ) : (
                    <span className={tabClass} aria-current={active ? "page" : undefined}>
                      {tabInner}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {(title || description || search || actions || meta) && (
        <div
          className={cn(
            "flex gap-3 sm:gap-4 sm:items-center sm:justify-between",
            // A search toolbar keeps its (icon-collapsed-on-mobile) search
            // inline with the filters/actions so the lone icon never strands on
            // its own row; a plain title header keeps the title stacked above
            // the actions on mobile.
            search
              ? "items-start sm:flex-row"
              : "flex-col sm:flex-row sm:items-center",
          )}
        >
          <div className={cn("min-w-0", search ? "flex-none sm:flex-1" : "flex-1")}>
            {search ? (
              <div className="w-full">{search}</div>
            ) : (
              <>
                {title && <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>}
                {description && (
                  <div className="text-sm sm:text-base text-muted-foreground mt-1">
                    {description}
                  </div>
                )}
              </>
            )}
            {meta && <div className="mt-2">{meta}</div>}
          </div>
          {actions && (
            <div
              className={cn(
                "flex items-center gap-2 flex-wrap",
                // On mobile the actions grow to fill the row beside the search
                // icon (and wrap internally); on desktop they sit at natural
                // width pushed right by the search input's `flex-1`.
                search && "flex-1 sm:flex-none",
              )}
            >
              {actions}
            </div>
          )}
        </div>
      )}
    </>
  );

  // Interactive list header → flat, full-width, sticky action bar; plain title
  // header → inline.
  if (asActionBar) {
    return (
      <div className={cn(ACTION_BAR_STICKY, ACTION_BAR_SURFACE, className)}>
        {inner}
      </div>
    );
  }

  return <div className={cn("mb-6", className)}>{inner}</div>;
}
