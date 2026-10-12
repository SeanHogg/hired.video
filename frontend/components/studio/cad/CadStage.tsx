/**
 * CadStage — 2D vector drafting canvas runtime (`mediaKind: "cad"`,
 * per Consolidated Gap Register #930). Mounted by `<CanvasRouter
 * mediaKind/>` in StudioEditorV2 when the project is cad-kind.
 *
 * Phase 1 scaffold (this pass):
 *   - Renders the project's shapes on a single white drafting canvas
 *     with optional grid overlay.
 *   - Tools: select / pan / line / rectangle / circle. Each tool
 *     drives a focused pointer-event flow.
 *   - Coordinate system: model-space is millimetres; the canvas
 *     scales mm → screen pixels via `zoom` (CSS-equivalent of
 *     `transform: scale()` so coords stay correct at any zoom).
 *   - Snap-to-grid optional (per `CadState.grid.snapEnabled`).
 *
 * Deferred (when CAD grows past scaffold):
 *   - Layers, blocks, constraints, dimensions UI.
 *   - Arcs, splines, hatches.
 *   - Multi-selection drag, copy/paste, rotate handles.
 *   - DXF/DWG/STEP export (state-only today; export wiring rides on
 *     the cad-export module when it ships).
 *
 * Per the DRY rule the rendering math + hit-testing live in
 * `lib/studio/cad/cad-renderer.ts` (pure functions) — both the live
 * stage and any future export-to-SVG / export-to-PDF strategies read
 * from the same routines.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  type CadState,
  type CadShape,
  addShape,
  setSelection,
  makeShapeId,
} from "@shared/cad-state";
import { drawCad } from "@/lib/studio/cad/cad-renderer";
import { cn } from "@/lib/utils";

export type CadTool = "select" | "pan" | "line" | "rect" | "circle";

export interface CadStageProps {
  state: CadState;
  setState: Dispatch<SetStateAction<CadState>>;
  /** Commit handler — host's history wrapper records the change. */
  commit: (next: CadState) => void;
  zoom: number;
  tool: CadTool;
  /** Stroke color applied to newly-drawn shapes. */
  drawColor: string;
  /** Stroke width in millimetres for newly-drawn shapes. */
  drawStrokeWidthMm: number;
}

interface InFlightShape {
  kind: "line" | "rect" | "circle";
  start: { x: number; y: number };
  current: { x: number; y: number };
}

