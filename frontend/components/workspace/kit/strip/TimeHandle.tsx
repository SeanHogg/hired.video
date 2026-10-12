/**
 * TimeHandle — a draggable point in time on a strip track (a text block's
 * edge, the music's edges, fades and body): a thin visible bar (or the
 * host's own visual) on a transparent 44px hit area, exposed as a slider.
 *
 * Drag it, or focus it and use ← / → (⇧ for whole seconds). The host gets
 * `onBegin` once per gesture (snapshot what was there; one undo group per
 * gesture) and then `onDelta(seconds since the gesture began)`. A press
 * that didn't move is a tap (`onTap`) — the hit area may cover a narrow
 * block underneath.
 */
import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TimeHandleProps {
  label: string;
  /** The value the slider reports, in seconds. */
  value: number;
  max: number;
  /** Seconds per pixel, read from the pressed element when a drag begins. */
  secondsPerPx: (el: HTMLElement) => number | null;
  onBegin: () => void;
  onDelta: (deltaSeconds: number) => void;
  onTap?: () => void;
  /** Placement of the 44px hit area (absolute, inside the host). */
  className?: string;
  /** The visible part; default a thin bar shown on hover / focus. */
  visual?: ReactNode;
  /** Position inside the host (e.g. a fade handle's `left`). */
  style?: CSSProperties;
  /** Seconds per ← / → (⇧: `keyStepLarge`). */
  keyStep?: number;
  keyStepLarge?: number;
}

/** Below this many px a press is a tap, not a drag. */
const TAP_SLOP_PX = 3;

export default function TimeHandle({ label, value, max, secondsPerPx, onBegin, onDelta, onTap, className, visual, style, keyStep = 0.1, keyStepLarge = 1 }: TimeHandleProps) {
  const drag = useRef<{ x: number; perPx: number; moved: boolean } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLSpanElement>) => {
    const perPx = secondsPerPx(e.currentTarget);
    if (perPx === null) return;
    e.preventDefault();
    e.stopPropagation();
    drag.current = { x: e.clientX, perPx, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.abs(e.clientX - d.x) < TAP_SLOP_PX) return;
      d.moved = true;
      onBegin();
    }
    onDelta((e.clientX - d.x) * d.perPx);
  };
  const cancel = () => {
    drag.current = null;
  };
  const onPointerUp = () => {
    const tapped = drag.current !== null && !drag.current.moved;
    cancel();
    if (tapped) onTap?.();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    const dir = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (dir === 0) return;
    e.preventDefault();
    onBegin();
    onDelta(dir * (e.shiftKey ? keyStepLarge : keyStep));
  };

  return (
    <span
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max * 10) / 10}
      aria-valuenow={Math.round(value * 10) / 10}
      aria-valuetext={`${value.toFixed(1)}s`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={cancel}
      onKeyDown={onKeyDown}
      style={style}
      className={cn("group/handle absolute inset-y-0 z-10 flex w-11 cursor-ew-resize touch-none justify-center focus-visible:outline-none", className)}
    >
      {visual ?? (
        <span
          aria-hidden="true"
          className="pointer-events-none h-full w-2 rounded bg-primary opacity-0 transition-opacity group-hover:opacity-70 group-hover/handle:opacity-70 group-focus-visible/handle:opacity-100 group-focus-visible/handle:ring-2 group-focus-visible/handle:ring-ring"
        />
      )}
    </span>
  );
}
