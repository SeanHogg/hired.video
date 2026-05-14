/**
 * Self-contained collapsible panel chrome — left/right side panels and
 * the bottom timeline dock all share this. Owns its open/closed state
 * (persisted to localStorage when given a storageKey) so the editor
 * shell never sees a "panelXOpen" prop. The component decides its own
 * visibility per the shared-component rule: the consumer just passes
 * the panel's children, and the panel renders either the full body
 * (with a corner toggle) or a thin strip (with an expand toggle +
 * vertical/horizontal label).
 *
 * Sides: "left" / "right" collapse horizontally, "bottom" collapses
 * vertically. The toggle is placed on the edge abutting the canvas
 * (where the user's eye naturally lands when they want to give the
 * canvas more room) — top-right for left panels, top-left for right
 * and bottom panels.
 */
import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type CollapsiblePanelSide = "left" | "right" | "bottom";

export interface CollapsiblePanelProps {
  side: CollapsiblePanelSide;
  /** Short label shown on the collapsed strip + used as the toggle's
   *  accessible name. Keep to 1–2 words; rotates vertically when the
   *  panel collapses horizontally. */
  label: string;
  /** Optional localStorage key. When provided, the open/closed state
   *  is restored on mount and persisted on every change. */
  storageKey?: string;
  defaultOpen?: boolean;
  /** Extra classes for the expanded shell (e.g. `w-64` for the panel
   *  width). The collapsed strip uses a fixed compact size. */
  expandedClassName?: string;
  children: React.ReactNode;
}

const COLLAPSED_PX = 36;

export default function CollapsiblePanel({
  side,
  label,
  storageKey,
  defaultOpen = true,
  expandedClassName,
  children,
}: CollapsiblePanelProps) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined" || !storageKey) return defaultOpen;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === "open") return true;
      if (raw === "closed") return false;
    } catch {
      // Quota/private-mode — fall through to default.
    }
    return defaultOpen;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !storageKey) return;
    try {
      window.localStorage.setItem(storageKey, open ? "open" : "closed");
    } catch {
      // ignore quota errors
    }
  }, [storageKey, open]);

  const isHorizontal = side !== "bottom";

  const ExpandIcon =
    side === "left"
      ? ChevronRight
      : side === "right"
        ? ChevronLeft
        : ChevronUp;

  const CollapseIcon =
    side === "left"
      ? ChevronLeft
      : side === "right"
        ? ChevronRight
        : ChevronDown;

  const borderClass =
    side === "left"
      ? "border-r border-border"
      : side === "right"
        ? "border-l border-border"
        : "border-t border-border";

  if (!open) {
    return (
      <div
        className={cn(
          "flex shrink-0 bg-card",
          isHorizontal
            ? "flex-col items-center py-2"
            : "flex-row items-center px-3",
          borderClass,
        )}
        style={isHorizontal ? { width: COLLAPSED_PX } : { height: COLLAPSED_PX }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Expand ${label}`}
          aria-expanded={false}
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ExpandIcon className="h-4 w-4" />
        </button>
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
            isHorizontal ? "mt-3" : "ml-3",
          )}
          style={isHorizontal ? { writingMode: "vertical-rl" } : undefined}
        >
          {label}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex shrink-0 flex-col bg-card",
        borderClass,
        expandedClassName,
      )}
    >
      {children}
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label={`Collapse ${label}`}
        aria-expanded={true}
        className={cn(
          "absolute z-20 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground",
          side === "left" && "right-2 top-2",
          side === "right" && "left-2 top-2",
          // For the bottom panel, sit on the left so the existing
          // "Advanced" toggle on the right side of the timeline header
          // doesn't fight for the same corner. TimelineDock pads its
          // first row to make room.
          side === "bottom" && "left-2 top-2",
        )}
      >
        <CollapseIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
