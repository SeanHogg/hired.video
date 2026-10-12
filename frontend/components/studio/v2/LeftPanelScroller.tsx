/**
 * LeftPanelScroller — single wrapper used by every v2 left-rail tab
 * (Widgets, Design, Actions) so they share IDENTICAL chrome:
 *   - same outer flex / height behaviour (`h-full flex-col`)
 *   - `scrollbar-gutter: stable` so the scrollbar appearing/disappearing
 *     never shifts the canvas to the right when switching tabs
 *   - same inner padding so section titles line up vertically across
 *     tabs (no jarring "DESIGN sits 4px lower than WIDGETS")
 *
 * Per the standing DRY rule: every left-rail tab body mounts THIS
 * wrapper. Adding a fourth tab is one component that uses LeftPanelScroller
 * — its layout matches the existing three automatically.
 */
import { cn } from "@/lib/utils";

export interface LeftPanelScrollerProps {
  children: React.ReactNode;
  className?: string;
}

export default function LeftPanelScroller({
  children,
  className,
}: LeftPanelScrollerProps) {
  return (
    <div
      className={cn("flex h-full flex-col overflow-y-auto", className)}
      style={{ scrollbarGutter: "stable" }}
    >
      {children}
    </div>
  );
}

/**
 * LeftPanelSection — title row + grouped content used inside the
 * scroller. Same visual treatment for "TEXT" / "MEDIA" / "AI TOOLS" /
 * "VISUAL THEMES" etc., so the three tabs feel like the same surface
 * with different contents.
 */
export interface LeftPanelSectionProps {
  title: string;
  /** Optional collapsed state — when controlled, the section shows a
   *  +/- toggle in the title row. Uncontrolled = always-open. */
  open?: boolean;
  onToggle?: () => void;
  /** Optional right-side adornment (e.g. an "Add" button). */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Override the default grid for content. Defaults to a 2-column grid
   *  with 0.5rem gap — matches v1's sidebar density. */
  contentClassName?: string;
  /** `rail` (default) = mono uppercase label (left-rail tabs).
   *  `inspector` = the right inspector's sentence-case semibold row with a
   *  trailing +/− toggle spanning the full width (design system). */
  variant?: "rail" | "inspector";
}

export function LeftPanelSection({
  title,
  open,
  onToggle,
  action,
  children,
  className,
  contentClassName,
  variant = "rail",
}: LeftPanelSectionProps) {
  const collapsible = onToggle !== undefined;
  const isOpen = !collapsible || open !== false;

  if (variant === "inspector") {
    return (
      <section className={cn("border-b border-border", className)}>
        <div className="flex min-h-10 items-center gap-2 px-3.5">
          {collapsible ? (
            <button
              type="button"
              onClick={onToggle}
              className="flex min-h-10 flex-1 items-center justify-between gap-2 text-left text-[13px] font-semibold text-foreground"
              aria-expanded={isOpen}
            >
              <span className="truncate">{title}</span>
              <span aria-hidden="true" className="text-sm font-normal text-muted-foreground">
                {isOpen ? "−" : "+"}
              </span>
            </button>
          ) : (
            <span className="flex-1 text-[13px] font-semibold text-foreground">{title}</span>
          )}
          {action}
        </div>
        {isOpen && (
          <div className={cn("px-3.5 pb-4 pt-0.5", contentClassName)}>{children}</div>
        )}
      </section>
    );
  }

  return (
    <section className={cn("border-b border-border last:border-b-0", className)}>
      <div className="flex items-center justify-between px-3 py-2">
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition hover:text-foreground"
            aria-expanded={isOpen}
          >
            <span>{title}</span>
            <span className="text-[10px]">{isOpen ? "−" : "+"}</span>
          </button>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {title}
          </span>
        )}
        {action}
      </div>
      {isOpen && (
        <div className={cn("px-3 pb-3", contentClassName)}>{children}</div>
      )}
    </section>
  );
}
