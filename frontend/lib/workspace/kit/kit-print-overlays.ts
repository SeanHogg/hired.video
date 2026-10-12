/**
 * A kit page's free elements for its downloads: the visible elements,
 * rasterized one PNG per printed page (rasterize-overlays.ts) on the page's
 * paper. The letter's print / Word builder and the résumé's print page lay
 * them over the document.
 */
import type { Widget } from "@/lib/studio/editor-v2/canvas-state";
import { PAGE_DIMENSIONS_PX, type DocumentState, type PageSize } from "@/lib/studio/editor-v2/document-state";
import { rasterizeOverlayPages } from "@/lib/studio/document/rasterize-overlays";
import { kitPageOverlays, type KitDocPage } from "./kit-document";

/** What prints: every element not hidden, in page units. */
export function kitPrintWidgets(state: DocumentState, page: KitDocPage): Widget[] {
  return kitPageOverlays(state, page)
    .filter((o) => !o.hidden)
    .map((o) => o.widget);
}

/** One PNG per page (null = nothing on it); empty when nothing prints. */
export async function kitPrintOverlays(
  state: DocumentState,
  page: KitDocPage,
  paper: PageSize,
  pages: number,
  projectId: string | null = null,
): Promise<Array<string | null>> {
  const widgets = kitPrintWidgets(state, page);
  if (widgets.length === 0) return [];
  const { width, height } = PAGE_DIMENSIONS_PX[paper];
  return rasterizeOverlayPages({ widgets, pageWidth: width, pageHeight: height, pages, projectId });
}
