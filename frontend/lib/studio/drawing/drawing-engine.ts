/**
 * Drawing engine — pure functions that mutate offscreen canvases.
 * Kept separate from the React component so the imperative pixel
 * pushing can be unit-tested + reused (e.g. by future filters or by
 * the export pipeline). The React layer (DrawingStage) is the only
 * place useState / useRef / pointer events live.
 *
 * Design constraint: every function in this file is side-effect-local
 * (writes only to the canvas passed in). No DOM queries, no shared
 * module state. That makes them safe to call from any tool handler
 * without worrying about render order.
 */

import type { BrushSettings, CanvasPoint } from "./drawing-types.js";
import {
  hexToRgbaString,
  parseHexToRgba,
  rgbToHex as rgbToHexShared,
  rgbaWithinTolerance,
} from "@/lib/utils/color";
import { containRect } from "@/lib/utils/image-fit";

/** Lerp a soft-brush dab onto the canvas at `point`. Used for both
 *  brush (source-over) and eraser (destination-out — caller sets the
 *  globalCompositeOperation before calling). Pressure scales the
 *  dab's effective radius so light strokes thin out at the ends. */
export function stampBrushDab(
  ctx: CanvasRenderingContext2D,
  brush: BrushSettings,
  point: CanvasPoint,
): void {
  const effectiveSize = brush.size * (0.5 + point.pressure * 0.5);
  const radius = effectiveSize / 2;
  // Radial gradient gives the soft-brush falloff. Hardness 1 = solid
  // dot (no falloff); hardness 0 = full radial gradient.
  const innerStop = Math.max(0, Math.min(1, brush.hardness));
  const gradient = ctx.createRadialGradient(
    point.x,
    point.y,
    radius * innerStop,
    point.x,
    point.y,
    radius,
  );
  gradient.addColorStop(0, brush.color);
  gradient.addColorStop(1, hexToRgbaString(brush.color, 0));
  ctx.fillStyle = gradient;
  ctx.globalAlpha = brush.opacity;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** Stamp dabs between `from` and `to` at `spacing * size` intervals so
 *  a fast pointer drag still produces a continuous stroke. Photoshop
 *  uses 25% spacing as its default; we match that. */
export function strokeBetween(
  ctx: CanvasRenderingContext2D,
  brush: BrushSettings,
  from: CanvasPoint,
  to: CanvasPoint,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const spacing = brush.size * 0.25;
  const stepCount = Math.max(1, Math.ceil(distance / spacing));
  for (let i = 0; i <= stepCount; i++) {
    const t = i / stepCount;
    const point: CanvasPoint = {
      x: from.x + dx * t,
      y: from.y + dy * t,
      pressure: from.pressure + (to.pressure - from.pressure) * t,
    };
    stampBrushDab(ctx, brush, point);
  }
}

/** Flood-fill the active layer at `(x, y)` with `color`. Stack-based
 *  scanline fill — handles large connected regions without recursion
 *  blowing the stack. Tolerance is fixed at 16/255 per channel: tight
 *  enough not to leak across visible boundaries, loose enough to fill
 *  through anti-aliased edges so the result looks clean. */
export function floodFillAt(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  startX: number,
  startY: number,
  color: string,
): void {
  const x = Math.floor(startX);
  const y = Math.floor(startY);
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const img = ctx.getImageData(0, 0, width, height);
  const px = img.data;
  const offset = (y * width + x) * 4;
  const target: [number, number, number, number] = [
    px[offset],
    px[offset + 1],
    px[offset + 2],
    px[offset + 3],
  ];
  const fill = parseHexToRgba(color);
  if (rgbaWithinTolerance(target, fill, 0)) return; // already filled
  const tolerance = 16;
  const stack: Array<[number, number]> = [[x, y]];
  while (stack.length > 0) {
    const popped = stack.pop();
    if (!popped) break;
    const [cx, cy] = popped;
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
    const i = (cy * width + cx) * 4;
    const current: [number, number, number, number] = [
      px[i],
      px[i + 1],
      px[i + 2],
      px[i + 3],
    ];
    if (!rgbaWithinTolerance(current, target, tolerance)) continue;
    if (rgbaWithinTolerance(current, fill, 0)) continue;
    px[i] = fill[0];
    px[i + 1] = fill[1];
    px[i + 2] = fill[2];
    px[i + 3] = fill[3];
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  ctx.putImageData(img, 0, 0);
}

/** Read the pixel at `(x, y)` and return it as a `#rrggbb` string.
 *  Used by the eyedropper tool. Alpha is dropped — the picker's job
 *  is to capture a color, not an opacity. */
export function pickColorAt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): string {
  const ix = Math.max(0, Math.floor(x));
  const iy = Math.max(0, Math.floor(y));
  const pixel = ctx.getImageData(ix, iy, 1, 1).data;
  return rgbToHexShared(pixel[0], pixel[1], pixel[2]);
}

// ─── canvas / layer composition ─────────────────────────────────────────────

/** Build a blank offscreen canvas of the given dimensions. Used per
 *  layer — each layer owns one offscreen canvas the brush writes to. */
export function createOffscreenCanvas(
  width: number,
  height: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

/** Hydrate an offscreen canvas from a stored dataURL. Returns a
 *  Promise that resolves once the image has loaded into the canvas. */
export async function hydrateLayerCanvas(
  canvas: HTMLCanvasElement,
  pixelsDataUrl: string | null,
): Promise<void> {
  if (!pixelsDataUrl) return;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load layer pixels"));
    img.src = pixelsDataUrl;
  });
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
}