export default function CadStage({
  state,
  setState,
  commit,
  zoom,
  tool,
  drawColor,
  drawStrokeWidthMm,
}: CadStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [inFlight, setInFlight] = useState<InFlightShape | null>(null);

  // Canvas pixel dimensions — mm × zoom. We render once per frame
  // when state or in-flight shape changes.
  const pxWidth = Math.round(state.widthMm * zoom);
  const pxHeight = Math.round(state.heightMm * zoom);

  // Repaint whenever anything visible changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawCad(ctx, state, { zoom, inFlight: inFlightForRender(inFlight) });
  }, [state, zoom, inFlight, pxWidth, pxHeight]);

  // ── Pointer → model-space helpers ──────────────────────────────────────
  const screenToModel = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      // Y is flipped in CAD (origin bottom-left, y grows up) — the
      // editor convention here keeps y growing DOWN to match the
      // canvas-pixel system. The renderer's `drawCad` mirrors on
      // export.
      const screenX = (event.clientX - rect.left) * (canvas.width / rect.width);
      const screenY = (event.clientY - rect.top) * (canvas.height / rect.height);
      const mmX = screenX / zoom;
      const mmY = screenY / zoom;
      if (state.grid.snapEnabled && state.grid.snapSpacingMm > 0) {
        const snap = state.grid.snapSpacingMm;
        return {
          x: Math.round(mmX / snap) * snap,
          y: Math.round(mmY / snap) * snap,
        };
      }
      return { x: mmX, y: mmY };
    },
    [zoom, state.grid.snapEnabled, state.grid.snapSpacingMm],
  );

  // ── Tool handlers ──────────────────────────────────────────────────────
  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const point = screenToModel(event);
      if (!point) return;
      const canvas = canvasRef.current;
      canvas?.setPointerCapture(event.pointerId);
      if (tool === "select") {
        // MVP: simple hit-test the topmost shape. Future: rubber-band
        // selection box.
        const hit = hitTestTopmost(state, point);
        setState((prev) => setSelection(prev, hit ? [hit.id] : []));
        return;
      }
      if (tool === "pan") {
        // Pan is a host-level affordance (zoom + scroll) — the stage
        // doesn't manage scroll position. No-op for the MVP scaffold.
        return;
      }
      // Drawing tools — start an in-flight shape that updates on move
      // and commits on up.
      setInFlight({ kind: tool, start: point, current: point });
    },
    [tool, screenToModel, state, setState],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!inFlight) return;
      const point = screenToModel(event);
      if (!point) return;
      setInFlight({ ...inFlight, current: point });
    },
    [inFlight, screenToModel],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!inFlight) return;
      const point = screenToModel(event);
      const end = point ?? inFlight.current;
      const shape = finaliseInFlight(inFlight, end, drawColor, drawStrokeWidthMm);
      setInFlight(null);
      const canvas = canvasRef.current;
      canvas?.releasePointerCapture(event.pointerId);
      if (!shape) return;
      const next = addShape(state, shape);
      setState(next);
      commit(next);
    },
    [inFlight, screenToModel, state, setState, commit, drawColor, drawStrokeWidthMm],
  );

  const cursorClass = useMemo(() => {
    switch (tool) {
      case "select": return "cursor-default";
      case "pan":    return "cursor-grab";
      default:       return "cursor-crosshair";
    }
  }, [tool]);

  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto bg-muted p-6">
      <div className="shadow-xl" style={{ width: pxWidth, height: pxHeight }}>
        <canvas
          ref={canvasRef}
          width={pxWidth}
          height={pxHeight}
          className={cn("h-full w-full bg-card", cursorClass)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function inFlightForRender(shape: InFlightShape | null): CadShape | null {
  if (!shape) return null;
  return finaliseInFlight(shape, shape.current, "#94a3b8", 0.25);
}

function finaliseInFlight(
  shape: InFlightShape,
  end: { x: number; y: number },
  color: string,
  strokeWidthMm: number,
): CadShape | null {
  switch (shape.kind) {
    case "line": {
      // Skip zero-length lines — accidental click without drag.
      if (Math.hypot(end.x - shape.start.x, end.y - shape.start.y) < 0.5) return null;
      return {
        id: makeShapeId(),
        kind: "line",
        layer: "default",
        color,
        strokeWidthMm,
        x1: shape.start.x,
        y1: shape.start.y,
        x2: end.x,
        y2: end.y,
      };
    }
    case "rect": {
      const x = Math.min(shape.start.x, end.x);
      const y = Math.min(shape.start.y, end.y);
      const width = Math.abs(end.x - shape.start.x);
      const height = Math.abs(end.y - shape.start.y);
      if (width < 0.5 || height < 0.5) return null;
      return {
        id: makeShapeId(),
        kind: "rect",
        layer: "default",
        color,
        strokeWidthMm,
        x,
        y,
        width,
        height,
      };
    }
    case "circle": {
      const radius = Math.hypot(end.x - shape.start.x, end.y - shape.start.y);
      if (radius < 0.5) return null;
      return {
        id: makeShapeId(),
        kind: "circle",
        layer: "default",
        color,
        strokeWidthMm,
        cx: shape.start.x,
        cy: shape.start.y,
        radius,
      };
    }
  }
}

/** AABB hit-test — finds the topmost shape under a model-space point.
 *  MVP: bounding-box check for rects/circles, segment-distance for
 *  lines. Returns null for empty hit. */
function hitTestTopmost(state: CadState, point: { x: number; y: number }): CadShape | null {
  // Iterate in reverse — last-drawn shape is on top.
  for (let i = state.shapes.length - 1; i >= 0; i--) {
    const s = state.shapes[i];
    if (s.kind === "rect" && point.x >= s.x && point.x <= s.x + s.width && point.y >= s.y && point.y <= s.y + s.height) {
      return s;
    }
    if (s.kind === "circle" && Math.hypot(point.x - s.cx, point.y - s.cy) <= s.radius) {
      return s;
    }
    if (s.kind === "line") {
      // Distance from point to segment.
      const d = distancePointToSegment(point, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
      // 2mm hit tolerance.
      if (d < 2) return s;
    }
  }
  return null;
}

function distancePointToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
