/**
 * The document stage's overlay plane: ONE studio-canvas surface laid over
 * every printed page of a document, so overlay elements (stock studio
 * Widgets) can sit on any page.
 *
 * Overlays store positions in PAGE units — x / width as fractions of the
 * page width, y / height as fractions of ONE page's height (y = 1.2 is 20%
 * down the second page) — so an element stays where it was put however the
 * document's length changes.
 *
 * The plane spans `pageCount` pages with a `gap` between them (a fraction
 * of one page's height): the editor draws its sheets apart
 * (EDITOR_SHEET_GAP); exports and print draw them flush (gap 0, the
 * default). The mapping is therefore piecewise — page k starts k × (1 + gap)
 * page heights down the plane — and every placement, drag, inspector edit
 * and page scroll goes through the functions here. Pure.
 */
import type { Widget, WidgetPosition } from "@/lib/studio/editor-v2/canvas-state";
import { placeWidget } from "@/lib/build/frame-edits";

/** The editor's gutter between sheets, as a fraction of a page's height. */
export const EDITOR_SHEET_GAP = 0.03;

/** The plane's height in page heights: the pages plus the gaps between. */
export function planeSpan(pageCount: number, gap = 0): number {
  const n = Math.max(1, pageCount);
  return n + (n - 1) * Math.max(0, gap);
}

/** Where page `index` starts on the plane, in page heights. */
export function planePageTop(index: number, gap = 0): number {
  return Math.max(0, index) * (1 + Math.max(0, gap));
}

/** The page under a plane offset (page heights) — the gap belongs to the
 *  page above it. */
export function planePageAt(offset: number, gap = 0): number {
  return Math.max(0, Math.floor(offset / (1 + Math.max(0, gap))));
}

/** Page units → plane offset (page heights). An `end` edge exactly on a
 *  page boundary stays on the page above (its bottom), not past the gap. */
function pageToPlane(y: number, gap: number, end = false): number {
  if (gap <= 0) return y;
  let k = Math.floor(y);
  let f = y - k;
  if (end && f === 0 && k > 0) {
    k -= 1;
    f = 1;
  }
  return planePageTop(k, gap) + f;
}

/** Plane offset (page heights) → page units. A point in a gap snaps to the
 *  bottom of the page above it. */
function planeToPage(u: number, gap: number): number {
  if (gap <= 0) return u;
  const k = planePageAt(u, gap);
  return k + Math.min(1, u - planePageTop(k, gap));
}

export function toPlanePosition(position: WidgetPosition, pageCount: number, gap = 0): WidgetPosition {
  const span = planeSpan(pageCount, gap);
  const top = pageToPlane(position.y, gap);
  const bottom = pageToPlane(position.y + position.height, gap, true);
  return { ...position, y: top / span, height: (bottom - top) / span };
}

export function fromPlanePosition(position: WidgetPosition, pageCount: number, gap = 0): WidgetPosition {
  const span = planeSpan(pageCount, gap);
  const top = planeToPage(position.y * span, gap);
  const bottom = planeToPage((position.y + position.height) * span, gap);
  return { ...position, y: top, height: bottom - top };
}

/** A new element dropped on the plane at `at` (plane 0..1), on top (`z`),
 *  returned in PAGE units for storage — the one placement rule the studio
 *  document stage and the kit's pages share. */
export function placeOnPlane(
  widget: Widget,
  at: { x: number; y: number } | undefined,
  z: number,
  pageCount: number,
  gap = 0,
): Widget {
  const onPlane = placeWidget({ ...widget, position: toPlanePosition(widget.position, pageCount, gap) }, at, z);
  return { ...onPlane, position: fromPlanePosition(onPlane.position, pageCount, gap) };
}
