/**
 * Cover letter out of the kit workspace: Word (.doc — the HTML-as-Word pattern the
 * résumé's Word export uses, so it opens editable in Word / Google Docs),
 * PDF (the browser's print dialog on a letter-only frame → "Save as PDF"),
 * and plain text for pasting into an application form.
 *
 * ONE HTML builder feeds Word and PDF, so the two never differ. The kit's
 * free elements ride along as one PNG per page (letter-overlays.ts).
 */
import type { ResumeContent } from "@shared/resume";
import { coverLetterSender, coverLetterToText, type CoverLetter } from "@shared/cover-letter";
import { slugify } from "@shared/slugify";
import { escapeHtml as esc, triggerDownload } from "@/lib/resume-exporters";
import { letterPrintPageSize, letterStyleVars } from "@/lib/build/cover-letter/letter-style";
import {
  LETTER_MARGIN_IN,
  hasLetterOverlays,
  letterOverlayCss,
  letterOverlayHtml,
  paginateBlocks,
  planWordPages,
  splitAtWord,
  wordPagedBody,
  type BlockMeasurer,
  type LetterExportTarget,
  type WordPagePlan,
} from "@/lib/build/cover-letter/letter-overlays";

/** "October 4, 2026" in the reader's locale — the letter's date line. */
export function formatLetterDate(iso: string, locale: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
}

/** The letter's free elements (one PNG per page, rasterize-overlays.ts) and
 *  which output the HTML is for — see letter-overlays.ts. */
export interface LetterExportOptions {
  overlays?: readonly (string | null)[];
  target?: LetterExportTarget;
  /** Word with elements: the blocks as paginated (split at page
   *  boundaries) and the page each starts on - `measureLetterLayout`.
   *  Without it every block is on page 1. */
  layout?: { blocks: string[]; plan: WordPagePlan };
  /** Layout-only render for measuring: no page margin, the content width. */
  measure?: boolean;
}

/** The letter's top-level blocks, in order, one element each (the Word
 *  builder anchors a page's picture before the block that starts it). */
function letterBlocks(letter: CoverLetter, content: ResumeContent, formattedDate: string): string[] {
  const sender = coverLetterSender(content);
  const p = (s: string) => `<p>${esc(s)}</p>`;
  return [
    sender.name ? `<p class="name">${esc(sender.name)}</p>` : "",
    sender.contact.length ? `<p class="contact">${esc(sender.contact.join(" \u00b7 "))}</p>` : "",
    p(formattedDate),
    letter.recipientLines.length ? `<p class="block">${esc(letter.recipientLines.join("\n"))}</p>` : "",
    p(letter.salutation),
    ...letter.opening.map(p),
    letter.highlightsIntro ? p(letter.highlightsIntro) : "",
    letter.highlights.length
      ? `<ul>${letter.highlights.map((h) => `<li>${h.label ? `<b>${esc(h.label)}.</b> ` : ""}${esc(h.text)}</li>`).join("")}</ul>`
      : "",
    ...letter.closing.map(p),
    p(letter.signOff),
    sender.name ? p(sender.name) : "",
  ].filter(Boolean);
}

export function coverLetterHtml(letter: CoverLetter, content: ResumeContent, formattedDate: string, options: LetterExportOptions = {}): string {
  const { overlays, target = "print", layout, measure = false } = options;
  const sender = coverLetterSender(content);
  // The letter's style (fixed-map values, never user text) - same as on screen.
  const look = letterStyleVars(letter.style);
  const blocks = layout?.blocks ?? letterBlocks(letter, content, formattedDate);
  const body =
    target === "word" && hasLetterOverlays(overlays)
      ? wordPagedBody(blocks, layout?.plan ?? { pageOf: blocks.map(() => 0), breakBefore: blocks.map(() => false) }, overlays, look)
      : [target === "print" ? letterOverlayHtml(overlays, look) : "", ...blocks].filter(Boolean).join("\n  ");
  const measureCss = measure ? `\n  body { margin: 0; width: ${(look.pageWidthIn - 2 * LETTER_MARGIN_IN).toFixed(3)}in; }` : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc([sender.name, letter.jobTitle].filter(Boolean).join(" \u2014 "))}</title>
