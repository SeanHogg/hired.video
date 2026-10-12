/**
 * The letter's free elements in its downloads: one transparent PNG per page
 * (rasterize-overlays.ts) laid over the letter's HTML.
 *
 *   print (PDF)  the page margin moves into the body's padding (repeated on
 *                every page fragment), so the page box starts at the sheet's
 *                corner and page N's PNG sits at N × the page height — the
 *                same place as on the document stage.
 *   word (.doc)  explicit pages: the letter's blocks are laid out once in
 *                the browser (cover-letter-export measures them); a block
 *                running across a page boundary is split at the last line
 *                that fits (`paginateBlocks`), so every page starts with a
 *                block of its own; page N then begins with a
 *                zero-height anchor paragraph — forced onto a new page when
 *                the block before it ended on the page before — holding
 *                page N's PNG as a floating picture positioned at (0, 0)
 *                relative to THAT page (mso-position-*-relative: page).
 *                Word anchors a picture to the page its paragraph is on, so
 *                each page's picture lands on its own page.
 *
 * Pure strings; the PNGs are our own data URLs (never user text).
 */
const DATA_PNG = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

export type LetterExportTarget = "print" | "word";

interface Sheet {
  pageWidthIn: number;
  pageHeightIn: number;
}

/** The letter's margin, in inches (the print builder's @page margin). */
export const LETTER_MARGIN_IN = 0.9;

function usable(overlays: readonly (string | null)[] | undefined): Array<{ page: number; src: string }> {
  return (overlays ?? []).flatMap((src, page) => (src && DATA_PNG.test(src) ? [{ page, src }] : []));
}

export function hasLetterOverlays(overlays: readonly (string | null)[] | undefined): boolean {
  return usable(overlays).length > 0;
}

/** Extra print CSS for the overlays (empty without any, or for Word). */
export function letterOverlayCss(overlays: readonly (string | null)[] | undefined, target: LetterExportTarget): string {
  if (!hasLetterOverlays(overlays) || target === "word") return "";
  return `
  @page { margin: 0; }
  body { margin: 0; padding: ${LETTER_MARGIN_IN}in; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
  .overlay { position: absolute; left: 0; z-index: 2; pointer-events: none; }
  .overlay img { display: block; width: 100%; height: 100%; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`;
}

/** The print overlay pictures, first thing in <body> (empty without any). */
export function letterOverlayHtml(overlays: readonly (string | null)[] | undefined, sheet: Sheet): string {
  return usable(overlays)
    .map(
      ({ page, src }) =>
        `<div class="overlay" aria-hidden="true" style="top:${(page * sheet.pageHeightIn).toFixed(3)}in;width:${sheet.pageWidthIn}in;height:${sheet.pageHeightIn}in"><img src="${src}" alt=""></div>`,
    )
    .join("");
}

// ── Word: explicit pages ──────────────────────────────────────────────────

export interface WordPagePlan {
  /** The page (0-based) each block starts on. */
  pageOf: number[];
  /** A block that starts a page after a block that ENDED on the page before
   *  gets a forced break (a block split across the boundary already
   *  carries Word onto the next page — forcing it would add a blank one). */
  breakBefore: boolean[];
}

/** Which page each block starts on, from its laid-out box (px down the
 *  letter's content flow) and one page's content height. */
export function planWordPages(blocks: ReadonlyArray<{ top: number; bottom: number }>, contentHeight: number): WordPagePlan {
  const h = contentHeight > 0 ? contentHeight : Number.POSITIVE_INFINITY;
  const pageOf = blocks.map((b) => Math.max(0, Math.floor(b.top / h)));
  const breakBefore = blocks.map((b, i) => {
    if (i === 0) return false;
    const prev = blocks[i - 1];
    return pageOf[i] > pageOf[i - 1] && prev.bottom <= pageOf[i] * h + 0.5;
  });
  return { pageOf, breakBefore };
}

/** Split `text` near `index` (the first character that falls past the
 *  page): at the last space at or before it, else right at it. Null when
 *  either side would be empty. */
export function splitAtWord(text: string, index: number): [string, string] | null {
  if (index <= 0 || index >= text.length) return null;
  const space = text.lastIndexOf(" ", index);
  const at = space > 0 ? space : index;
  const before = text.slice(0, at).trimEnd();
  const after = text.slice(at).trimStart();
  return before && after ? [before, after] : null;
}

