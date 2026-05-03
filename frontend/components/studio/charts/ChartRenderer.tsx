/**
 * ChartRenderer — single canonical chart visualisation. Mounts an
 * HTML <canvas> and draws via the shared `drawChart` from
 * `lib/studio/chart-canvas.ts`. The same `drawChart` is invoked from
 * the export-time scene compiler (canvas-nodes.ts), so what users see
 * here in the editor preview is exactly what's baked into the rendered
 * MP4 — no recharts vs canvas-placeholder mismatch.
 *
 * Self-contained per the DRY rule:
 *   • Owns its own size observer + DPI scaling so the chart stays
 *     crisp regardless of the parent's responsive layout.
 *   • Owns the empty-state fallback (the underlying drawChart paints
 *     a centred "no data" line — callers don't have to gate).
 *   • Owns the dark/light foreground heuristic so the chart reads on
 *     either backdrop.
 *
 * The component re-renders the canvas whenever any input changes.
 * Cheap because drawChart is pure draw calls, no React subtree.
 */

import { useEffect, useRef } from "react";
import { drawChart } from "@/lib/studio/chart-canvas";
import type { ChartFormat } from "@/lib/studio/chart-data";
import type { ChartType } from "@/types/video-script";
import { cn } from "@/lib/utils";

interface ChartRendererProps {
  chartType: ChartType;
  data: string;
  format?: ChartFormat;
  colors?: string[];
  title?: string;
  takeaway?: string;
  /** Foreground (axis / label) colour. Defaults to currentColor of the
   *  parent — works on both light + dark backdrops. */
  foreground?: string;
  className?: string;
}

export default function ChartRenderer({
  chartType,
  data,
  format,
  colors,
  title,
  takeaway,
  foreground,
  className,
}: ChartRendererProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const draw = () => {
      const rect = wrapper.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssW = Math.max(1, Math.floor(rect.width));
      const cssH = Math.max(1, Math.floor(rect.height));
      // Resize the bitmap to match CSS size × DPR for crisp rendering.
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      // Default foreground = currentColor — read the parent's CSS so
      // dark mode + light mode both look right without prop wiring.
      const computedFg = foreground ?? getComputedStyle(wrapper).color;
      drawChart(ctx, {
        chartType,
        data,
        format,
        x: 0,
        y: 0,
        w: cssW,
        h: cssH,
        colors,
        title,
        takeaway,
        foreground: computedFg,
      });
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [chartType, data, format, colors, title, takeaway, foreground]);

  return (
    <div ref={wrapperRef} className={cn("relative w-full h-full", className)}>
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
