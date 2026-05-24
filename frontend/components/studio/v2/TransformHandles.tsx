/**
 * TransformHandles — shared selection chrome for "thing on a canvas
 * the user can move, resize, or rotate." Mirrors the visual pattern
 * from V2 Video's `<CanvasStage>` widget selection (halo + bottom-
 * right resize handle + rotation ball with stick) so every selectable
 * surface across the editor reads identically.
 *
 * Used by:
 *   - DrawingStage's Hand-tool selection (around the active layer's
 *     content bbox, in canvas coordinates).
 *   - Future: CanvasStage's WidgetView (migration tracked separately
 *     so the prior widget-resize behavior stays bit-for-bit identical
 *     in this pass).
 *
 * Coordinates: the rect (`x, y, width, height, rotation`) is in
 * STAGE-relative percentages or fractions — the parent computes the
 * scale + provides the rect in whatever coord space its stage uses.
 * Handler callbacks receive the next rect in the same coord space.
 *
 * Math is identical to CanvasStage:
 *   - Move:    pointer delta added to (x, y) of the start position.
 *   - Resize:  pointer delta un-rotated into the rect's local frame
 *              so dragging the handle grows w/h along the rect's own
 *              axes (matches the visual expectation when rotated).
 *   - Rotate:  atan2 angle from the rect's screen-space CENTRE to the
 *              pointer; diff against the start angle.
 */

import { useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

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

interface TransformHandlesProps {
  rect: TransformRect;
  /** Width / height of the STAGE (the surface the rect lives on) in
   *  the same coord system as `rect.x / .y`. Used to translate
   *  pointer pixels into stage units. */
  stageWidth: number;
  stageHeight: number;
  /** Called with the next rect on every pointermove during a drag. */
  onChange: (next: TransformRect) => void;
  /** Called on pointerup so the host can flush a history checkpoint. */
  onCommit?: () => void;
  /** Hides the handles + halo when false. The drag affordance is
   *  still mounted (the rect is the click-to-move surface). */
  selected: boolean;
  /** Stage-relative class string passed through to the wrapper. */
  className?: string;
  /** Optional clamp on the rect's bounds. Defaults to "no clamping"
   *  so callers (image layer host) can drag pixels off-canvas freely. */
  clamp?: (next: TransformRect) => TransformRect;
}

type DragMode = "move" | "resize" | "rotate";

interface DragStart {
  pointerId: number;
  mode: DragMode;
  startClientX: number;
  startClientY: number;
  startRect: TransformRect;
  stageRect: DOMRect;
}

export default function TransformHandles({
  rect,
  stageWidth,
  stageHeight,
  onChange,
  onCommit,
  selected,
  className,
  clamp,
}: TransformHandlesProps) {
  const startRef = useRef<DragStart | null>(null);

  function beginDrag(e: React.PointerEvent<HTMLDivElement>, mode: DragMode) {
    const target = e.currentTarget;
    const stage = target.parentElement;
    if (!stage) return;
    e.stopPropagation();
    target.setPointerCapture(e.pointerId);
    startRef.current = {
      pointerId: e.pointerId,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: { ...rect },
      stageRect: stage.getBoundingClientRect(),
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const s = startRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    // Convert pointer-pixel delta into STAGE-unit delta. stageRect.width
    // is the on-screen width in pixels; stageWidth is the same surface
    // in stage units. The ratio scales every pointer delta into stage
    // coordinates without depending on the current zoom level.
    const dx = ((e.clientX - s.startClientX) / s.stageRect.width) * stageWidth;
    const dy = ((e.clientY - s.startClientY) / s.stageRect.height) * stageHeight;
    if (s.mode === "move") {
      const candidate: TransformRect = {
        ...s.startRect,
        x: s.startRect.x + dx,
        y: s.startRect.y + dy,
      };
      onChange(clamp ? clamp(candidate) : candidate);
    } else if (s.mode === "rotate") {
      // Angle from the rect's screen-space CENTRE to the pointer.
      const cxPx =
        s.stageRect.left +
        ((s.startRect.x + s.startRect.width / 2) / stageWidth) * s.stageRect.width;
      const cyPx =
        s.stageRect.top +
        ((s.startRect.y + s.startRect.height / 2) / stageHeight) * s.stageRect.height;
      const startAngle = Math.atan2(s.startClientY - cyPx, s.startClientX - cxPx);
      const currentAngle = Math.atan2(e.clientY - cyPx, e.clientX - cxPx);
      const deltaDeg = ((currentAngle - startAngle) * 180) / Math.PI;
      onChange({ ...s.startRect, rotation: normalizeDeg(s.startRect.rotation + deltaDeg) });
    } else {
      // Resize — un-rotate the pointer delta into the rect's local
      // frame so the handle grows w/h along the rect's own axes (the
      // intuitive feel matching V2 Video's widget resize).
      const local = unrotateDelta(dx, dy, s.startRect.rotation);
      const candidate: TransformRect = {
        ...s.startRect,
        width: Math.max(8, s.startRect.width + local.dx),
        height: Math.max(8, s.startRect.height + local.dy),
      };
      onChange(clamp ? clamp(candidate) : candidate);
    }
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    const s = startRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    startRef.current = null;
    onCommit?.();
  }

  // Positioning style — the rect lives in stage units, the chrome is
  // positioned as percentages so it scales with the stage no matter
  // the zoom level.
  const wrapperStyle: CSSProperties = {
    position: "absolute",
    left: `${(rect.x / stageWidth) * 100}%`,
    top: `${(rect.y / stageHeight) * 100}%`,
    width: `${(rect.width / stageWidth) * 100}%`,
    height: `${(rect.height / stageHeight) * 100}%`,
    transform: rect.rotation !== 0 ? `rotate(${rect.rotation}deg)` : undefined,
    transformOrigin: "center",
    boxShadow: selected
      ? "0 0 0 2px #ffffff, 0 0 0 4px hsl(var(--brand-purple))"
      : undefined,
    cursor: "move",
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => beginDrag(e, "move")}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn("pointer-events-auto select-none", className)}
      style={wrapperStyle}
      aria-label="Transform handles"
    >
      {selected && (
        <>
          {/* Resize handle — bottom-right corner. */}
          <div
            onPointerDown={(e) => beginDrag(e, "resize")}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize rounded-sm bg-brand-purple ring-2 ring-white"
            aria-label="Resize"
          />
          {/* Rotation stick + ball — anchored to the top-centre,
              extending UP outside the rect. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 -top-6 h-6 w-px -translate-x-1/2 bg-brand-purple"
          />
          <div
            onPointerDown={(e) => beginDrag(e, "rotate")}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute left-1/2 -top-8 h-3 w-3 -translate-x-1/2 cursor-grab rounded-full bg-brand-purple ring-2 ring-white"
            aria-label="Rotate"
          />
        </>
      )}
    </div>
  );
}

function unrotateDelta(
  dx: number,
  dy: number,
  rotationDeg: number,
): { dx: number; dy: number } {
  if (!rotationDeg) return { dx, dy };
  const r = (-rotationDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { dx: dx * cos - dy * sin, dy: dx * sin + dy * cos };
}

function normalizeDeg(deg: number): number {
  let out = deg % 360;
  if (out > 180) out -= 360;
  if (out < -180) out += 360;
  return out;
}