/** Render a vector layer's shape list onto its offscreen canvas
 *  (#940 Phase 2). Pure — clears the canvas first then walks
 *  `shapes` in order. Caller resolves the canvas to the project's
 *  dimensions; shapes are in canvas-local pixel coordinates. */
export function hydrateVectorLayer(
  canvas: HTMLCanvasElement,
  shapes: ReadonlyArray<{
    id: string;
    kind: "rect" | "ellipse" | "line" | "path";
    [key: string]: unknown;
  }>,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const shape of shapes) {
    ctx.save();
    if (shape.kind === "rect") {
      const s = shape as unknown as {
        x: number; y: number; width: number; height: number;
        fill?: string; stroke?: string; strokeWidth?: number; cornerRadius?: number;
      };
      const radius = s.cornerRadius ?? 0;
      ctx.beginPath();
      if (radius > 0 && (ctx as CanvasRenderingContext2D & { roundRect?: Function }).roundRect) {
        (ctx as CanvasRenderingContext2D & { roundRect: Function }).roundRect(s.x, s.y, s.width, s.height, radius);
      } else {
        ctx.rect(s.x, s.y, s.width, s.height);
      }
      if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(); }
      if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.strokeWidth ?? 1; ctx.stroke(); }
    } else if (shape.kind === "ellipse") {
      const s = shape as unknown as {
        cx: number; cy: number; rx: number; ry: number;
        fill?: string; stroke?: string; strokeWidth?: number;
      };
      ctx.beginPath();
      ctx.ellipse(s.cx, s.cy, s.rx, s.ry, 0, 0, Math.PI * 2);
      if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(); }
      if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.strokeWidth ?? 1; ctx.stroke(); }
    } else if (shape.kind === "line") {
      const s = shape as unknown as {
        x1: number; y1: number; x2: number; y2: number;
        stroke?: string; strokeWidth?: number;
      };
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.strokeStyle = s.stroke ?? "#000000";
      ctx.lineWidth = s.strokeWidth ?? 1;
      ctx.stroke();
    } else if (shape.kind === "path") {
      const s = shape as unknown as {
        d: string; fill?: string; stroke?: string; strokeWidth?: number;
      };
      const p = new Path2D(s.d);
      if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(p); }
      if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.strokeWidth ?? 1; ctx.stroke(p); }
    }
    ctx.restore();
  }
}

/** Render a text layer's content onto its offscreen canvas (#940
 *  Phase 2). Pure — clears first, then `fillText` at the configured
 *  baseline anchor. Multi-line + rich text are follow-ons. */
export function hydrateTextLayer(
  canvas: HTMLCanvasElement,
  text: {
    text: string;
    fontFamily: string;
    fontSize: number;
    color: string;
    x: number;
    y: number;
    bold?: boolean;
    italic?: boolean;
  },
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const weight = text.bold ? "bold" : "normal";
  const style = text.italic ? "italic" : "normal";
  ctx.font = `${style} ${weight} ${text.fontSize}px ${text.fontFamily}`;
  ctx.fillStyle = text.color;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text.text, text.x, text.y);
}

/** Composite the background + all visible layers onto `dest`. Caller
 *  supplies the per-layer offscreen canvases keyed by layer id; the
 *  function reads layer order, opacity, visibility, transformOffset,
 *  transformScale, and transformRotation from `state`. The transform
 *  pivot is the layer's bounding-box CENTRE (matches V2 Video's widget
 *  rotation pivot — `transformOrigin: center`). */
