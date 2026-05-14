/**
 * canvas-v2 effects — render-side appliers for the widgets authored in
 * the new Studio editor (see `frontend/pages/studio/v2/`). Every v2
 * widget ends up as a single ClipEffect with a `canvas-v2:` prefix; the
 * appliers below paint the widget's content at its fractional position
 * within the canvas.
 *
 * Position contract: x, y, width, height are 0..1 fractions of the
 * canvas dimensions. Stored that way so the same widget renders the
 * same composition at any output resolution (720p preview, 4K export).
 *
 * Image / video widgets carry their media as a `url` (R2 / blob /
 * remote). To stay synchronous (per the registry contract), the
 * appliers lazy-load into a module-scoped cache. First-frame draws
 * miss the cache and paint nothing for that widget; subsequent frames
 * hit. The render strategy MUST call `preloadCanvasV2Media()` before
 * the encode loop starts so the first frame is correct.
 */

import type { Timeline } from "@shared/timeline";
import { registerEffect } from "./registry";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation in degrees, clockwise, around the rect's centre. */
  rotation: number;
}

function readRect(
  params: Record<string, unknown>,
  canvasWidth: number,
  canvasHeight: number,
): Rect {
  return {
    x: numberOr(params.x, 0) * canvasWidth,
    y: numberOr(params.y, 0) * canvasHeight,
    w: numberOr(params.width, 1) * canvasWidth,
    h: numberOr(params.height, 0.1) * canvasHeight,
    rotation: numberOr(params.rotation, 0),
  };
}

/**
 * Apply the rect's centre-origin rotation to the current ctx transform.
 * Every canvas-v2 applier brackets its draw in `ctx.save()/restore()` and
 * calls this once before drawing so the editor's CSS rotation and the
 * render-side rotation produce identical pixels (DRY — no per-applier
 * rotation math).
 */
function rotateCtxForRect(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  rect: Rect,
): void {
  if (!rect.rotation) return;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  ctx.translate(cx, cy);
  ctx.rotate((rect.rotation * Math.PI) / 180);
  ctx.translate(-cx, -cy);
}

// ───────────────────────────────────────────────────────────────────────────
// Module-scoped media cache for sourceless image/video widgets.
// ───────────────────────────────────────────────────────────────────────────

const imageCache = new Map<string, HTMLImageElement | "loading" | "failed">();
const videoCache = new Map<string, HTMLVideoElement | "loading" | "failed">();

function ensureImageLoaded(url: string): HTMLImageElement | null {
  if (!url) return null;
  const cached = imageCache.get(url);
  if (cached instanceof HTMLImageElement) return cached;
  if (cached === "loading" || cached === "failed") return null;
  imageCache.set(url, "loading");
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => imageCache.set(url, img);
  img.onerror = () => imageCache.set(url, "failed");
  img.src = url;
  return null;
}

function ensureVideoLoaded(url: string): HTMLVideoElement | null {
  if (!url) return null;
  const cached = videoCache.get(url);
  if (cached instanceof HTMLVideoElement) return cached;
  if (cached === "loading" || cached === "failed") return null;
  videoCache.set(url, "loading");
  const v = document.createElement("video");
  v.crossOrigin = "anonymous";
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.onloadedmetadata = () => videoCache.set(url, v);
  v.onerror = () => videoCache.set(url, "failed");
  v.src = url;
  return null;
}

/**
 * Pre-warm the media cache for every `canvas-v2:image` / `canvas-v2:video`
 * effect in the timeline. Called by the render strategy before the
 * encode loop so first-frame paints aren't blank.
 *
 * Returns once every referenced image/video has hit HAVE_METADATA, OR
 * a 10-second timeout elapses (whichever first). The timeout is a
 * safety valve — a render shouldn't hang indefinitely on a dead URL.
 */
export async function preloadCanvasV2Media(timeline: Timeline): Promise<void> {
  const imageUrls = new Set<string>();
  const videoUrls = new Set<string>();
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      for (const effect of clip.effects ?? []) {
        if (effect.kind === "canvas-v2:image") {
          const url = stringOr(effect.params.url, "");
          if (url) imageUrls.add(url);
        } else if (effect.kind === "canvas-v2:video") {
          const url = stringOr(effect.params.url, "");
          if (url) videoUrls.add(url);
        }
      }
    }
  }
  const tasks: Promise<unknown>[] = [];
  for (const url of imageUrls) {
    tasks.push(
      new Promise<void>((resolve) => {
        const cached = imageCache.get(url);
        if (cached instanceof HTMLImageElement) return resolve();
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          imageCache.set(url, img);
          resolve();
        };
        img.onerror = () => {
          imageCache.set(url, "failed");
          resolve();
        };
        img.src = url;
        imageCache.set(url, "loading");
      }),
    );
  }
  for (const url of videoUrls) {
    tasks.push(
      new Promise<void>((resolve) => {
        const cached = videoCache.get(url);
        if (cached instanceof HTMLVideoElement) return resolve();
        const v = document.createElement("video");
        v.crossOrigin = "anonymous";
        v.muted = true;
        v.playsInline = true;
        v.preload = "auto";
        v.onloadedmetadata = () => {
          videoCache.set(url, v);
          resolve();
        };
        v.onerror = () => {
          videoCache.set(url, "failed");
          resolve();
        };
        v.src = url;
        videoCache.set(url, "loading");
      }),
    );
  }
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 10_000));
  await Promise.race([Promise.all(tasks), timeout]);
}

