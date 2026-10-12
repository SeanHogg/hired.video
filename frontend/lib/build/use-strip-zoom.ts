/**
 * useStripZoom — how far the viewer has zoomed into the video strip's
 * timeline. 1 = fit (the whole video spans the strip); each step widens the
 * tracks so short blocks get room to grab. Per-viewer UI state: never saved
 * to the plan, never in the undo history.
 *
 * Header buttons step the ladder; Ctrl/⌘ + wheel over the strip steps it too
 * (`wheelRef` binds a non-passive listener so the page doesn't zoom).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { nextZoom } from "./use-preview-zoom";

export const STRIP_ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8] as const;
export const STRIP_ZOOM_FIT = 1;
/** Narrowest a scene column gets before the strip scrolls (px, a tap target). */
export const SCENE_COLUMN_MIN_PX = 84;
/** The grid gap between scene columns (Tailwind gap-1.5). */
export const SCENE_COLUMN_GAP_PX = 6;

/** Wheel delta → a zoom step: wheel up (negative) zooms in. */
export function wheelZoomDirection(deltaY: number): 1 | -1 | 0 {
  if (deltaY < 0) return 1;
  if (deltaY > 0) return -1;
  return 0;
}

/** The zoomed tracks' CSS width (a share of the strip) and the floor under
 *  which they scroll instead of squeezing a scene below a tap target. */
export function stripTrackWidth(zoom: number, sceneCount: number): { width: string; minWidth: string } {
  const floor = sceneCount * SCENE_COLUMN_MIN_PX + Math.max(0, sceneCount - 1) * SCENE_COLUMN_GAP_PX;
  return { width: `${Math.round(zoom * 100)}%`, minWidth: `${floor}px` };
}

/** The scene columns every strip row shares (scene row, Text, Captions):
 *  each as wide as it plays, never narrower than a tap target. */
export function sceneColumnTemplate(
  scenes: ReadonlyArray<{ id: string; duration: number }>,
  times: ReadonlyArray<{ id: string; duration: number }>,
): string {
  return scenes
    .map((s) => `minmax(${SCENE_COLUMN_MIN_PX}px, ${times.find((t) => t.id === s.id)?.duration ?? s.duration}fr)`)
    .join(" ");
}

export function useStripZoom() {
  const [zoom, setZoom] = useState<number>(STRIP_ZOOM_FIT);
  const zoomIn = useCallback(() => setZoom((z) => nextZoom(z, 1, STRIP_ZOOM_STEPS)), []);
  const zoomOut = useCallback(() => setZoom((z) => nextZoom(z, -1, STRIP_ZOOM_STEPS)), []);
  const fit = useCallback(() => setZoom(STRIP_ZOOM_FIT), []);

  const [node, setNode] = useState<HTMLElement | null>(null);
  const wheelRef = useCallback((el: HTMLElement | null) => setNode(el), []);
  const stepRef = useRef({ zoomIn, zoomOut });
  stepRef.current = { zoomIn, zoomOut };
  useEffect(() => {
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const dir = wheelZoomDirection(e.deltaY);
      if (dir === 1) stepRef.current.zoomIn();
      else if (dir === -1) stepRef.current.zoomOut();
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [node]);

  return {
    zoom,
    zoomIn,
    zoomOut,
    fit,
    canZoomIn: zoom < STRIP_ZOOM_STEPS[STRIP_ZOOM_STEPS.length - 1],
    canZoomOut: zoom > STRIP_ZOOM_FIT,
    wheelRef,
  };
}

export type StripZoom = ReturnType<typeof useStripZoom>;
