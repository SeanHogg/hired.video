/**
 * Zoom widget pinned to the bottom-centre of the canvas, styled as the
 * design system's floating canvas pill (card, rounded-xl, soft shadow,
 * hairline dividers).
 * Self-gates: receives current zoom + setter, no other props. Snap-to-fit
 * is handled here so the consumer doesn't recompute the container size.
 */
import { Minus, Plus, Maximize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 0.1;

export interface ZoomControlProps {
  zoom: number;
  onChange: (zoom: number) => void;
  onFit: () => void;
  className?: string;
}

export default function ZoomControl({
  zoom,
  onChange,
  onFit,
  className,
}: ZoomControlProps) {
  const { t } = useTranslation();
  const pct = Math.round(zoom * 100);
  const set = (next: number) =>
    onChange(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));

  const btn =
    "flex h-[34px] w-[30px] items-center justify-center rounded-lg text-foreground hover:bg-muted disabled:opacity-40";

  return (
    <div
      role="toolbar"
      aria-label={t("studio.canvas.zoomToolbar")}
      className={cn(
        "pointer-events-auto flex items-center gap-0.5 rounded-xl border border-border bg-card p-1 text-xs shadow-[0_4px_14px_-8px_hsl(var(--foreground)/0.4)]",
        className,
      )}
    >
      <button
        type="button"
        onClick={onFit}
        aria-label={t("studio.canvas.fitToScreen")}
        title={t("studio.canvas.fitToScreen")}
        className={cn(btn, "w-[34px]")}
      >
        <Maximize2 className="h-4 w-4" />
      </button>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
      <input
        type="range"
        min={MIN_ZOOM * 100}
        max={MAX_ZOOM * 100}
        step={5}
        value={pct}
        onChange={(e) => set(Number(e.target.value) / 100)}
        className="mx-1 h-1 w-20 cursor-pointer accent-primary"
        aria-label={t("studio.canvas.zoomLevel")}
      />
      <button
        type="button"
        onClick={() => set(zoom - ZOOM_STEP)}
        aria-label={t("studio.timeline.zoomOut")}
        disabled={zoom <= MIN_ZOOM}
        className={btn}
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="min-w-[38px] text-center font-mono text-xs tabular-nums text-foreground">
        {pct}%
      </span>
      <button
        type="button"
        onClick={() => set(zoom + ZOOM_STEP)}
        aria-label={t("studio.timeline.zoomIn")}
        disabled={zoom >= MAX_ZOOM}
        className={btn}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
