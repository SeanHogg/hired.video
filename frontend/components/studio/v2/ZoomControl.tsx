/**
 * PowerPoint-style zoom widget pinned to the bottom-right of the canvas.
 * Self-gates: receives current zoom + setter, no other props. Snap-to-fit
 * is handled here so the consumer doesn't recompute the container size.
 */
import { Minus, Plus, Maximize2 } from "lucide-react";
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
  const pct = Math.round(zoom * 100);
  const set = (next: number) =>
    onChange(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-card/95 px-2 py-1 text-xs shadow-md backdrop-blur",
        className,
      )}
    >
      <button
        type="button"
        onClick={onFit}
        aria-label="Fit to screen"
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => set(zoom - ZOOM_STEP)}
        aria-label="Zoom out"
        disabled={zoom <= MIN_ZOOM}
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="range"
        min={MIN_ZOOM * 100}
        max={MAX_ZOOM * 100}
        step={5}
        value={pct}
        onChange={(e) => set(Number(e.target.value) / 100)}
        className="h-1 w-24 cursor-pointer accent-brand-purple"
        aria-label="Zoom level"
      />
      <button
        type="button"
        onClick={() => set(zoom + ZOOM_STEP)}
        aria-label="Zoom in"
        disabled={zoom >= MAX_ZOOM}
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-10 px-1 text-center font-medium tabular-nums">
        {pct}%
      </span>
    </div>
  );
}
