/**
 * Move / resize / rotate gesture math for anything on a canvas stage (#1101)
 * — the one implementation behind `<TransformHandles/>` (DrawingStage) and
 * the studio widget chrome (CanvasStage).
 *
 *   Move    pointer delta added to the start rect's (x, y).
 *   Resize  pointer delta un-rotated into the rect's local frame, so the
 *           bottom-right handle grows w/h along the rect's own axes.
 *   Rotate  atan2 angle from the rect's screen-space centre to the pointer,
 *           diffed against the start angle.
 *
 * Units: `rect` lives in stage units (`stageWidth` × `stageHeight`) — pass
 * 1 × 1 for fractional positions. Pointer pixels are scaled by the stage's
 * on-screen size, so zoom never changes the math.
 */
import { useRef } from "react";

export interface TransformRect {
  /** Top-left x in stage coordinates. */
  x: number;
  /** Top-left y in stage coordinates. */
  y: number;
  width: number;
  height: number;
  /** Rotation in degrees, clockwise. */
  rotation: number;
}

export type TransformMode = "move" | "resize" | "rotate";

export interface UseTransformDragOptions {
  rect: TransformRect;
  stageWidth: number;
  stageHeight: number;
  /** The stage's on-screen box at drag start. */
  getStageRect: () => DOMRect | null;
  /** The next rect on every pointermove during a drag. */
  onChange: (next: TransformRect) => void;
  /** A drag began (hosts select the item here). */
  onStart?: () => void;
  /** A drag ended (hosts flush a history checkpoint here). */
  onCommit?: () => void;
  /** Bounds for move / resize results. */
  clamp?: (next: TransformRect) => TransformRect;
  /** Smallest width / height a resize may reach, in stage units. */
  minSize?: number;
}

export interface TransformDrag {
  begin(e: React.PointerEvent<Element>, mode: TransformMode): void;
  move(e: React.PointerEvent<Element>): void;
  end(e: React.PointerEvent<Element>): void;
}

interface DragStart {
  pointerId: number;
  mode: TransformMode;
  startClientX: number;
  startClientY: number;
  startRect: TransformRect;
  stageRect: DOMRect;
}

export function unrotateDelta(dx: number, dy: number, rotationDeg: number): { dx: number; dy: number } {
  if (!rotationDeg) return { dx, dy };
  const r = (-rotationDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { dx: dx * cos - dy * sin, dy: dx * sin + dy * cos };
}

export function normalizeDeg(deg: number): number {
  let out = deg % 360;
  if (out > 180) out -= 360;
  if (out < -180) out += 360;
  return out;
}

/** The rect a drag reaches at `client` (pure — the hook's math). */
export function dragRect(
  s: Pick<DragStart, "mode" | "startClientX" | "startClientY" | "startRect" | "stageRect">,
  client: { x: number; y: number },
  stage: { width: number; height: number },
  minSize: number,
): TransformRect {
  const dx = ((client.x - s.startClientX) / s.stageRect.width) * stage.width;
  const dy = ((client.y - s.startClientY) / s.stageRect.height) * stage.height;
  const r = s.startRect;
  if (s.mode === "move") return { ...r, x: r.x + dx, y: r.y + dy };
  if (s.mode === "rotate") {
    const cx = s.stageRect.left + ((r.x + r.width / 2) / stage.width) * s.stageRect.width;
    const cy = s.stageRect.top + ((r.y + r.height / 2) / stage.height) * s.stageRect.height;
    const start = Math.atan2(s.startClientY - cy, s.startClientX - cx);
    const now = Math.atan2(client.y - cy, client.x - cx);
    return { ...r, rotation: normalizeDeg(r.rotation + ((now - start) * 180) / Math.PI) };
  }
  const local = unrotateDelta(dx, dy, r.rotation);
  return { ...r, width: Math.max(minSize, r.width + local.dx), height: Math.max(minSize, r.height + local.dy) };
}

export function useTransformDrag({
  rect,
  stageWidth,
  stageHeight,
  getStageRect,
  onChange,
  onStart,
  onCommit,
  clamp,
  minSize = 8,
}: UseTransformDragOptions): TransformDrag {
  const startRef = useRef<DragStart | null>(null);
  return {
    begin(e, mode) {
      const stageRect = getStageRect();
      if (!stageRect) return;
      e.stopPropagation();
      onStart?.();
      e.currentTarget.setPointerCapture(e.pointerId);
      startRef.current = { pointerId: e.pointerId, mode, startClientX: e.clientX, startClientY: e.clientY, startRect: { ...rect }, stageRect };
    },
    move(e) {
      const s = startRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const next = dragRect(s, { x: e.clientX, y: e.clientY }, { width: stageWidth, height: stageHeight }, minSize);
      onChange(clamp && s.mode !== "rotate" ? clamp(next) : next);
    },
    end(e) {
      const s = startRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      startRef.current = null;
      onCommit?.();
    },
  };
}
