/**
 * hired.video corner-watermark pill — the SAME chrome the
 * `<BrandWatermark/>` React component paints on the DOM screen
 * renderer (`<CanvasStatePreview>` → `<CanvasStage mode="playback"/>`).
 * Extracted here so the headless export encoder
 * (`renderTimelineFrame` → WebCodecs / ffmpeg.wasm) draws the IDENTICAL
 * pixel pill at frame-buffer level — no DOM in the encoder worker, so
 * the React component can't paint there. Single source of truth for the
 * pill geometry + colour stops.
 *
 * Per the standing DRY rule both the V1 scene-graph renderer
 * (`frontend/lib/renderer/frame-renderer.ts`) and the V2 timeline
 * renderer (`frontend/lib/timeline/frame-renderer.ts`) call this. The
 * branding-policy decision (show/hide for free vs Pro-opted-out) lives
 * one level up in `branding-policy.ts` — this helper just paints when
 * asked.
 */

export type WatermarkCtx =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export interface WatermarkCanvas {
  width: number;
  height: number;
}

/**
 * Paint the "hired.video" pill at the bottom-right of the canvas. Font
 * size scales with canvas width so the pill looks right at 720p, 1080p,
 * 4K, and the small editor-preview scale.
 */
export function drawWatermark(ctx: WatermarkCtx, canvas: WatermarkCanvas): void {
  const { width, height } = canvas;
  const fontSize = Math.max(11, Math.round(width / 58)); // ~22px at 1280, ~12px at 720
  const label = "hired.video";
  const padX = Math.round(fontSize * 1.1);
  const padY = Math.round(fontSize * 0.55);

  ctx.save();
  ctx.font = `bold ${fontSize}px Inter, sans-serif`;

  const textW = ctx.measureText(label).width;
  const pillW = textW + padX * 2;
  const pillH = fontSize + padY * 2;
  const margin = Math.round(width / 60);
  const x = width - pillW - margin;
  const y = height - pillH - margin;

  // Dark pill background.
  ctx.globalAlpha = 0.52;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  // roundRect is a recent addition; fall back to a manual path on old
  // engines that don't expose it. (OffscreenCanvas in workers tends to
  // have it; Safari may not.)
  if (typeof (ctx as { roundRect?: unknown }).roundRect === "function") {
    (ctx as CanvasRenderingContext2D).roundRect(x, y, pillW, pillH, pillH / 2);
  } else {
    drawRoundedPath(ctx, x, y, pillW, pillH, pillH / 2);
  }
  ctx.fill();

  // "hired" in white, ".video" in brand purple.
  ctx.globalAlpha = 0.88;
  ctx.textBaseline = "middle";
  const cx = x + pillW / 2;
  const cy = y + pillH / 2;
  const hiredW = ctx.measureText("hired").width;
  const dotVideoW = ctx.measureText(".video").width;
  const totalW = hiredW + dotVideoW;
  const startX = cx - totalW / 2;

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.fillText("hired", startX, cy);
  ctx.fillStyle = "#a78bfa"; // brand purple
  ctx.fillText(".video", startX + hiredW, cy);

  ctx.restore();
}

function drawRoundedPath(
  ctx: WatermarkCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
