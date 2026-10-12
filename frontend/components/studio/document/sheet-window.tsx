/**
 * The shared pieces of paginated document rendering (#1934(1)): every
 * surface that shows a document as pages — the editor's sheets
 * (DocumentSheet), the read-only spread (DocumentPagedView) and the PDF
 * print (DocumentSheet variant "print") — measures and cuts its flow the
 * SAME way, so the editor and the PDF break on the same lines.
 *
 *   useSheetPages   measure the laid-out flow, paginate at block
 *                   boundaries (lib/studio/document/sheet-pagination.ts)
 *   SheetWindow     one page: a fixed window onto the flow
 *
 * A window that isn't the live one is a COPY of the flow: it is made inert
 * (nothing in it focusable, editable or clickable), hidden from assistive
 * tech, and its element ids are parked (`data-sheet-id`) so the document
 * never carries duplicate ids. Layout-critical styles are inline, so the
 * windows also work in the unstyled print popup.
 */
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { collectSheetBlocks, paginateBlocks, type SheetPage } from "@/lib/studio/document/sheet-pagination";

export const FIRST_PAGE: SheetPage = { start: 0, end: Number.POSITIVE_INFINITY, clipped: false, offset: 0 };

function samePages(a: readonly SheetPage[], b: readonly SheetPage[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (p, i) =>
        Math.abs(p.start - b[i].start) < 1 && Math.abs(p.end - b[i].end) < 1 && p.clipped === b[i].clipped && p.offset === b[i].offset,
    )
  );
}

/** Measure the flow under `ref` (unscaled by `zoom`) and paginate it, again
 *  whenever it resizes or changes. */
export function useSheetPages(pageHeight: number, zoom = 1) {
  const ref = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<SheetPage[]>([FIRST_PAGE]);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const layout = collectSheetBlocks(el, pageHeight, zoomRef.current);
    const next = paginateBlocks(layout.blocks, pageHeight, layout);
    setPages((prev) => (samePages(prev, next) ? prev : next));
  }, [pageHeight]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const view = el.ownerDocument.defaultView ?? window;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = view.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resize?.observe(el);
    // A block can move without the flow's height changing (a reorder).
    const mutation = new MutationObserver(schedule);
    mutation.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      resize?.disconnect();
      mutation.disconnect();
      if (frame) view.cancelAnimationFrame(frame);
    };
  }, [measure]);

  return { ref, pages };
}

const PARKED_ID = "data-sheet-id";

/** Park (copy) or restore (live) every element id under `root`. */
function parkIds(root: HTMLElement, park: boolean) {
  if (park) {
    for (const el of Array.from(root.querySelectorAll("[id]"))) {
      el.setAttribute(PARKED_ID, el.id);
      el.removeAttribute("id");
    }
  } else {
    for (const el of Array.from(root.querySelectorAll(`[${PARKED_ID}]`))) {
      el.id = el.getAttribute(PARKED_ID) ?? "";
      el.removeAttribute(PARKED_ID);
    }
  }
}

/** A copy is inert, hidden from assistive tech and id-free; the live window
 *  is none of those. React 18 has no typed `inert`, so it is set here. */
function useCopyMode(ref: React.RefObject<HTMLDivElement>, live: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.toggleAttribute("inert", !live);
    if (live) el.removeAttribute("aria-hidden");
    else el.setAttribute("aria-hidden", "true");
    parkIds(el, !live);
    if (live) return;
    // Ids React adds later (a re-render inside the copy) are parked too.
    const observer = new MutationObserver(() => parkIds(el, true));
    observer.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["id"] });
    return () => observer.disconnect();
  }, [ref, live]);
}

interface SheetWindowProps {
  page: SheetPage;
  pageHeight: number;
  width: number;
  /** The live window (interactive, read by assistive tech); the others
   *  are copies. */
  live: boolean;
  /** The measured flow (the first page's window). */
  flowRef?: React.Ref<HTMLDivElement>;
  children: ReactNode;
}

/** One page's window onto the flow: [start, end) placed at the page's
 *  offset, clipped to the page. */
export function SheetWindow({ page, pageHeight, width, live, flowRef, children }: SheetWindowProps) {
  const ref = useRef<HTMLDivElement>(null);
  useCopyMode(ref, live);
  const span = Math.min(page.end - page.start, pageHeight - page.offset);
  const height = Number.isFinite(span) ? Math.max(0, span) : pageHeight;
  return (
    <div
      ref={ref}
      data-sheet-window={`${Math.round(page.start)}-${Number.isFinite(page.end) ? Math.round(page.end) : "end"}`}
      style={{ position: "absolute", left: 0, right: 0, top: page.offset, height, overflow: "clip" }}
    >
      <div ref={flowRef} style={{ position: "absolute", left: 0, top: -page.start, width }}>
        {children}
      </div>
    </div>
  );
}
