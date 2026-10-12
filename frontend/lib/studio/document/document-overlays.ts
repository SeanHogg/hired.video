/**
 * Overlay-plane edits on a `DocumentState` page (#1913 / #1934(3) /
 * #2152(3)): place a dropped element (a library image / video, a widget, a
 * linked-content card), move it, delete it. Positions arrive in plane units
 * (CanvasStage's 0..1 of the whole plane, the editor's sheet gutter
 * included) and are stored in page units (overlay-plane.ts). Pure.
 */
import type { Widget, WidgetPosition } from "@/lib/studio/editor-v2/canvas-state";
import type { DocumentState, MediaBinding } from "@/lib/studio/editor-v2/document-state";
import { addOverlay } from "@/lib/studio/editor-v2/document-edit";
import { EDITOR_SHEET_GAP, fromPlanePosition, placeOnPlane } from "./overlay-plane";

function overlaysOf(state: DocumentState, pageId: string) {
  return state.pages.find((p) => p.id === pageId)?.overlays ?? [];
}

/** Add `widget` dropped at `at` (plane units) on top of the page's overlays. */
export function placeDocumentOverlay(
  state: DocumentState,
  pageId: string,
  widget: Widget,
  at: { x: number; y: number } | undefined,
  pageCount: number,
  mediaBinding?: MediaBinding,
): { state: DocumentState; widgetId: string } {
  const placed = placeOnPlane(widget, at, overlaysOf(state, pageId).length + 1, pageCount, EDITOR_SHEET_GAP);
  return {
    state: addOverlay(state, pageId, { widget: placed, ...(mediaBinding ? { mediaBinding } : {}) }),
    widgetId: placed.id,
  };
}

/** Move / resize an overlay — `position` in plane units. */
export function moveDocumentOverlay(
  state: DocumentState,
  pageId: string,
  widgetId: string,
  position: WidgetPosition,
  pageCount: number,
): DocumentState {
  const stored = fromPlanePosition(position, pageCount, EDITOR_SHEET_GAP);
  return {
    ...state,
    pages: state.pages.map((p) =>
      p.id !== pageId
        ? p
        : { ...p, overlays: p.overlays.map((o) => (o.widget.id === widgetId ? { ...o, widget: { ...o.widget, position: stored } } : o)) },
    ),
  };
}
