/**
 * printDocument — PDF/print export for the paged document canvas (#1912).
 *
 * Browser-native "print → Save as PDF" of the READ-ONLY `DocumentView`
 * serialized into a standalone window. "Preview === render === print": the
 * exported PDF is the same layout the canvas shows. No third-party PDF lib
 * (avoids the COEP constraints of html2canvas/jsPDF — see
 * [[project_studio_coep_assets]]); the `@page` size is taken from the
 * document's own geometry so the sheet matches Letter/Legal/A4 × orientation.
 */
import { renderToStaticMarkup } from "react-dom/server";
import DocumentView from "@/components/studio/document/DocumentView";
import {
  type DocumentEntityContent,
  type DocumentState,
  pageDimensions,
} from "@/lib/studio/editor-v2/document-state";

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

/** Open a print window rendering the document read-only and trigger the
 *  browser print dialog (→ Save as PDF). Returns false if the popup was
 *  blocked so the caller can surface a hint. */
export function printDocument(
  state: DocumentState,
  content: DocumentEntityContent | null,
  title = "Document",
): boolean {
  const markup = renderToStaticMarkup(
    <DocumentView state={state} content={content} forPrint />,
  );
  const { width, height } = pageDimensions(state);
  const win = window.open("", "_blank");
  if (!win) return false;
  const css = [
    `@page { size: ${width}px ${height}px; margin: 0; }`,
    "html,body{margin:0;padding:0;background:#fff;}",
    "*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}",
  ].join("");
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
      title,
    )}</title><style>${css}</style></head><body>${markup}</body></html>`,
  );
  win.document.close();
  win.focus();
  // Let the new window lay out before invoking print.
  win.setTimeout(() => win.print(), 300);
  return true;
}
