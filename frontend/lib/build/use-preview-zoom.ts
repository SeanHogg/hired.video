/**
 * Zoom level for the kit résumé page. Steps instead of a free slider so
 * the paper always lands on a readable size; "fit" returns to 100%, where the
 * page fills the preview column's width.
 */
import { useCallback, useState } from "react";

export const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;
export const DEFAULT_ZOOM = 1;

/** The next step up / down a zoom ladder (the résumé page's by default). */
export function nextZoom(current: number, direction: 1 | -1, steps: readonly number[] = ZOOM_STEPS): number {
  const index = steps.findIndex((z) => z >= current - 1e-6);
  const at = index === -1 ? steps.length - 1 : index;
  const target = Math.min(steps.length - 1, Math.max(0, at + direction));
  return steps[target];
}

export function usePreviewZoom() {
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);
  const zoomIn = useCallback(() => setZoom((z) => nextZoom(z, 1)), []);
  const zoomOut = useCallback(() => setZoom((z) => nextZoom(z, -1)), []);
  const fit = useCallback(() => setZoom(DEFAULT_ZOOM), []);
  return {
    zoom,
    zoomIn,
    zoomOut,
    fit,
    canZoomIn: zoom < ZOOM_STEPS[ZOOM_STEPS.length - 1],
    canZoomOut: zoom > ZOOM_STEPS[0],
  };
}

export type PreviewZoom = ReturnType<typeof usePreviewZoom>;
