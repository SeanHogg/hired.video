/**
 * FloatingCollapsiblePanel — generic chrome for "pill in the canvas
 * corner that expands into a small floating panel." Extracted from
 * `FloatingLayersPanel` so both the Timeline-runtime layers UI AND the
 * image-runtime layers UI share ONE pill / expand behaviour / open-state
 * persistence (DRY per `feedback_extract_on_duplication`).
 *
 * Per the standing DRY rule the chrome doesn't know what it contains.
 * Consumers supply the inner panel as `children`; the chrome owns the
 * pill button + collapse animation + localStorage open-state under a
 * caller-supplied `storageKey` (so two floating panels on the same page
 * can persist independently).
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FloatingCollapsiblePanelProps {
  /** Pill label — short noun like "Layers" / "Notes" / "Inspector". */
  label: string;
  /** Pill icon — typically a lucide icon matching the panel's domain. */
  Icon: LucideIcon;
  /** Optional count chip rendered next to the label (e.g. layer count). */
  count?: number;
  /** localStorage key. Two panels on one page MUST use distinct keys
   *  so their open states don't trample each other. */
  storageKey: string;
  /** Whether the expanded panel shows by default if the user has no
   *  prior preference. Defaults to false (collapsed). */
  defaultOpen?: boolean;
  /** Body rendered above the pill when expanded. Sized + scrolled by
   *  the chrome — children just render their content. */
  children: ReactNode;
  className?: string;
  /** Width of the expanded body. Defaults to 16rem; image-layer panels
   *  pass a wider value because the opacity slider needs the room. */
  bodyWidthClass?: string;
}

function readPersistedOpen(storageKey: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(storageKey);
    if (v === null) return fallback;
    return v === "1";
  } catch {
    return fallback;
  }
}

export default function FloatingCollapsiblePanel({
  label,
  Icon,
  count,
  storageKey,
  defaultOpen = false,
  children,
  className,
  bodyWidthClass = "w-64",
}: FloatingCollapsiblePanelProps) {
  const [open, setOpen] = useState<boolean>(() => readPersistedOpen(storageKey, defaultOpen));

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [storageKey, open]);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  return (
    <div className={cn("pointer-events-auto flex flex-col items-center", className)}>
      {open && (
        <div className={cn("mb-1 overflow-hidden rounded-md border border-border bg-card/95 shadow-md backdrop-blur", bodyWidthClass)}>
          <div className="max-h-[60vh] overflow-y-auto">{children}</div>
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? `Collapse ${label.toLowerCase()}` : `Expand ${label.toLowerCase()}`}
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-border bg-card/95 px-2 py-1 text-xs shadow-sm backdrop-blur transition hover:bg-muted",
          open && "text-foreground",
        )}
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{label}</span>
        {typeof count === "number" && count > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}
