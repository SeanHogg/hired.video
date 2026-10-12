/**
 * DocumentSheet — a document as discrete, fixed-size pages at true print
 * width (Letter / Legal / A4 …). The content is laid out once as a
 * continuous flow, measured, and cut into pages at block boundaries
 * (sheet-window.tsx → lib/studio/document/sheet-pagination.ts, #1934(1)):
 * each page is a window onto that flow, so no line is ever split by a page
 * edge, and a block taller than a page gets a page of its own, clipped.
 *
 * Two variants, ONE pagination:
 *   editor  the studio's block editor and the kit's pages (DocumentStage):
 *           sheets apart by the editor's gutter, labels, an overflow cue,
 *           scaled by the zoom, with the overlay plane over the stack.
 *   print   the PDF (print-document.tsx, the résumé print page): sheets
 *           flush, one per printed page (`break-after: page`), so the PDF
 *           breaks exactly where the editor does.
 *
 * Exactly one window is live (interactive, read by assistive tech) — the
 * first, or in the editor the sheet under the pointer; the others are inert
 * copies with their ids parked (sheet-window.tsx).
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { EDITOR_SHEET_GAP, planePageTop, planeSpan } from "@/lib/studio/document/overlay-plane";
import { SheetWindow, useSheetPages } from "./sheet-window";

interface DocumentSheetProps {
  width: number;
  /** One printed page's height, px. */
  pageHeight: number;
  zoom?: number;
  variant?: "editor" | "print";
  /** The stack is at least this many pages (an element below the
   *  content's end keeps its page). */
  minPages?: number;
  /** Paper name for the strip ("letter" | "a4" | …), on `data-paper`. */
  paper?: string;
  /** Page labels ("Page 2"); already translated by the caller. */
  pageLabel?: (n: number) => string;
  /** The content measured this many printed pages. */
  onPageCount?: (pages: number) => void;
  /** The overlay plane over the whole stack (`planeHeight` px, gutters
   *  included — overlay-plane.ts maps page units onto it). */
  overlay?: (pageCount: number, planeHeight: number) => ReactNode;
  className?: string;
  style?: React.CSSProperties;
  sheetProps?: React.HTMLAttributes<HTMLDivElement>;
  children: ReactNode;
}

/** Is focus being typed into inside `el` (don't move the live window then)? */
function editingInside(el: Element | null): boolean {
  const active = el?.ownerDocument.activeElement as HTMLElement | null | undefined;
  return !!active && !!el?.contains(active) && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
}

export default function DocumentSheet({
  width,
  pageHeight,
  zoom = 1,
  variant = "editor",
  minPages = 1,
  paper,
  pageLabel,
  onPageCount,
  overlay,
  className,
  style,
  sheetProps,
  children,
}: DocumentSheetProps) {
  const { t } = useTranslation();
  const print = variant === "print";
  const labelOf = pageLabel ?? ((n: number) => t("workspace.doc.pageN", { n }));
  const { ref: flowRef, pages } = useSheetPages(pageHeight, zoom);
  const contentPages = pages.length;
  const [live, setLive] = useState(0);
  const stackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    onPageCount?.(contentPages);
  }, [contentPages, onPageCount]);

  const pageCount = Math.max(contentPages, minPages);
  const liveIndex = live < contentPages ? live : 0;
  const gap = print ? 0 : EDITOR_SHEET_GAP;
  const planeHeight = planeSpan(pageCount, gap) * pageHeight;

  // The sheet under the pointer (or a drag) becomes the live one — unless
  // something is being typed in the current one.
  const goLive = (i: number) => {
    if (i === liveIndex || i >= contentPages) return;
    const current = stackRef.current?.querySelector(`[data-doc-sheet="${liveIndex + 1}"]`) ?? null;
    if (!editingInside(current)) setLive(i);
  };

  return (
    <div
      className={cn(!print && "relative mx-auto flex-none")}
      style={print ? undefined : { width: width * zoom, height: planeHeight * zoom }}
    >
      <div
        {...sheetProps}
        ref={stackRef}
        data-paper={paper ?? "letter"}
        data-paper-ratio={pageHeight / width}
        data-page-count={pageCount}
        data-sheet-gap={gap}
        className={cn(!print && "absolute left-0 top-0 origin-top-left", className)}
        style={{ width, height: print ? undefined : planeHeight, transform: print ? undefined : `scale(${zoom})`, ...style }}
      >
        {Array.from({ length: pageCount }).map((_, i) => {
          const page = pages[i];
          return (
            <div
              key={`sheet-${i}`}
              data-doc-sheet={i + 1}
              onPointerEnter={print ? undefined : () => goLive(i)}
              onDragEnter={print ? undefined : () => goLive(i)}
              className={cn(
                // force-light-scope: each sheet is white paper under either
                // theme, so fields typed on it stay dark-on-white.
                "force-light-scope",
                !print && "shadow-xl ring-1 ring-black/10",
              )}
              style={{
                position: print ? "relative" : "absolute",
                left: 0,
                top: print ? undefined : planePageTop(i, gap) * pageHeight,
                width,
                height: pageHeight,
                overflow: "hidden",
                background: "#fff",
                breakAfter: print && i < pageCount - 1 ? "page" : undefined,
                // The legacy spelling too (older print engines honour only it).
                pageBreakAfter: print && i < pageCount - 1 ? "always" : undefined,
                breakInside: print ? "avoid" : undefined,
              }}
            >
              {page && (
                <SheetWindow page={page} pageHeight={pageHeight} width={width} live={i === liveIndex} flowRef={i === 0 ? flowRef : undefined}>
                  {children}
                </SheetWindow>
              )}
              {!print && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-2 z-20 text-[10px] font-medium uppercase tracking-wide text-slate-300"
                >
                  {labelOf(i + 1)}
                </div>
              )}
              {!print && page?.clipped && <OverflowCue />}
            </div>
          );
        })}
        {!print && overlay?.(pageCount, planeHeight)}
      </div>
    </div>
  );
}

/** A block runs past the bottom of its sheet. */
function OverflowCue() {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex h-14 items-end justify-center bg-gradient-to-t from-review to-transparent pb-1.5">
      <span className="rounded-full border border-review-border bg-review px-2 py-0.5 text-[10px] font-semibold text-review-foreground">
        {t("workspace.doc.overflow")}
      </span>
    </div>
  );
}
