// MarketingSection — the ONE content-section primitive every marketing
// surface (the public Home page, the template galleries, …) renders through,
// so each section that shows content offers the SAME three layout patterns —
// carousel | cards | list — behind the shared <ViewModeToggle>, persisted
// per-section via useViewMode. Adding a new home section = one <MarketingSection>
// call, not another bespoke grid.
//
// Two content inputs (use exactly one):
//   • `items`  — normalized {icon,title,description,bullets,…} entries rendered
//                by the shared card (grid/carousel) and row (list) below.
//   • `cards`  — pre-rendered nodes for sections whose card is its own component
//                (Tools→ToolCard, Templates→TemplateCard, Testimonials). The same
//                node is laid out in all three modes; list stacks single-column.

import * as React from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, type LucideIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import ViewModeToggle from "@/components/ViewModeToggle";
import { useViewMode, type ViewMode } from "@/lib/hooks/useViewMode";
import { HorizontalScroller } from "@/components/HorizontalScroller";
import { cn } from "@/lib/utils";

/**
 * The trio every marketing content section offers, in display order:
 * Scroll (carousel) · Grid (cards) · List. Shared so the toggle, ordering,
 * and persisted-mode validation stay identical across every section.
 */
export const MARKETING_VIEW_MODES: ViewMode[] = ["scroll", "grid", "list"];

export interface MarketingItem {
  /** Stable key (also the React key). */
  key: string;
  icon?: LucideIcon;
  /** Tailwind text-color class for the icon (e.g. "text-brand-primary"). */
  iconColor?: string;
  /** Card border/hover classes for the grid + carousel card. */
  borderClass?: string;
  title: string;
  description?: string;
  /** Optional checkmarked feature bullets. */
  bullets?: string[];
  /** When set, the card/row links here. */
  to?: string;
}

export interface MarketingCard {
  key: string;
  node: React.ReactNode;
}

export interface MarketingSectionProps {
  /** Stable per-section key — namespaces the persisted view-mode choice. */
  id: string;
  /** Localized heading. Omit to render content-only (host owns the H2). */
  title?: string;
  /** Localized intro line under the heading. */
  subtitle?: string;
  /** Optional leading icon shown next to a left-aligned title. */
  icon?: LucideIcon;
  /** Heading alignment: "center" (marketing) | "left" (galleries). */
  align?: "center" | "left";
  /** Smaller heading + tighter spacing for embedded/compact contexts. */
  compact?: boolean;
  /** Normalized entries rendered by the shared card (grid/carousel) + row (list). */
  items?: MarketingItem[];
  /** Pre-rendered cards for sections with a dedicated card component. */
  cards?: MarketingCard[];
  /** Grid column classes for the "cards" (grid) mode. */
  gridClassName?: string;
  /** Default view mode when nothing is persisted. */
  defaultMode?: ViewMode;
  /** Optional node rendered in the header next to the view toggle
   *  (e.g. a "View all →" link). */
  headerAction?: React.ReactNode;
  /** Footer node (CTA links, teasers) rendered under the content. */
  footer?: React.ReactNode;
  className?: string;
}

const DEFAULT_GRID = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

