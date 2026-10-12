/**
 * DocumentPages — the strip's row for a résumé / letter: "Résumé pages ·
 * Letter size" (or "Letter pages", A4), one tile per printed page, the page
 * in view highlighted; click a tile to bring it into view.
 *
 * The count and the paper come from the document stage (DocumentSheet →
 * KitDocumentStage.reportPages → docLayers.pageCounts) — never measured
 * twice. The DOM is read only for scroll position: where the rendered paper
 * sits in the canvas scroller and how tall one page renders (zoom included).
 * Pages sit apart by the editor's gutter: the page math is the overlay
 * plane's (planePageTop / planePageAt), so scrolling and elements agree.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PAGE_DIMENSIONS_PX, type PageSize } from "@/lib/studio/editor-v2/document-state";
import { EDITOR_SHEET_GAP, planePageAt, planePageTop } from "@/lib/studio/document/overlay-plane";
import { KIT_PAGES_TITLE_KEY, type KitDocPage } from "@/lib/workspace/kit/kit-document";
import { cn } from "@/lib/utils";

interface DocumentPagesProps {
  page: KitDocPage;
  /** Printed pages, as the stage reported them. */
  pages: number;
  paper: PageSize;
}

const PAPER_SELECTOR = '[data-region="canvas"] [data-page] [data-paper]';
const scroller = () => document.querySelector<HTMLElement>('[data-region="canvas"]');
const paperEl = () => document.querySelector<HTMLElement>(PAPER_SELECTOR);

/** Where the paper starts inside the canvas scroller, and one page's
 *  rendered height (a zoomed page measures true). */
function geometry(el: HTMLElement, box: HTMLElement, ratio: number) {
  const rect = el.getBoundingClientRect();
  return { top: rect.top - box.getBoundingClientRect().top + box.scrollTop, pageHeight: rect.width * ratio };
}

export default function DocumentPages({ page, pages, paper }: DocumentPagesProps) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(0);
  const { width, height } = PAGE_DIMENSIONS_PX[paper];
  const ratio = height / width;
  const count = Math.max(1, pages);

  // The page in view: the one under the top third of the canvas.
  useEffect(() => {
    const box = scroller();
    if (!box) return;
    const onScroll = () => {
      const el = paperEl();
      if (!el) return;
      const { top, pageHeight } = geometry(el, box, ratio);
      if (pageHeight === 0) return;
      const index = planePageAt((box.scrollTop + box.clientHeight / 3 - top) / pageHeight, EDITOR_SHEET_GAP);
      setCurrent(Math.min(Math.max(index, 0), count - 1));
    };
    onScroll();
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => box.removeEventListener("scroll", onScroll);
  }, [page, ratio, count]);

  const goTo = (index: number) => {
    const el = paperEl();
    const box = scroller();
    if (!el || !box) return;
    const { top, pageHeight } = geometry(el, box, ratio);
    box.scrollTo({ top: top + planePageTop(index, EDITOR_SHEET_GAP) * pageHeight - 12, behavior: "smooth" });
  };

  const title = t(KIT_PAGES_TITLE_KEY[page]);
  return (
    <div className="flex h-full min-w-0 items-center gap-3">
      <p className="flex-none text-[11px] leading-tight text-muted-foreground">
        <span className="block font-semibold text-foreground">{title}</span>
        {t(paper === "a4" ? "workspace.strip.paperA4" : "workspace.strip.paperLetter")}
      </p>
      <ol aria-label={title} className="flex h-full items-center gap-2">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="h-full">
            <button
              type="button"
              onClick={() => goTo(i)}
              aria-label={t("workspace.strip.goToPage", { n: i + 1 })}
              aria-current={i === current ? "page" : undefined}
              style={{ aspectRatio: `${width} / ${height}` }}
              className={cn(
                "flex h-full min-w-11 max-h-[96px] items-end justify-center rounded-md border bg-background pb-1 text-[11px] font-semibold shadow-sm hover:border-primary hover:text-foreground",
                i === current ? "border-2 border-primary text-foreground" : "border-border text-muted-foreground",
              )}
            >
              {i + 1}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
