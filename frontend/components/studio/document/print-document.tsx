/**
 * printDocument — PDF/print export for the paged document canvas (#1912).
 *
 * Browser-native "print → Save as PDF" of the READ-ONLY `DocumentView` in a
 * standalone window. "Preview === render === print": the document is laid
 * out in the popup and cut into pages by the SAME pagination the editor's
 * sheets use (DocumentSheet variant "print" → sheet-pagination.ts), one
 * sheet per printed page (`break-after: page`), so the PDF breaks exactly
 * where the editor does. No third-party PDF lib (avoids the COEP
 * constraints of html2canvas/jsPDF — see [[project_studio_coep_assets]]);
 * the `@page` size is the document's own geometry with no margin.
 */
import { createRoot } from "react-dom/client";
import DocumentView from "@/components/studio/document/DocumentView";
import DocumentSheet from "@/components/studio/document/DocumentSheet";
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

/** Open a print window rendering the document read-only, paginated like
 *  the editor, and trigger the browser print dialog (→ Save as PDF).
 *  Returns false if the popup was blocked so the caller can surface a hint. */
export function printDocument(
  state: DocumentState,
  content: DocumentEntityContent | null,
  title = "Document",
): boolean {
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
    )}</title><style>${css}</style></head><body><div id="print-root"></div></body></html>`,
  );
  win.document.close();
  const container = win.document.getElementById("print-root");
  if (!container) return false;
  const root = createRoot(container);
  root.render(
    <DocumentSheet variant="print" width={width} pageHeight={height} paper={state.pageSize}>
      <DocumentView state={state} content={content} forPrint />
    </DocumentSheet>,
  );
  win.addEventListener("afterprint", () => root.unmount());
  win.focus();
  // Let the popup lay out and paginate before invoking print.
  win.setTimeout(() => win.print(), 300);
  return true;
}
