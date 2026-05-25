/**
 * CAD renderer — pure draw functions for the `mediaKind: "cad"`
 * canvas runtime (#930). Mirrors `drawing-engine.ts`'s separation of
 * concerns: the React stage owns pointer state, this module owns the
 * pixel pushing.
 *
 * Coordinates are model-space millimetres. The caller passes a `zoom`
 * (mm → pixel multiplier); every primitive applies it internally so
 * stroke widths scale proportionally without re-doing math at the
 * call site.
 *
 * Per the DRY rule the same functions back both the live `<CadStage>`
 * and the future SVG / PDF / DXF exporters — every surface that draws
 * a CAD shape routes through here.
 */

import type {
  CadState,
  CadShape,
  CadLine,
  CadRect,
  CadCircle,
  CadPolyline,
  CadDimension,
  CadText,
} from "@shared/cad-state";

export interface CadDrawOpts {
  /** mm-to-pixel multiplier. */
  zoom: number;
  /** Optional in-flight shape from the active tool — drawn on top of
   *  the persisted shapes so the user sees what they're authoring. */
  inFlight?: CadShape | null;
}

/** Render the full CAD state onto a 2D context. Caller is responsible
 *  for sizing the canvas to `state.widthMm × zoom × state.heightMm ×
 *  zoom`; this function clears + paints. */
export function drawCad(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  state: CadState,
  opts: CadDrawOpts,
): void {
  const { zoom } = opts;
  const pxWidth = state.widthMm * zoom;
  const pxHeight = state.heightMm * zoom;

  // White paper.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pxWidth, pxHeight);

  // Grid (when enabled).
  if (state.grid.showGrid && state.grid.visibleSpacingMm > 0) {
    paintGrid(ctx, state, zoom);
  }

  // Persisted shapes.
  for (const shape of state.shapes) {
    paintShape(ctx, shape, zoom, /* selected */ state.selectedIds.includes(shape.id));
  }

  // In-flight (in-progress tool stroke) — drawn on top with a dashed
  // visual so the user can see what they're about to commit.
  if (opts.inFlight) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    paintShape(ctx, opts.inFlight, zoom, false);
    ctx.restore();
  }
}

function paintGrid(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  state: CadState,
  zoom: number,
): void {
  const spacingPx = state.grid.visibleSpacingMm * zoom;
  if (spacingPx < 2) return; // sub-pixel grid would just blur the canvas
  const pxWidth = state.widthMm * zoom;
  const pxHeight = state.heightMm * zoom;
  ctx.save();
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= pxWidth + 0.5; x += spacingPx) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, pxHeight);
  }
  for (let y = 0; y <= pxHeight + 0.5; y += spacingPx) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(pxWidth, y + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

function paintShape(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: CadShape,
  zoom: number,
  selected: boolean,
): void {
  const color = shape.color ?? "#0f172a";
  const strokeMm = shape.strokeWidthMm ?? 0.25;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, strokeMm * zoom);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (shape.kind) {
    case "line":      paintLine(ctx, shape, zoom); break;
    case "rect":      paintRect(ctx, shape, zoom); break;
    case "circle":    paintCircle(ctx, shape, zoom); break;
    case "polyline":  paintPolyline(ctx, shape, zoom); break;
    case "dimension": paintDimension(ctx, shape, zoom); break;
    case "text":      paintText(ctx, shape, zoom); break;
  }

  // Selection overlay — magenta dashed bounding box.
  if (selected) {
    const bb = shapeBoundingBoxMm(shape);
    if (bb) {
      ctx.strokeStyle = "#c026d3";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(bb.x * zoom - 2, bb.y * zoom - 2, bb.width * zoom + 4, bb.height * zoom + 4);
    }
  }
  ctx.restore();
}

function paintLine(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, s: CadLine, zoom: number): void {
  ctx.beginPath();
  ctx.moveTo(s.x1 * zoom, s.y1 * zoom);
  ctx.lineTo(s.x2 * zoom, s.y2 * zoom);
  ctx.stroke();
}