// ───────────────────────────────────────────────────────────────────────────
// canvas-v2:background — fills the canvas. V1 background clips carry
// only this effect; widget clips on V2 paint on top.
// ───────────────────────────────────────────────────────────────────────────

registerEffect({
  kind: "canvas-v2:background",
  label: "Scene background",
  category: "transform",
  defaults: { color: "#0f172a" },
  paramHints: { color: { type: "color" } },
  apply(effect, { ctx, canvas }) {
    ctx.fillStyle = stringOr(effect.params.color, "#0f172a");
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  },
});

// ───────────────────────────────────────────────────────────────────────────
// canvas-v2:text — positioned text widget with optional background fill.
// ───────────────────────────────────────────────────────────────────────────

registerEffect({
  kind: "canvas-v2:text",
  label: "Text widget",
  category: "title",
  defaults: {
    x: 0,
    y: 0,
    width: 0.4,
    height: 0.15,
    text: "Text",
    fontPx: 32,
    color: "#ffffff",
    fontWeight: "normal",
    align: "left",
    background: null,
  },
  paramHints: {
    color: { type: "color" },
    align: {
      type: "select",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Centre" },
        { value: "right", label: "Right" },
      ],
    },
  },
  apply(effect, { ctx, canvas }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const { x, y, w, h } = rect;
    const text = stringOr(effect.params.text, "");
    const fontPx = numberOr(effect.params.fontPx, 32);
    const color = stringOr(effect.params.color, "#ffffff");
    const fontWeight = stringOr(effect.params.fontWeight, "normal");
    const align = stringOr(effect.params.align, "left") as "left" | "center" | "right";
    const background = effect.params.background;
    ctx.save();
    rotateCtxForRect(ctx, rect);
    if (typeof background === "string" && background) {
      ctx.fillStyle = background;
      ctx.fillRect(x, y, w, h);
    }
    ctx.fillStyle = color;
    ctx.font = `${fontWeight === "bold" ? "bold " : ""}${fontPx}px sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = align;
    const tx = align === "center" ? x + w / 2 : align === "right" ? x + w : x;
    wrapText(ctx, text, tx, y + h / 2, w, fontPx * 1.2);
    ctx.restore();
  },
});

// ───────────────────────────────────────────────────────────────────────────
// canvas-v2:image — positioned image widget. URL-backed.
// ───────────────────────────────────────────────────────────────────────────

registerEffect({
  kind: "canvas-v2:image",
  label: "Image widget",
  category: "transform",
  defaults: { x: 0, y: 0, width: 0.3, height: 0.3, url: "", fit: "cover" },
  paramHints: {
    fit: {
      type: "select",
      options: [
        { value: "cover", label: "Cover" },
        { value: "contain", label: "Contain" },
        { value: "stretch", label: "Stretch" },
      ],
    },
  },
  apply(effect, { ctx, canvas }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const { x, y, w, h } = rect;
    const url = stringOr(effect.params.url, "");
    if (!url) return;
    const img = ensureImageLoaded(url);
    if (!img) return;
    const fit = stringOr(effect.params.fit, "cover") as "cover" | "contain" | "stretch";
    ctx.save();
    rotateCtxForRect(ctx, rect);
    drawWithFit(ctx, img, x, y, w, h, fit, img.naturalWidth, img.naturalHeight);
    ctx.restore();
  },
});

// ───────────────────────────────────────────────────────────────────────────
// canvas-v2:video — positioned video widget. URL-backed. The renderer
// seeks the video to the clip's local time and snapshots the frame.
// ───────────────────────────────────────────────────────────────────────────

registerEffect({
  kind: "canvas-v2:video",
  label: "Video widget",
  category: "transform",
  defaults: { x: 0, y: 0, width: 0.5, height: 0.5, url: "", muted: false },
  apply(effect, { ctx, canvas, clipFrame, fps }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const { x, y, w, h } = rect;
    const url = stringOr(effect.params.url, "");
    if (!url) return;
    const v = ensureVideoLoaded(url);
    if (!v) return;
    const target = clipFrame / fps;
    if (v.duration && Math.abs(v.currentTime - target) > 1 / fps) {
      // Best-effort sync — full seek-on-await would block the synchronous
      // applier contract. Render strategies that need frame-accurate video
      // widgets should pre-seek via a sibling channel; for previews the
      // small drift is acceptable.
      try {
        v.currentTime = Math.min(v.duration, Math.max(0, target));
      } catch {
        // Some browsers throw before metadata fully loads — silent skip.
      }
    }
    ctx.save();
    rotateCtxForRect(ctx, rect);
    drawWithFit(ctx, v, x, y, w, h, "cover", v.videoWidth, v.videoHeight);
    ctx.restore();
  },
});

// ───────────────────────────────────────────────────────────────────────────
// canvas-v2:shape-rect / canvas-v2:shape-circle / canvas-v2:divider
// ───────────────────────────────────────────────────────────────────────────

registerEffect({
  kind: "canvas-v2:shape-rect",
  label: "Rectangle",
  category: "transform",
  defaults: {
    x: 0,
    y: 0,
    width: 0.3,
    height: 0.3,
    fill: "#0ea5e9",
    strokeColor: "#ffffff",
    strokeWidth: 0,
    cornerRadius: 8,
  },
  paramHints: {
    fill: { type: "color" },
    strokeColor: { type: "color" },
  },
  apply(effect, { ctx, canvas }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const { x, y, w, h } = rect;
    const fill = stringOr(effect.params.fill, "#0ea5e9");
    const strokeColor = stringOr(effect.params.strokeColor, "#ffffff");
    const strokeWidth = numberOr(effect.params.strokeWidth, 0);
    const r = Math.min(numberOr(effect.params.cornerRadius, 0), w / 2, h / 2);
    ctx.save();
    rotateCtxForRect(ctx, rect);
    drawRoundedRect(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (strokeWidth > 0) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
    }
    ctx.restore();
  },
});

registerEffect({
  kind: "canvas-v2:shape-circle",
  label: "Circle",
  category: "transform",
  defaults: {
    x: 0,
    y: 0,
    width: 0.25,
    height: 0.25,
    fill: "#22c55e",
    strokeColor: "#ffffff",
    strokeWidth: 0,
  },
  paramHints: {
    fill: { type: "color" },
    strokeColor: { type: "color" },
  },
  apply(effect, { ctx, canvas }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const { x, y, w, h } = rect;
    const fill = stringOr(effect.params.fill, "#22c55e");
    const strokeColor = stringOr(effect.params.strokeColor, "#ffffff");
    const strokeWidth = numberOr(effect.params.strokeWidth, 0);
    ctx.save();
    rotateCtxForRect(ctx, rect);
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (strokeWidth > 0) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
    }
    ctx.restore();
  },
});

registerEffect({
  kind: "canvas-v2:divider",
  label: "Divider",
  category: "transform",
  defaults: {
    x: 0,
    y: 0,
    width: 0.6,
    height: 0.02,
    color: "#ffffff",
    thickness: 2,
  },
  paramHints: { color: { type: "color" } },
  apply(effect, { ctx, canvas }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const { x, y, w, h } = rect;
    const color = stringOr(effect.params.color, "#ffffff");
    const thickness = numberOr(effect.params.thickness, 2);
    ctx.save();
    rotateCtxForRect(ctx, rect);
    ctx.fillStyle = color;
    ctx.fillRect(x, y + h / 2 - thickness / 2, w, thickness);
    ctx.restore();
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Helpers — shared by every applier above so width/height/fit math
// doesn't drift across effects.
// ───────────────────────────────────────────────────────────────────────────

function drawWithFit(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  fit: "cover" | "contain" | "stretch",
  sourceWidth: number,
  sourceHeight: number,
): void {
  if (!sourceWidth || !sourceHeight || fit === "stretch") {
    ctx.drawImage(source, x, y, w, h);
    return;
  }
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = w / h;
  let dw: number, dh: number, dx: number, dy: number;
  if (fit === "cover") {
    if (sourceRatio > targetRatio) {
      dh = h;
      dw = h * sourceRatio;
      dx = x + (w - dw) / 2;
      dy = y;
    } else {
      dw = w;
      dh = w / sourceRatio;
      dx = x;
      dy = y + (h - dh) / 2;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(source, dx, dy, dw, dh);
    ctx.restore();
  } else {
    if (sourceRatio > targetRatio) {
      dw = w;
      dh = w / sourceRatio;
      dx = x;
      dy = y + (h - dh) / 2;
    } else {
      dh = h;
      dw = h * sourceRatio;
      dx = x + (w - dw) / 2;
      dy = y;
    }
    ctx.drawImage(source, dx, dy, dw, dh);
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(/\s+/);
  let line = "";
  let cursorY = y;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = candidate;
    }
  }
  if (line) ctx.fillText(line, x, cursorY);
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
