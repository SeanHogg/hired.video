/**
 * The canvas stage's zoom: the zoom value, the scroll container it fits to,
 * fit-to-container, and the refits on window resize / panel resize (#578).
 * Lifted out of StudioEditorV2.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function useStageZoom(canvasWidth: number, canvasHeight: number) {
  const [zoom, setZoom] = useState<number>(0.56);
  const stageContainerRef = useRef<HTMLDivElement>(null);

  const fitZoom = useCallback(() => {
    const el = stageContainerRef.current;
    if (!el) return;
    const padding = 40;
    const availW = el.clientWidth - padding;
    const availH = el.clientHeight - padding;
    if (availW <= 0 || availH <= 0) return;
    const z = Math.min(availW / canvasWidth, availH / canvasHeight);
    setZoom(Math.max(0.1, Math.min(3, z)));
  }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function onResize() {
      fitZoom();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fitZoom]);

  // #578 — refit zoom when the surrounding panels expand/collapse. We
  // only do it when the user has the canvas at the previously-fit zoom
  // value (within a 1 % tolerance) so a manually-tuned zoom doesn't get
  // clobbered by a panel toggle.
  const fittedZoomRef = useRef<number | null>(null);
  useEffect(() => {
    const el = stageContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const lastFit = fittedZoomRef.current;
        if (lastFit !== null && Math.abs(zoom - lastFit) > 0.01) return;
        const padding = 40;
        const availW = el.clientWidth - padding;
        const availH = el.clientHeight - padding;
        if (availW <= 0 || availH <= 0) return;
        const next = Math.max(
          0.1,
          Math.min(3, Math.min(availW / canvasWidth, availH / canvasHeight)),
        );
        fittedZoomRef.current = next;
        setZoom(next);
      });
    });
    observer.observe(el);
    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
    };
    // We intentionally depend only on the canvas dimensions; the zoom
    // tolerance check above guards against clobbering manual zoom.
  }, [canvasWidth, canvasHeight]);

  return { zoom, setZoom, stageContainerRef, fitZoom };
}
