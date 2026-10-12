/**
 * WorkspaceStrip — the frame's bottom strip, the SAME height in Simple and
 * Advanced (150px; 84px on phones). It holds the timeline on time-based
 * pages and the document's own pages on a résumé / letter. A header row
 * carries the label, the page's controls (play / scrub / zoom) and Expand;
 * Advanced rows (tracks) scroll inside the strip. Expand lifts the same
 * content into a taller overlay above the strip — the page under it never
 * reflows. On phones the header becomes a left column beside the rows (44px
 * targets kept, rows keep the full 84px height).
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Maximize2, Minimize2 } from "lucide-react";
import { STRIP_HEIGHT_PHONE_PX, STRIP_HEIGHT_PX } from "@/lib/workspace/workspace-panels";
import { useIsWideWorkspace } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

interface WorkspaceStripProps {
  /** Mono eyebrow, e.g. "Timeline · 0:28" or "Pages". */
  label: ReactNode;
  /** Accessible name of the region (already translated). */
  ariaLabel: string;
  /** Controls on the header row (play, scrub, zoom). */
  controls?: ReactNode;
  /** The rows. */
  children: ReactNode;
  /** Offer Expand (time-based strips with tracks). */
  expandable?: boolean;
}

export default function WorkspaceStrip({ label, ariaLabel, controls, children, expandable = false }: WorkspaceStripProps) {
  const { t } = useTranslation();
  const wide = useIsWideWorkspace();
  const [expanded, setExpanded] = useState(false);
  const open = expandable && expanded;

  const expandButton = expandable && (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={open}
      aria-label={open ? t("workspace.strip.collapse") : t("workspace.strip.expand")}
      title={open ? t("workspace.strip.collapse") : t("workspace.strip.expand")}
      className="flex h-11 w-11 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {open ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
  const labelEl = (
    <span className="min-w-0 flex-none truncate font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
      {label}
    </span>
  );
  // Phones (84px strip): a 44px header row would leave ~22px of rows, so the
  // label + controls sit in a left column beside the rows instead — the rows
  // get the strip's full height (one whole 60px scene block row).
  const rail = !wide && !open;

  return (
    <div
      data-region="strip"
      role="region"
      aria-label={ariaLabel}
      style={{ height: wide ? STRIP_HEIGHT_PX : STRIP_HEIGHT_PHONE_PX }}
      className="relative flex-none border-t border-border bg-card"
    >
      {/* ONE tree at every size (expanding never remounts the rows). */}
      <div
        className={cn(
          "flex bg-card",
          rail ? "flex-row" : "flex-col",
          open
            ? "absolute inset-x-0 bottom-0 z-30 h-[min(60dvh,520px)] border-t border-border shadow-[0_-18px_40px_-24px_hsl(var(--ink)/0.45)]"
            : "h-full",
        )}
      >
        <div
          data-strip-header=""
          className={cn(
            "flex flex-none",
            rail
              ? "w-[min(45%,360px)] flex-col justify-center gap-0.5 border-r border-border pl-2 pr-1"
              : "items-center gap-2 px-3 pt-1.5 sm:px-3.5",
          )}
        >
          {labelEl}
          <div className={cn("flex min-w-0 items-center", rail ? "gap-0.5 overflow-x-auto" : "flex-1 justify-end gap-1.5")}>
            {controls}
            {expandButton}
          </div>
        </div>
        <div className={cn("min-h-0 min-w-0 flex-1 overflow-auto", rail ? "px-2 py-1" : "px-3 pb-2 pt-1 sm:px-3.5")}>{children}</div>
      </div>
    </div>
  );
}

/** The strip's space before its content is ready (a kit's intake): the same
 *  height, muted rows, so the canvas above never jumps. Decorative only. */
export function WorkspaceStripSkeleton() {
  const wide = useIsWideWorkspace();
  return (
    <div
      aria-hidden="true"
      data-region="strip"
      style={{ height: wide ? STRIP_HEIGHT_PX : STRIP_HEIGHT_PHONE_PX }}
      className="flex flex-none flex-col gap-2 overflow-hidden border-t border-border bg-card px-3 pt-2.5 sm:px-3.5"
    >
      <span className="h-2.5 w-28 rounded bg-muted/70" />
      <span className="h-11 w-full flex-none rounded-[10px] bg-muted" />
      <span className="h-11 w-full flex-none rounded-[10px] bg-muted/60" />
    </div>
  );
}