/** Grid/carousel card for a normalized {@link MarketingItem}. */
function MarketingItemCard({ item }: { item: MarketingItem }) {
  const Icon = item.icon;
  const body = (
    <Card
      className={cn(
        "h-full transition-colors",
        item.borderClass,
        item.to && "hover:shadow-md",
      )}
    >
      <CardHeader>
        {Icon && (
          <Icon className={cn("h-10 w-10 mb-4", item.iconColor ?? "text-primary")} />
        )}
        <CardTitle className="text-lg">{item.title}</CardTitle>
        {item.description && (
          <CardDescription>{item.description}</CardDescription>
        )}
      </CardHeader>
      {item.bullets && item.bullets.length > 0 && (
        <CardContent>
          <div className="space-y-2 text-sm">
            {item.bullets.map((b) => (
              <div key={b} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-green-text shrink-0" />
                <span>{b}</span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
  return item.to ? (
    <Link to={item.to} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Compact list row for a normalized {@link MarketingItem}. */
function MarketingItemRow({ item }: { item: MarketingItem }) {
  const Icon = item.icon;
  const body = (
    <div className="flex items-start gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/40">
      {Icon && (
        <Icon
          className={cn("h-8 w-8 shrink-0 mt-0.5", item.iconColor ?? "text-primary")}
        />
      )}
      <div className="min-w-0">
        <p className="font-semibold">{item.title}</p>
        {item.description && (
          <p className="text-sm text-muted-foreground">{item.description}</p>
        )}
        {item.bullets && item.bullets.length > 0 && (
          <div className="mt-2 space-y-1.5 text-sm">
            {item.bullets.map((b) => (
              <div key={b} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-green-text shrink-0" />
                <span>{b}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
  return item.to ? (
    <Link to={item.to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

/**
 * Renders a marketing content section with a Carousel | Cards | List toggle.
 * The chosen mode persists per-section (localStorage, via useViewMode).
 */
export default function MarketingSection({
  id,
  title,
  subtitle,
  icon: Icon,
  align = "center",
  compact = false,
  items,
  cards,
  gridClassName,
  defaultMode = "grid",
  headerAction,
  footer,
  className,
}: MarketingSectionProps): JSX.Element {
  const [viewMode, setViewMode] = useViewMode(
    `marketing.${id}`,
    defaultMode,
    MARKETING_VIEW_MODES,
  );

  // Normalize both inputs to a single { key, gridNode, listNode } list so the
  // three layout branches below never branch on which input was used.
  const entries: { key: string; gridNode: React.ReactNode; listNode: React.ReactNode }[] =
    items
      ? items.map((item) => ({
          key: item.key,
          gridNode: <MarketingItemCard item={item} />,
          listNode: <MarketingItemRow item={item} />,
        }))
      : (cards ?? []).map((c) => ({
          key: c.key,
          gridNode: c.node,
          listNode: c.node,
        }));

  const controls = (
    <div className="flex flex-shrink-0 items-center gap-3">
      {headerAction}
      <ViewModeToggle
        value={viewMode}
        onChange={setViewMode}
        modes={MARKETING_VIEW_MODES}
      />
    </div>
  );

  const titleBlock = title ? (
    <div className={align === "center" ? "text-center" : ""}>
      <div
        className={cn(
          "flex items-center gap-2",
          align === "center" && "justify-center",
        )}
      >
        {Icon && align === "left" && (
          <Icon className="h-5 w-5 text-primary shrink-0" />
        )}
        <h2 className={cn("font-bold", compact ? "text-xl" : "text-3xl")}>
          {title}
        </h2>
      </div>
      {subtitle && (
        <p
          className={cn(
            "text-muted-foreground",
            compact ? "mt-1 text-sm" : "mt-2",
            align === "center" && "mx-auto max-w-3xl",
          )}
        >
          {subtitle}
        </p>
      )}
    </div>
  ) : null;

  return (
    <div className={className}>
      {align === "center" ? (
        <div className={compact ? "mb-6" : "mb-8"}>
          <div className="mb-3 flex justify-end">{controls}</div>
          {titleBlock}
        </div>
      ) : (
        <div
          className={cn(
            "flex items-start justify-between gap-4",
            compact ? "mb-4" : "mb-8",
          )}
        >
          {titleBlock}
          {controls}
        </div>
      )}

      {viewMode === "scroll" ? (
        <HorizontalScroller itemCount={entries.length}>
          {entries.map((e) => (
            <React.Fragment key={e.key}>{e.gridNode}</React.Fragment>
          ))}
        </HorizontalScroller>
      ) : viewMode === "list" ? (
        <div className="mx-auto max-w-3xl space-y-3">
          {entries.map((e) => (
            <React.Fragment key={e.key}>{e.listNode}</React.Fragment>
          ))}
        </div>
      ) : (
        <div className={cn("grid gap-6", gridClassName ?? DEFAULT_GRID)}>
          {entries.map((e) => (
            <React.Fragment key={e.key}>{e.gridNode}</React.Fragment>
          ))}
        </div>
      )}

      {footer}
    </div>
  );
}
