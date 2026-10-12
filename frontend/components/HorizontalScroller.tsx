import { Children, type ReactNode, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Canonical snap-cell className for a full-size card inside a
 * {@link HorizontalScroller}. The scroller applies this to every child
 * automatically, so this is the ONE place card width is defined for every
 * browse surface's Scroll view (Tools, Jobs, People, Companies, Resumes,
 * Studio, Search, Services, Learning) — callers pass bare cards, not
 * pre-wrapped snap cells.
 *
 * On mobile the card spans ~82% of the viewport (capped at 20rem) so it
 * reads wide-and-short with a peek of the next card — the previous fixed
 * `w-72` (288px) looked narrow-and-tall on a phone. From `sm:` up it
 * reverts to the fixed `w-72` track cell the desktop grid expects.
 */
export const SCROLL_CELL_CLASS =
  "w-[82vw] max-w-xs shrink-0 snap-start sm:w-72 sm:max-w-none";

/**
 * Horizontal "scroll" carousel with overflow arrow controls — the shared
 * primitive behind every browse surface's Scroll view (Studio, Resumes,
 * Jobs, People, Companies, Tools, Search, Services).
 *
 * Pass bare card elements as children — the scroller wraps each one in a
 * fixed-width snap cell ({@link SCROLL_CELL_CLASS}) itself, so card sizing
 * lives in exactly one place. Surfaces that need a non-default cell width
 * (e.g. the narrower Studio "row" rail) override via `cellClassName`.
 *
 * `itemCount` is the only signal the scroller needs to re-check its
 * overflow bounds when the visible cards change.
 */
export function HorizontalScroller({
  itemCount,
  className,
  cellClassName,
  children,
}: {
  itemCount: number;
  className?: string;
  /** Per-cell width override; defaults to {@link SCROLL_CELL_CLASS}. */
  cellClassName?: string;
  children: ReactNode;
}): JSX.Element {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [itemCount]);

  function scrollByCards(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <ArrowButton
        side="left"
        visible={canScrollLeft}
        onClick={() => scrollByCards(-1)}
      />
      <ArrowButton
        side="right"
        visible={canScrollRight}
        onClick={() => scrollByCards(1)}
      />
      <div
        ref={scrollerRef}
        className={cn(
          "flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:thin]",
          className,
        )}
      >
        {Children.map(children, (child) =>
          child == null || child === false ? null : (
            <div className={cn(cellClassName ?? SCROLL_CELL_CLASS)}>{child}</div>
          ),
        )}
      </div>
    </div>
  );
}

/** Circular overflow-scroll arrow; hidden (and removed from the tab order)
 *  when the track can't scroll further in that direction. */
function ArrowButton({
  side,
  visible,
  onClick,
}: {
  side: "left" | "right";
  visible: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Scroll left" : "Scroll right"}
      tabIndex={visible ? 0 : -1}
      className={cn(
        "absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/95 shadow-md backdrop-blur transition hover:bg-background",
        side === "left" ? "-left-3" : "-right-3",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

export default HorizontalScroller;
