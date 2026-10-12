/**
 * TrackRow — one Advanced track of the video strip: a small header (name +
 * the track's own controls) over a row of scene cells laid on the SAME
 * columns as the scene row, so a block sits under the scene it belongs to
 * and at the time it plays within it.
 */
import type { ReactNode } from "react";

interface TrackRowProps {
  /** Track name (already translated). */
  label: string;
  /** Controls beside the name (a switch, a style menu). */
  controls?: ReactNode;
  /** Shared scene column template (sceneColumnTemplate). */
  columns: string;
  /** One cell per scene, in scene order. */
  children: ReactNode;
}

export default function TrackRow({ label, controls, columns, children }: TrackRowProps) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <div className="flex min-h-6 items-center gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        {controls}
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: columns }}>
        {children}
      </div>
    </div>
  );
}

/** A scene's cell on a track: blocks are placed inside it by time. 44px
 *  tall, so a block's hit area is a full tap target. */
export function TrackCell({ children, label }: { children?: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} data-track-cell="" className="relative h-11 min-w-0 rounded-md border border-border bg-muted/40">
      {children}
    </div>
  );
}

/** `left` / `width` (as % of the cell) for a window inside a scene. */
export function spanStyle(from: number, to: number, sceneSeconds: number): { left: string; width: string } {
  const d = Math.max(0.1, sceneSeconds);
  const left = Math.max(0, Math.min(100, (from / d) * 100));
  const width = Math.max(0, Math.min(100 - left, ((to - from) / d) * 100));
  return { left: `${left}%`, width: `${width}%` };
}