/** What paginating needs from a laid-out letter (the hidden frame). */
export interface BlockMeasurer {
  /** Each block's box, px down the content flow. */
  rects(blocks: readonly string[]): Array<{ top: number; bottom: number }>;
  /** Block `i` split so its first part ends above `y` (px down the flow),
   *  or null when it can't be split there. */
  split(blocks: readonly string[], i: number, y: number): [string, string] | null;
}

/** The letter's blocks with every block that runs across a page boundary
 *  split at it, so EVERY page starts with a block of its own (Word anchors
 *  that page's picture before it), and the page plan for the result. */
export function paginateBlocks(
  blocks: readonly string[],
  measurer: BlockMeasurer,
  contentHeight: number,
  maxSplits = 40,
): { blocks: string[]; plan: WordPagePlan } {
  let out = [...blocks];
  let rects = measurer.rects(out);
  if (contentHeight > 0) {
    let from = 0;
    for (let splits = 0; splits < maxSplits; ) {
      const i = rects.findIndex((r, k) => k >= from && r.bottom > (Math.floor(r.top / contentHeight) + 1) * contentHeight + 0.5);
      if (i < 0) break;
      const boundary = (Math.floor(rects[i].top / contentHeight) + 1) * contentHeight;
      const parts = measurer.split(out, i, boundary);
      if (!parts) {
        from = i + 1;
        continue;
      }
      out = [...out.slice(0, i), parts[0], parts[1], ...out.slice(i + 1)];
      rects = measurer.rects(out);
      from = i + 1;
      splits += 1;
    }
  }
  return { blocks: out, plan: planWordPages(rects, contentHeight) };
}

function wordPicture(src: string, sheet: Sheet): string {
  const { pageWidthIn: w, pageHeightIn: h } = sheet;
  return `<img src="${src}" alt="" width="${Math.round(w * 96)}" height="${Math.round(h * 96)}" style="position:absolute;z-index:5;left:0;top:0;margin-left:0;margin-top:0;width:${w}in;height:${h}in;mso-position-horizontal:absolute;mso-position-horizontal-relative:page;mso-position-vertical:absolute;mso-position-vertical-relative:page;mso-wrap-style:none;mso-wrap-distance-left:0;mso-wrap-distance-right:0">`;
}

function anchor(content: string, pageBreak: boolean): string {
  return `<p class="anchor" style="margin:0;font-size:1pt;line-height:1pt;mso-line-height-rule:exactly${pageBreak ? ";page-break-before:always" : ""}">${content}</p>`;
}

/** The Word body: the letter's blocks with each page's picture anchored on
 *  its page, and forced breaks where the plan says. Pages past the letter's
 *  last block (an element below the text) are added as empty pages. */
export function wordPagedBody(
  blocks: readonly string[],
  plan: WordPagePlan,
  overlays: readonly (string | null)[] | undefined,
  sheet: Sheet,
): string {
  const pictures = new Map(usable(overlays).map(({ page, src }) => [page, src]));
  const out: string[] = [];
  const anchored = new Set<number>();
  blocks.forEach((block, i) => {
    const page = plan.pageOf[i] ?? 0;
    const first = i === 0 || (plan.pageOf[i - 1] ?? 0) !== page;
    const src = first ? pictures.get(page) : undefined;
    const pageBreak = plan.breakBefore[i] ?? false;
    if (src) {
      out.push(anchor(wordPicture(src, sheet), pageBreak));
      anchored.add(page);
      out.push(block);
    } else if (pageBreak) {
      out.push(anchor("", true));
      out.push(block);
    } else {
      out.push(block);
    }
  });
  const lastPage = Math.max(0, ...plan.pageOf);
  const extra = [...pictures.keys()].filter((p) => !anchored.has(p)).sort((a, b) => a - b);
  let at = lastPage;
  for (const page of extra) {
    if (page <= lastPage) continue; // unreachable once paginateBlocks has split every boundary
    for (; at < page - 1; at += 1) out.push(anchor("", true));
    out.push(anchor(wordPicture(pictures.get(page) ?? "", sheet), true));
    at = page;
  }
  return out.join("\n  ");
}