function paintRect(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, s: CadRect, zoom: number): void {
  const x = s.x * zoom;
  const y = s.y * zoom;
  const w = s.width * zoom;
  const h = s.height * zoom;
  if (s.cornerRadius && s.cornerRadius > 0) {
    const r = Math.min(s.cornerRadius * zoom, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.stroke();
  } else {
    ctx.strokeRect(x, y, w, h);
  }
}

function paintCircle(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, s: CadCircle, zoom: number): void {
  ctx.beginPath();
  ctx.arc(s.cx * zoom, s.cy * zoom, s.radius * zoom, 0, Math.PI * 2);
  ctx.stroke();
}

function paintPolyline(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, s: CadPolyline, zoom: number): void {
  if (s.points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(s.points[0].x * zoom, s.points[0].y * zoom);
  for (let i = 1; i < s.points.length; i++) {
    ctx.lineTo(s.points[i].x * zoom, s.points[i].y * zoom);
  }
  if (s.closed) ctx.closePath();
  ctx.stroke();
}

function paintDimension(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, s: CadDimension, zoom: number): void {
  // Compute the perpendicular offset direction.
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const length = Math.hypot(dx, dy);
  if (length === 0) return;
  const nx = -dy / length;
  const ny = dx / length;
  const offX = nx * s.offsetMm;
  const offY = ny * s.offsetMm;
  // Dimension line + extension lines.
  ctx.beginPath();
  ctx.moveTo((s.x1 + offX) * zoom, (s.y1 + offY) * zoom);
  ctx.lineTo((s.x2 + offX) * zoom, (s.y2 + offY) * zoom);
  ctx.moveTo(s.x1 * zoom, s.y1 * zoom);
  ctx.lineTo((s.x1 + offX) * zoom, (s.y1 + offY) * zoom);
  ctx.moveTo(s.x2 * zoom, s.y2 * zoom);
  ctx.lineTo((s.x2 + offX) * zoom, (s.y2 + offY) * zoom);
  ctx.stroke();
  // Label.
  const label = s.label ?? `${Math.round(length * 10) / 10}mm`;
  ctx.fillStyle = ctx.strokeStyle as string;
  ctx.font = `${Math.max(10, 3 * zoom)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(label, ((s.x1 + s.x2) / 2 + offX) * zoom, ((s.y1 + s.y2) / 2 + offY) * zoom - 2);
}

function paintText(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, s: CadText, zoom: number): void {
  ctx.fillStyle = ctx.strokeStyle as string;
  ctx.font = `${Math.max(8, s.heightMm * zoom)}px sans-serif`;
  ctx.save();
  ctx.translate(s.x * zoom, s.y * zoom);
  if (s.rotation) ctx.rotate((s.rotation * Math.PI) / 180);
  ctx.fillText(s.text, 0, 0);
  ctx.restore();
}

/** Compute a shape's axis-aligned bounding box in mm. Used for the
 *  selection overlay + hit-testing. Returns null for shapes whose
 *  bounds aren't meaningfully defined (zero-length lines, empty
 *  polylines). */
export function shapeBoundingBoxMm(shape: CadShape): { x: number; y: number; width: number; height: number } | null {
  switch (shape.kind) {
    case "line": {
      const x = Math.min(shape.x1, shape.x2);
      const y = Math.min(shape.y1, shape.y2);
      return {
        x,
        y,
        width: Math.abs(shape.x2 - shape.x1),
        height: Math.abs(shape.y2 - shape.y1),
      };
    }
    case "rect":
      return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
    case "circle":
      return {
        x: shape.cx - shape.radius,
        y: shape.cy - shape.radius,
        width: shape.radius * 2,
        height: shape.radius * 2,
      };
    case "polyline": {
      if (shape.points.length === 0) return null;
      let minX = shape.points[0].x;
      let minY = shape.points[0].y;
      let maxX = shape.points[0].x;
      let maxY = shape.points[0].y;
      for (const p of shape.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    case "dimension": {
      const minX = Math.min(shape.x1, shape.x2);
      const minY = Math.min(shape.y1, shape.y2);
      return {
        x: minX,
        y: minY,
        width: Math.abs(shape.x2 - shape.x1),
        height: Math.abs(shape.y2 - shape.y1),
      };
    }
    case "text": {
      // Approximate — text size depends on font metrics. Use heightMm
      // as both width and height for a conservative bbox.
      return {
        x: shape.x,
        y: shape.y - shape.heightMm,
        width: shape.text.length * shape.heightMm * 0.6,
        height: shape.heightMm,
      };
    }
  }
}
