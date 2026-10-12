/**
 * Reflow into discrete page sheets (#1934(1)).
 *
 * The document stage lays its content out once, as one continuous flow,
 * then cuts it into fixed-size pages at BLOCK boundaries — never through a
 * line — the way a printed page breaks:
 *
 *   1. `collectSheetBlocks` (DOM) reads the laid-out blocks of the flow:
 *      it walks down from the content root, splitting any element tall
 *      enough to matter into its children, and keeps leaf-ish blocks (a
 *      bullet list item, a role, a paragraph) as {top, height}.
 *   2. `paginateBlocks` (pure) merges blocks that sit side by side (a
 *      sidebar column next to the main one) into bands — a break can only
 *      fall where no block spans it — and packs the bands into pages.
 *
 * A page is a window [start, end) onto the continuous flow. A band taller
 * than a page gets a page of its own and is clipped there (`clipped`), and
 * the next page starts at the block after it.
 *
 * Pages after the first keep the flow's own top / bottom padding as an
 * inset (the print margin the first page has naturally), so every sheet
 * reads the same.
 */

export interface SheetBlock {
  /** px from the top of the continuous flow. */
  top: number;
  height: number;
}

export interface SheetPage {
  /** Window onto the flow, px: [start, end). */
  start: number;
  end: number;
  /** One block is taller than the page: what doesn't fit is cut off. */
  clipped: boolean;
  /** Where the window sits on its sheet (0 on the first page; the inset
   *  after that). */
  offset: number;
}

export interface PaginateOptions {
  /** The flow's full height (trailing space after the last block). */
  contentHeight?: number;
  /** Space kept at the top / bottom of every page after the first. */
  insetTop?: number;
  insetBottom?: number;
}

/** Sub-pixel slack, so a block that fits exactly still fits. */
const EPS = 0.5;

/** Blocks → bands: blocks whose vertical spans overlap (side-by-side
 *  columns, a block nested in another) merge, so a break never lands
 *  inside any of them. Sorted, non-overlapping. */
export function mergeBands(blocks: readonly SheetBlock[]): SheetBlock[] {
  const sorted = blocks
    .filter((b) => Number.isFinite(b.top) && Number.isFinite(b.height) && b.height > 0)
    .map((b) => ({ top: b.top, bottom: b.top + b.height }))
    .sort((a, b) => a.top - b.top);
  const bands: { top: number; bottom: number }[] = [];
  for (const b of sorted) {
    const last = bands[bands.length - 1];
    if (last && b.top < last.bottom - EPS) last.bottom = Math.max(last.bottom, b.bottom);
    else bands.push({ ...b });
  }
  return bands.map((b) => ({ top: b.top, height: b.bottom - b.top }));
}

/**
 * Pack the flow's blocks into pages of `pageHeight` px. Always at least one
 * page (an empty document is one blank sheet).
 */
export function paginateBlocks(blocks: readonly SheetBlock[], pageHeight: number, opts: PaginateOptions = {}): SheetPage[] {
  const bands = mergeBands(blocks);
  const lastBottom = bands.length ? bands[bands.length - 1].top + bands[bands.length - 1].height : 0;
  const contentHeight = Math.max(opts.contentHeight ?? 0, lastBottom);
  if (!(pageHeight > 0)) return [{ start: 0, end: contentHeight, clipped: false, offset: 0 }];
  // Insets never eat more than half a page.
  const insetTop = clamp(opts.insetTop ?? 0, 0, pageHeight / 4);
  const insetBottom = clamp(opts.insetBottom ?? 0, 0, pageHeight / 4);

  const pages: SheetPage[] = [];
  let start = 0;
  let offset = 0;
  /** The usable height of the page being filled. */
  const room = () => (pages.length === 0 ? pageHeight - insetBottom : pageHeight - insetTop - insetBottom);
  const close = (end: number, clipped = false) => {
    pages.push({ start, end, clipped, offset });
    offset = insetTop;
  };

  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    const bottom = band.top + band.height;
    if (bottom <= start + room() + EPS) continue;
    // Doesn't fit: break before it — unless it already opens this page.
    if (band.top > start + EPS) {
      close(band.top);
      start = band.top;
      if (bottom <= start + room() + EPS) continue;
    }
    // Taller than a page on its own: a page to itself, clipped.
    const roomHere = room();
    close(start + roomHere, true);
    start = i + 1 < bands.length ? bands[i + 1].top : bottom;
  }
  // The last page: whatever is left (never a blank page after a clipped one).
  if (pages.length === 0 || bands.some((b) => b.top >= start - EPS)) {
    close(Math.min(Math.max(contentHeight, start), start + room()));
  }
  return pages;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : 0));
}

/** The geometry DocumentSheet paginates: the blocks plus the flow's own
 *  leading / trailing space (kept as the inset on later pages). */
export interface SheetLayout {
  blocks: SheetBlock[];
  contentHeight: number;
  insetTop: number;
  insetBottom: number;
}

/** Elements this small stay whole; a taller one splits into its children. */
const SPLIT_FRACTION = 0.25;
const MAX_DEPTH = 24;

function isAtomic(el: Element, view: Window): boolean {
  if (el.childElementCount === 0) return true;
  // Running text (a paragraph with inline marks) is one block.
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 && (node.textContent ?? "").trim() !== "") return true;
  }
  const display = view.getComputedStyle(el).display;
  return display.startsWith("inline") || display === "table-row";
}

/**
 * Read the laid-out blocks under `root` (DOM; the sheet may be scaled by
 * `zoom`, which is divided out). Out-of-flow elements (absolute / fixed)
 * and invisible ones are skipped.
 */
export function collectSheetBlocks(root: HTMLElement, pageHeight: number, zoom = 1): SheetLayout {
  const view = root.ownerDocument.defaultView;
  const scale = zoom > 0 ? zoom : 1;
  const origin = root.getBoundingClientRect().top;
  const contentHeight = root.scrollHeight;
  const blocks: SheetBlock[] = [];
  if (!view) return { blocks, contentHeight, insetTop: 0, insetBottom: 0 };

  const walk = (el: Element, depth: number) => {
    for (const child of Array.from(el.children)) {
      const style = view.getComputedStyle(child);
      if (style.display === "none" || style.position === "absolute" || style.position === "fixed") continue;
      const r = child.getBoundingClientRect();
      const height = r.height / scale;
      if (height <= 0) continue;
      const top = (r.top - origin) / scale;
      if (depth < MAX_DEPTH && height > pageHeight * SPLIT_FRACTION && !isAtomic(child, view)) walk(child, depth + 1);
      else blocks.push({ top, height });
    }
  };
  walk(root, 0);

  const bands = mergeBands(blocks);
  const first = bands[0];
  const last = bands[bands.length - 1];
  return {
    blocks,
    contentHeight,
    insetTop: first ? first.top : 0,
    insetBottom: last ? Math.max(0, contentHeight - (last.top + last.height)) : 0,
  };
}