export function compositeLayers(
  dest: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: { kind: "transparent" } | { kind: "color"; color: string },
  layers: ReadonlyArray<{
    id: string;
    visible: boolean;
    opacity: number;
    blendMode: GlobalCompositeOperation | string;
    transformOffset?: { x: number; y: number };
    transformScale?: { x: number; y: number };
    transformRotation?: number;
    filters?: {
      blur?: number;
      brightness?: number;
      contrast?: number;
      saturate?: number;
      hueRotate?: number;
      grayscale?: number;
      invert?: number;
    };
  }>,
  layerCanvases: ReadonlyMap<string, HTMLCanvasElement>,
): void {
  dest.save();
  dest.globalCompositeOperation = "source-over";
  dest.globalAlpha = 1;
  if (background.kind === "color") {
    dest.fillStyle = background.color;
    dest.fillRect(0, 0, width, height);
  } else {
    dest.clearRect(0, 0, width, height);
  }
  for (const layer of layers) {
    if (!layer.visible) continue;
    const layerCanvas = layerCanvases.get(layer.id);
    if (!layerCanvas) continue;
    dest.globalAlpha = layer.opacity;
    // Per-layer blend mode (#940 — Image Phase 2). The Canvas-2D
    // `globalCompositeOperation` enum natively supports every blend
    // mode declared on `ImageLayer.blendMode`, so the mapping is a
    // straight pass-through except for "normal" which Canvas spells
    // as "source-over". Falls back to "source-over" for unknown
    // values so a future blend-mode addition doesn't crash the
    // compositor before its enum entry lands here.
    dest.globalCompositeOperation = canvasBlendOperation(layer.blendMode);
    // Per-layer filter chain (#940 Image Phase 2 — Photoshop "Smart
    // Filter" equivalent). Identity = empty string so layers without
    // filters cost nothing. ctx.filter applies INSIDE the blend +
    // opacity pass.
    const filterStr = layerFiltersToCss(layer.filters);
    dest.filter = filterStr;
    const offsetX = layer.transformOffset?.x ?? 0;
    const offsetY = layer.transformOffset?.y ?? 0;
    const scaleX = layer.transformScale?.x ?? 1;
    const scaleY = layer.transformScale?.y ?? 1;
    const rotation = layer.transformRotation ?? 0;
    const hasNonIdentity =
      offsetX !== 0 || offsetY !== 0 || scaleX !== 1 || scaleY !== 1 || rotation !== 0;
    if (!hasNonIdentity) {
      dest.drawImage(layerCanvas, 0, 0);
      // Reset filter for the next layer's pass — leaving it set
      // would compound effects across layers.
      dest.filter = "none";
      continue;
    }
    // Pivot at the layer canvas's centre so rotation + scale feel
    // natural (matches V2 Video's `transformOrigin: center`).
    const cx = width / 2;
    const cy = height / 2;
    dest.save();
    dest.translate(cx + offsetX, cy + offsetY);
    if (rotation !== 0) dest.rotate((rotation * Math.PI) / 180);
    if (scaleX !== 1 || scaleY !== 1) dest.scale(scaleX, scaleY);
    dest.drawImage(layerCanvas, -cx, -cy);
    dest.restore();
    dest.filter = "none";
  }
  dest.restore();
}

/** Clear a rectangular region of pixels on an offscreen canvas. Used
 *  by the marquee tool's "Delete" action — clears the active layer's
 *  pixels inside the user-drawn rect. Coordinates are layer-local
 *  (matching the offscreen canvas's natural frame). */
export function clearRectOnLayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (width <= 0 || height <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.clearRect(x, y, width, height);
  ctx.restore();
}

/** Fill a rectangular region on an offscreen canvas with a solid
 *  color. Used by the marquee tool's "Fill" action — fills the active
 *  layer's selected rect with the active brush color. */