<style>
  @page { size: ${letterPrintPageSize(letter.style)}; margin: ${LETTER_MARGIN_IN}in; }
  body { font-family: ${look.fontFamily}; font-size: ${look.fontSize}; line-height: ${look.lineHeight}; color: #111; }
  .name { font-size: 1.45em; font-weight: bold; margin: 0; }
  .contact { color: #444; margin: 2pt 0 18pt; }
  p { margin: 0 0 10pt; }
  ul { margin: 0 0 10pt 16pt; padding: 0; }
  li { margin-bottom: 6pt; }
  .block { white-space: pre-line; }${letterOverlayCss(overlays, target)}${measureCss}
</style></head>
<body>
  ${body}
</body></html>`;
}

/** The first character of a paragraph's text laid out at or below `y`
 *  (binary search over character boxes), or -1. */
function firstCharBelow(doc: Document, node: Text, y: number): number {
  const range = doc.createRange();
  const topOf = (i: number) => {
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const r = range.getBoundingClientRect();
    return r.height > 0 ? r.top : Number.NaN;
  };
  let lo = 0;
  let hi = node.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    let top = topOf(mid);
    // A zero-size box (a collapsed space / newline): use the next real one.
    for (let k = mid + 1; Number.isNaN(top) && k <= hi; k += 1) top = topOf(k);
    if (Number.isNaN(top) || top >= y - 0.5) {
      found = mid;
      hi = mid - 1;
    } else lo = mid + 1;
  }
  return found;
}

/** The hidden frame as a BlockMeasurer: lays the blocks out at the letter's
 *  content width and splits a paragraph at the last line that fits (or a
 *  list between items). */
function frameMeasurer(doc: Document): BlockMeasurer {
  const render = (blocks: readonly string[]) => {
    doc.body.innerHTML = blocks.join("");
    return Array.from(doc.body.children) as HTMLElement[];
  };
  return {
    rects: (blocks) =>
      render(blocks).map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      }),
    split: (blocks, i, y) => {
      const el = render(blocks)[i];
      if (!el) return null;
      if (el.tagName === "UL") {
        const items = Array.from(el.children);
        const k = items.findIndex((li) => li.getBoundingClientRect().top >= y - 0.5);
        if (k <= 0) return null;
        const first = el.cloneNode(false) as HTMLElement;
        const rest = el.cloneNode(false) as HTMLElement;
        items.slice(0, k).forEach((li) => first.appendChild(li.cloneNode(true)));
        items.slice(k).forEach((li) => rest.appendChild(li.cloneNode(true)));
        first.style.marginBottom = "0";
        return [first.outerHTML, rest.outerHTML];
      }
      const node = el.firstChild;
      if (el.tagName !== "P" || el.childNodes.length !== 1 || node?.nodeType !== Node.TEXT_NODE) return null;
      const text = node as Text;
      const parts = splitAtWord(text.data, firstCharBelow(doc, text, y));
      if (!parts) return null;
      const first = el.cloneNode(false) as HTMLElement;
      const rest = el.cloneNode(false) as HTMLElement;
      first.textContent = parts[0];
      first.style.marginBottom = "0";
      rest.textContent = parts[1];
      return [first.outerHTML, rest.outerHTML];
    },
  };
}

/**
 * Lay the letter out once in a hidden frame (its print type, the content
 * width), split every block that runs across a page boundary at it, and say
 * which page each block starts on: Word gets one explicit page per printed
 * page, each with its own anchor (letter-overlays.ts `paginateBlocks`).
 */
export async function measureLetterLayout(
  letter: CoverLetter,
  content: ResumeContent,
  formattedDate: string,
): Promise<{ blocks: string[]; plan: WordPagePlan }> {
  const look = letterStyleVars(letter.style);
  const contentHeight = (look.pageHeightIn - 2 * LETTER_MARGIN_IN) * 96;
  const blocks = letterBlocks(letter, content, formattedDate);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${look.pageWidthIn}in;height:${look.pageHeightIn}in;border:0;visibility:hidden;`;
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    if (!doc) return { blocks, plan: planWordPages([], contentHeight) };
    doc.open();
    doc.write(coverLetterHtml(letter, content, formattedDate, { measure: true }));
    doc.close();
    await doc.fonts?.ready.catch(() => undefined);
    return paginateBlocks(blocks, frameMeasurer(doc), contentHeight);
  } finally {
    frame.remove();
  }
}

function fileName(letter: CoverLetter, content: ResumeContent): string {
  const who = content.basics?.name || "cover-letter";
  return slugify(`${who} cover letter ${letter.organization}`.trim(), { fallback: "cover-letter" });
}

export async function downloadCoverLetterWord(
  letter: CoverLetter,
  content: ResumeContent,
  formattedDate: string,
  overlays?: readonly (string | null)[],
): Promise<void> {
  // With elements, Word gets explicit pages so each page's picture is
  // anchored on its own page (letter-overlays.ts).
  const layout = hasLetterOverlays(overlays) ? await measureLetterLayout(letter, content, formattedDate) : undefined;
  const html = coverLetterHtml(letter, content, formattedDate, { overlays, target: "word", layout });
  triggerDownload(new Blob([html], { type: "application/msword" }), `${fileName(letter, content)}.doc`);
}

/** Print a letter-only frame; the dialog's "Save as PDF" makes the file. */
export function printCoverLetter(
  letter: CoverLetter,
  content: ResumeContent,
  formattedDate: string,
  overlays?: readonly (string | null)[],
): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    return;
  }
  win.document.open();
  win.document.write(coverLetterHtml(letter, content, formattedDate, { overlays, target: "print" }));
  win.document.close();
  const cleanup = () => setTimeout(() => frame.remove(), 1000);
  win.addEventListener("afterprint", cleanup, { once: true });
  win.focus();
  win.print();
  // Browsers without afterprint on frames still get cleaned up.
  setTimeout(cleanup, 60_000);
}

export async function copyCoverLetter(letter: CoverLetter, content: ResumeContent, formattedDate: string): Promise<void> {
  await navigator.clipboard.writeText(coverLetterToText(letter, content, formattedDate));
}
