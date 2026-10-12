/**
 * DocumentPagedView — READ-ONLY, paginated render of a `DocumentState` for
 * review. Two layouts, driven by a shared `DocumentViewMode`:
 *
 *   • "continuous" — the whole document as one tall sheet (what the editor
 *     authoring canvas shows), fit-to-width.
 *   • "paged"      — a two-up book spread: pages N and N+1 side by side with
 *     Prev/Next flip controls, so the user flips through the resume the way it
 *     prints. Each "page" is a WINDOW onto the SAME continuous render, cut at
 *     block boundaries by the SAME pagination the editor's sheets and the PDF
 *     use (sheet-window.tsx → sheet-pagination.ts), so preview === editor ===
 *     print.
 *
 * It renders the document body through the canonical read-only `DocumentView`
 * (theme-aware via `resolveDocumentTheme`), so the editor canvas, this preview,
 * and the printed PDF can never drift. The `DocumentViewModeToggle` (One Page |
 * Individual Pages) is exported here too so the editor stage and the fullscreen
 * preview overlay drive the same control instead of each re-deriving it.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, FileText, Files } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResumeData } from "@/types/resume";
import {
  type DocumentEntityContent,
  type DocumentState,
  pageDimensions,
} from "@/lib/studio/editor-v2/document-state";
import DocumentView from "@/components/studio/document/DocumentView";
import { SheetWindow, useSheetPages } from "@/components/studio/document/sheet-window";
import type { SheetPage } from "@/lib/studio/document/sheet-pagination";
import ResumeDocumentView from "@/components/studio/document/ResumeDocumentView";

export type DocumentViewMode = "continuous" | "paged";

const GAP = 32; // px gutter between the two pages of a spread

/** One Page | Individual Pages — the shared view-mode button group. */
export function DocumentViewModeToggle({
  value,
  onChange,
  className,
}: {
  value: DocumentViewMode;
  onChange: (next: DocumentViewMode) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn("inline-flex items-center rounded-md border border-border bg-background", className)}>
      <button
        type="button"
        onClick={() => onChange("continuous")}
        aria-pressed={value === "continuous"}
        className={cn(
          "flex items-center gap-1.5 rounded-l-md px-2.5 py-1 text-xs font-medium transition",
          value === "continuous"
            ? "bg-brand-primary text-white"
            : "text-muted-foreground hover:bg-accent",
        )}
      >
        <FileText className="h-3.5 w-3.5" /> {t("studio.document.view.onePage")}
      </button>
      <button
        type="button"
        onClick={() => onChange("paged")}
        aria-pressed={value === "paged"}
        className={cn(
          "flex items-center gap-1.5 rounded-r-md px-2.5 py-1 text-xs font-medium transition",
          value === "paged"
            ? "bg-brand-primary text-white"
            : "text-muted-foreground hover:bg-accent",
        )}
      >
        <Files className="h-3.5 w-3.5" /> {t("studio.document.view.individualPages")}
      </button>
    </div>
  );
}

interface DocumentPagedViewProps {
  state: DocumentState;
  content?: DocumentEntityContent | null;
  mode: DocumentViewMode;
  /** Optional fixed scale. When omitted the view fits-to-width of its
   *  container (capped at 1× so the sheet never upscales past print size). */
  zoom?: number;
  className?: string;
}

export default function DocumentPagedView(props: DocumentPagedViewProps) {
  // Every entity renders through the SAME fixed-sheet windowing path so the
  // view honours the page geometry (`pageDimensions` → portrait/landscape),
  // the view mode (continuous one-page sheet vs paged two-up spread), and
  // fit-to-width centering. The only per-entity difference is which body
  // component fills the sheet — resolved in `DocumentPagedSheet` by
  // `entityKind` (resume → the declarative renderer `/resumes/:id` uses;
  // everything else → the generic block `DocumentView`).
  return <DocumentPagedSheet {...props} />;
}

/** The body that fills the print sheet, by entity kind. Resume uses the SAME
 *  declarative renderer the published `/resumes/:id` page uses (columns, theme,
 *  hero, per-section layout); other documents use the generic block render.
 *  Rendered identically into the measuring node, the continuous sheet, and each
 *  paged window so pagination measures exactly what paints. */
function documentBody(state: DocumentState, content?: DocumentEntityContent | null) {
  return state.entityKind === "resume" ? (
    <ResumeDocumentView state={state} content={content as ResumeData | null | undefined} />
  ) : (
    <DocumentView state={state} content={content} forPrint />
  );
}