export function fillRectOnLayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  if (width <= 0 || height <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

// ─── Generic selection model (rect / path / mask) ──────────────────────────
//
// Every selection tool (marquee / lasso / magic-wand / quick-select)
// emits one of these. The Delete + Fill action chips consume any
// variant via the dispatch helpers below, so adding a future tool
// (polygonal lasso, elliptical marquee, …) means one new emitter +
// zero changes to the action chips (per DRY).

export type MarqueeSelection =
  | { kind: "rect"; x: number; y: number; width: number; height: number }
  | { kind: "path"; points: ReadonlyArray<{ x: number; y: number }> }
  | { kind: "mask"; mask: ImageData };

/** Rasterise a closed polygon (lasso output) to a 1-channel alpha
 *  mask sized to the canvas. Used when the host needs the mask form
 *  (e.g. for AI inpaint compositing); the cheap pixel-only ops below
 *  can also consume the polygon directly via ctx.clip. */
export function rasterizePathToMask(
  width: number,
  height: number,
  points: ReadonlyArray<{ x: number; y: number }>,
): ImageData {
  const canvas = createOffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("rasterizePathToMask: 2D context unavailable");
  if (points.length < 3) return ctx.getImageData(0, 0, width, height);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  return ctx.getImageData(0, 0, width, height);
}

/** Magic-wand: tolerance-based flood-fill on the source canvas
 *  starting at `(startX, startY)`. Returns a canvas-sized mask where
 *  alpha=255 means "in the selection" and 0 means "outside". The
 *  source is typically the COMPOSITE visible canvas (so the wand
 *  selects what the user can see, not the active layer's hidden
 *  pixels). Stack-based scanline so a 4096² fill doesn't blow the
 *  stack. */
export function magicWandMask(
  source: CanvasRenderingContext2D,
  width: number,
  height: number,
  startX: number,
  startY: number,
  tolerance = 24,
): ImageData {
  const x = Math.floor(startX);
  const y = Math.floor(startY);
  const empty = (): ImageData => {
    const c = createOffscreenCanvas(width, height);
    return c.getContext("2d")!.getImageData(0, 0, width, height);
  };
  if (x < 0 || y < 0 || x >= width || y >= height) return empty();
  const src = source.getImageData(0, 0, width, height).data;
  const mask = empty();
  const m = mask.data;
  const idx = (cx: number, cy: number) => (cy * width + cx) * 4;
  const startI = idx(x, y);
  const target: [number, number, number, number] = [
    src[startI],
    src[startI + 1],
    src[startI + 2],
    src[startI + 3],
  ];
  const stack: Array<[number, number]> = [[x, y]];
  while (stack.length > 0) {
    const popped = stack.pop();
    if (!popped) break;
    const [cx, cy] = popped;
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
    const i = idx(cx, cy);
    if (m[i + 3] === 255) continue; // already in mask
    const px: [number, number, number, number] = [src[i], src[i + 1], src[i + 2], src[i + 3]];
    if (
      Math.abs(px[0] - target[0]) > tolerance ||
      Math.abs(px[1] - target[1]) > tolerance ||
      Math.abs(px[2] - target[2]) > tolerance ||
      Math.abs(px[3] - target[3]) > tolerance
    ) {
      continue;
    }
    m[i] = 255;
    m[i + 1] = 255;
    m[i + 2] = 255;
    m[i + 3] = 255;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return mask;
}

/** Quick-select grow — add a flood-filled region (centred at the
 *  pointer) to an existing mask. Each brush dab accumulates; the
 *  caller passes the prior mask + the new sample point. Returns a
 *  fresh ImageData (mutation-safe). */
export function quickSelectAccumulate(
  source: CanvasRenderingContext2D,
  width: number,
  height: number,
  startX: number,
  startY: number,
  tolerance: number,
  prior: ImageData | null,
): ImageData {
  const dab = magicWandMask(source, width, height, startX, startY, tolerance);
  if (!prior) return dab;
  const combined = new ImageData(width, height);
  const out = combined.data;
  const a = prior.data;
  const b = dab.data;
  for (let i = 0; i < out.length; i += 4) {
    const mark = Math.max(a[i + 3], b[i + 3]) === 255;
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = mark ? 255 : 0;
  }
  return combined;
}

/** Dispatch Delete on the active layer for any selection shape. The
 *  rect form uses the fast `clearRect` path; path + mask forms apply
 *  the selection as a clip / globalCompositeOperation respectively. */
export function clearSelectionOnLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  selection: MarqueeSelection,
): void {
  if (selection.kind === "rect") {
    clearRectOnLayer(ctx, selection.x, selection.y, selection.width, selection.height);
    return;
  }
  if (selection.kind === "path") {
    if (selection.points.length < 3) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(selection.points[0].x, selection.points[0].y);
    for (let i = 1; i < selection.points.length; i++) {
      ctx.lineTo(selection.points[i].x, selection.points[i].y);
    }
    ctx.closePath();
    ctx.clip();
    ctx.clearRect(0, 0, width, height);
    ctx.restore();
    return;
  }
  // Mask form — `destination-out` with the mask as the source erases
  // every pixel where the mask has alpha.
  const maskCanvas = createOffscreenCanvas(width, height);
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return;
  maskCtx.putImageData(selection.mask, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.restore();
}

/** Dispatch Fill on the active layer for any selection shape. The
 *  rect form uses `fillRect`; path + mask forms paint a solid fill
 *  clipped to the selection. */
export function fillSelectionOnLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  selection: MarqueeSelection,
  color: string,
): void {
  if (selection.kind === "rect") {
    fillRectOnLayer(ctx, selection.x, selection.y, selection.width, selection.height, color);
    return;
  }
  if (selection.kind === "path") {
    if (selection.points.length < 3) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(selection.points[0].x, selection.points[0].y);
    for (let i = 1; i < selection.points.length; i++) {
      ctx.lineTo(selection.points[i].x, selection.points[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    return;
  }
  // Mask form — clip to the mask + flood-fill the canvas.
  const maskCanvas = createOffscreenCanvas(width, height);
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return;
  // Render the mask as a solid-color silhouette in `color`, then blit
  // onto the layer using source-over. Simpler than clip-region work.
  maskCtx.putImageData(selection.mask, 0, 0);
  maskCtx.globalCompositeOperation = "source-in";
  maskCtx.fillStyle = color;
  maskCtx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.restore();
}

/** Composite an image blob INSIDE a selection — used by AI inpaint
 *  (#1103) when a marquee is active. The active layer's pixels are
 *  preserved outside the selection; the AI-generated image fills the
 *  selected region only. Returns the mutated layer canvas (caller
 *  passes the layer's offscreen canvas as `dest`). */
export function compositeImageIntoSelection(
  dest: CanvasRenderingContext2D,
  width: number,
  height: number,
  source: HTMLCanvasElement | HTMLImageElement,
  selection: MarqueeSelection,
): void {
  // Step 1: clear the selected region on the layer so we don't blend
  // the new pixels with what was there.
  clearSelectionOnLayer(dest, width, height, selection);
  // Step 2: build a clipped copy of the source the same shape as the
  // selection, then blit onto the layer.
  const clipped = createOffscreenCanvas(width, height);
  const cctx = clipped.getContext("2d");
  if (!cctx) return;
  if (selection.kind === "rect") {
    cctx.drawImage(source, 0, 0, width, height);
    // Keep only the rect region.
    cctx.globalCompositeOperation = "destination-in";
    cctx.fillStyle = "#000";
    cctx.fillRect(selection.x, selection.y, selection.width, selection.height);
  } else if (selection.kind === "path") {
    if (selection.points.length < 3) return;
    cctx.beginPath();
    cctx.moveTo(selection.points[0].x, selection.points[0].y);
    for (let i = 1; i < selection.points.length; i++) {
      cctx.lineTo(selection.points[i].x, selection.points[i].y);
    }
    cctx.closePath();
    cctx.save();
    cctx.clip();
    cctx.drawImage(source, 0, 0, width, height);
    cctx.restore();
  } else {
    cctx.drawImage(source, 0, 0, width, height);
    cctx.globalCompositeOperation = "destination-in";
    const maskCanvas = createOffscreenCanvas(width, height);
    maskCanvas.getContext("2d")?.putImageData(selection.mask, 0, 0);
    cctx.drawImage(maskCanvas, 0, 0);
  }
  dest.save();
  dest.globalCompositeOperation = "source-over";
  dest.drawImage(clipped, 0, 0);
  dest.restore();
}

/** Compute the tightest bbox of non-transparent pixels on a layer
 *  canvas. Returns null when the layer is entirely transparent. Used
 *  by the Hand-tool selection chrome (#1104) to draw the dashed
 *  bounding box around the active layer's content + by the
 *  TransformHandles primitive to know what region to surround. */
export function getLayerContentBbox(
  canvas: HTMLCanvasElement,
): { x: number; y: number; width: number; height: number } | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a !== 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Letterbox-fit the supplied blob onto a fresh canvas of the given
 *  dimensions + return as a PNG dataURL. Centres the source; preserves
 *  its aspect ratio. Used by the AI-prompt panel after generation —
 *  the generated image lands as a new layer sized to the project.
 *  Per the DRY rule the letterbox math comes from
 *  [`lib/utils/image-fit#containRect`](../utils/image-fit.ts) — same
 *  helper the headshot compositor + future filter pipeline share. */
export async function drawBlobToCanvasFit(
  blob: Blob,
  width: number,
  height: number,
): Promise<string> {
  const img = new Image();
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to decode generated image"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
  const canvas = createOffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  const fit = containRect(img.naturalWidth, img.naturalHeight, width, height);
  ctx.drawImage(img, fit.dx, fit.dy, fit.dw, fit.dh);
  return canvas.toDataURL("image/png");
}

/** Flatten the current visible composite into a PNG Blob. Used by the
 *  "Export PNG" toolbar action AND the "Save to library" upload path
 *  — DRY single source so both surfaces produce the same artifact. */
export function flattenCanvasToBlob(
  canvas: HTMLCanvasElement,
  mime: "image/png" | "image/jpeg" | "image/webp" = "image/png",
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob produced no result"))),
      mime,
    );
  });
}

/** Serialize a layer canvas to a PNG dataURL for round-tripping
 *  through `ImageState`. Returns null when the canvas is empty (no
 *  non-zero pixels) so untouched layers don't bloat the JSONB. */
export function serializeLayer(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  // Cheap "is empty" probe — sample every 64th pixel for any nonzero
  // alpha. A purely-transparent layer round-trips as null which saves
  // ~50KB per blank layer in the JSONB row.
  let hasContent = false;
  for (let i = 3; i < px.length; i += 256) {
    if (px[i] !== 0) {
      hasContent = true;
      break;
    }
  }
  if (!hasContent) return null;
  return canvas.toDataURL("image/png");
}

/** Map an `ImageLayer.blendMode` value to a Canvas-2D
 *  `globalCompositeOperation`. Every mode declared on `ImageLayer`
 *  (per `shared/image-state.ts`) maps 1:1 to a native Canvas2D
 *  operation; the only rename is `normal` → `source-over` (the spec
 *  default).
 *
 *  Single SoT — both the live editor compositor (`compositeLayers`
 *  above) and any future export path (flatten-to-PNG, PSD writer)
 *  call through this so a layer's blend mode renders identically
 *  everywhere. Closes #940's blend-mode half. */
/** Translate a `LayerFilters` shape to the CSS / Canvas-2D `filter`
 *  string the compositor applies. Returns `"none"` when no filter
 *  knobs are non-identity — single SoT for the per-layer filter chain
 *  (#940 Image Phase 2). Both the live editor compositor + future
 *  export-to-PNG path call through this.
 *
 *  Order of operations matches the CSS spec — when multiple filter
 *  primitives are supplied, they apply LEFT TO RIGHT, so the order
 *  here is the canonical sequence. */
export function layerFiltersToCss(
  filters:
    | {
        blur?: number;
        brightness?: number;
        contrast?: number;
        saturate?: number;
        hueRotate?: number;
        grayscale?: number;
        invert?: number;
      }
    | undefined,
): string {
  if (!filters) return "none";
  const parts: string[] = [];
  if (filters.blur && filters.blur > 0) parts.push(`blur(${filters.blur}px)`);
  if (filters.brightness !== undefined && filters.brightness !== 1) {
    parts.push(`brightness(${filters.brightness})`);
  }
  if (filters.contrast !== undefined && filters.contrast !== 1) {
    parts.push(`contrast(${filters.contrast})`);
  }
  if (filters.saturate !== undefined && filters.saturate !== 1) {
    parts.push(`saturate(${filters.saturate})`);
  }
  if (filters.hueRotate && filters.hueRotate !== 0) {
    parts.push(`hue-rotate(${filters.hueRotate}deg)`);
  }
  if (filters.grayscale && filters.grayscale > 0) {
    parts.push(`grayscale(${filters.grayscale})`);
  }
  if (filters.invert && filters.invert > 0) {
    parts.push(`invert(${filters.invert})`);
  }
  return parts.length === 0 ? "none" : parts.join(" ");
}

export function canvasBlendOperation(blendMode: string): GlobalCompositeOperation {
  switch (blendMode) {
    case "normal":      return "source-over";
    case "multiply":    return "multiply";
    case "screen":      return "screen";
    case "overlay":     return "overlay";
    case "darken":      return "darken";
    case "lighten":     return "lighten";
    case "color-dodge": return "color-dodge";
    case "color-burn":  return "color-burn";
    case "soft-light":  return "soft-light";
    case "hard-light":  return "hard-light";
    case "difference":  return "difference";
    case "exclusion":   return "exclusion";
    default:            return "source-over";
  }
}
