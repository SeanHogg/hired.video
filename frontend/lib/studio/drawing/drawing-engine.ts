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

/** Composite the background + all visible layers onto `dest`. Caller
 *  supplies the per-layer offscreen canvases keyed by layer id; the
 *  function reads layer order, opacity, visibility, and transformOffset
 *  from `state`. */
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
    // MVP only supports `normal` blend — the field is on ImageLayer so
    // a future picker can flip it without state-shape migration.
    dest.globalCompositeOperation = "source-over";
    const offsetX = layer.transformOffset?.x ?? 0;
    const offsetY = layer.transformOffset?.y ?? 0;
    dest.drawImage(layerCanvas, offsetX, offsetY);
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