function DocumentPagedSheet({
  state,
  content,
  mode,
  zoom,
  className,
}: DocumentPagedViewProps) {
  const { t } = useTranslation();
  const { width, height } = pageDimensions(state);

  // Measure the full rendered height of the document (one continuous sheet) so
  // we can slice it into page-height windows. transform: scale doesn't affect
  // scrollHeight, so the measuring node is unscaled + visually hidden.
  const measureRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(height);
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const observe = () => {
      const h = el.scrollHeight;
      setContentHeight((prev) => (Math.abs(prev - h) < 1 ? prev : h));
    };
    observe();
    const ro = new ResizeObserver(observe);
    ro.observe(el);
    return () => ro.disconnect();
  }, [state, content, width, height]);

  // Pages cut at block boundaries — the editor's and the PDF's pagination.
  const { ref: flowRef, pages } = useSheetPages(height);
  const pageCount = pages.length;

  // Fit-to-width: scale so the spread (paged) or single sheet (continuous)
  // fits the container, never upscaling past 1×.
  const containerRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const wantWidth = mode === "paged" ? width * 2 + GAP : width;
  useLayoutEffect(() => {
    if (zoom != null) return; // caller controls scale
    const el = containerRef.current;
    if (!el) return;
    const fit = () => {
      const avail = el.clientWidth - 24; // breathing room
      setFitScale(Math.min(1, avail / wantWidth));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoom, wantWidth]);
  const scale = zoom ?? fitScale;

  // Spread navigation — each spread shows pages [2s, 2s+1].
  const spreadCount = Math.max(1, Math.ceil(pageCount / 2));
  const [spread, setSpread] = useState(0);
  // Clamp when pageCount shrinks (content edited / template applied).
  const clampedSpread = Math.min(spread, spreadCount - 1);
  if (clampedSpread !== spread) setSpread(clampedSpread);

  // Off-screen, zero-footprint measuring copy. A 0×0 overflow-hidden wrapper
  // keeps the full-size render laid out (so `scrollHeight` is real) without
  // adding scrollbars or affecting the visible layout.
  const measuringNode = (
    <div
      aria-hidden="true"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      <div ref={measureRef} style={{ width }}>
        <div ref={flowRef}>{documentBody(state, content)}</div>
      </div>
    </div>
  );

  if (mode === "continuous") {
    return (
      <div ref={containerRef} className={cn("flex w-full justify-center overflow-auto", className)}>
        {measuringNode}
        {/* transform: scale doesn't shrink the layout box, so reserve the
            scaled footprint with a sizing wrapper and paint from its top-left. */}
        <div style={{ width: width * scale, height: contentHeight * scale }}>
          <div
            style={{ width, transform: `scale(${scale})`, transformOrigin: "top left" }}
            className="shadow-xl ring-1 ring-black/10"
          >
            {documentBody(state, content)}
          </div>
        </div>
      </div>
    );
  }

  // Paged: two-up spread of windowed slices.
  const leftPage = clampedSpread * 2;
  const rightPage = leftPage + 1;
  const visible = [leftPage, rightPage].filter((p) => p < pageCount);

  return (
    <div className={cn("flex w-full flex-col items-center gap-3", className)}>
      {measuringNode}
      <div ref={containerRef} className="flex w-full justify-center overflow-auto">
        {/* Reserve the scaled spread footprint (transform doesn't affect
            layout size) so centering + the surrounding scroll behave. */}
        <div style={{ width: wantWidth * scale, height: height * scale }}>
          <div
            className="flex"
            style={{
              gap: GAP,
              width: wantWidth,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            {visible.map((pageIndex) => (
              <PageWindow
                key={pageIndex}
                width={width}
                height={height}
                pageIndex={pageIndex}
                page={pages[pageIndex]}
                live={pageIndex === leftPage}
              >
                {documentBody(state, content)}
              </PageWindow>
            ))}
          </div>
        </div>
      </div>

      {/* Flip controls */}
      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => setSpread((s) => Math.max(0, s - 1))}
          disabled={clampedSpread === 0}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:text-foreground disabled:opacity-40"
          aria-label={t("studio.document.view.previousPages")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="tabular-nums text-muted-foreground">
          {visible.length === 2
            ? t("studio.document.view.spreadOf", { from: leftPage + 1, to: rightPage + 1, total: pageCount })
            : t("studio.document.view.pageOf", { page: leftPage + 1, total: pageCount })}
        </span>
        <button
          type="button"
          onClick={() => setSpread((s) => Math.min(spreadCount - 1, s + 1))}
          disabled={clampedSpread >= spreadCount - 1}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:text-foreground disabled:opacity-40"
          aria-label={t("studio.document.view.nextPages")}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** A fixed page-size sheet showing the `pageIndex`-th page's window onto
 *  the continuous document. */
function PageWindow({
  width,
  height,
  pageIndex,
  page,
  live,
  children,
}: {
  width: number;
  height: number;
  pageIndex: number;
  page: SheetPage;
  live: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="relative shrink-0 overflow-hidden bg-white shadow-xl ring-1 ring-black/10"
      style={{ width, height }}
    >
      <SheetWindow page={page} pageHeight={height} width={width} live={live}>
        {children}
      </SheetWindow>
      <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] font-medium uppercase tracking-wide text-slate-300">
        {t("workspace.doc.pageN", { n: pageIndex + 1 })}
      </span>
    </div>
  );
}
