import { Children, type ReactNode } from "react";
import { HorizontalScroller } from "@/components/HorizontalScroller";
import type { ViewMode } from "@/lib/hooks/useViewMode";
import { cn } from "@/lib/utils";

/**
 * The scroll/grid/list trio offered by the Outreach browse tabs
 * (Templates, Campaigns, Contacts). Exported so every consumer feeds
 * `ViewModeToggle` the identical mode set — flip the order/contents here
 * and all three tabs stay in lockstep.
 */
export const SCROLL_GRID_LIST_MODES: ViewMode[] = ["scroll", "grid", "list"];

export interface ViewModeListProps {
  viewMode: ViewMode;
  /** Extra classes merged onto the grid/list container (ignored in scroll). */
  className?: string;
  children: ReactNode;
}

/**
 * Shared layout shell for a card list that can render as a horizontal
 * `scroll` carousel, a `grid`, or a vertical `list`. Centralises the
 * container-className branching that every Outreach browse tab used to
 * repeat. In `scroll` mode it hands the cards to `HorizontalScroller`,
 * which wraps each one in its own fixed-width snap cell.
 *
 * Cards keep owning their own per-mode inner layout (e.g. the `list` row
 * vs the `grid`/`scroll` card body) — this only owns the outer container.
 */
export function ViewModeList({
  viewMode,
  className,
  children,
}: ViewModeListProps): JSX.Element {
  if (viewMode === "scroll") {
    // The scroller wraps each child in its own fixed-width snap cell, so
    // pass the cards straight through.
    return (
      <HorizontalScroller itemCount={Children.count(children)}>
        {children}
      </HorizontalScroller>
    );
  }
  return (
    <div
      className={cn(
        viewMode === "grid"
          ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          : "flex flex-col gap-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export default ViewModeList;
