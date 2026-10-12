/**
 * Canvas-2D side of the widget frame (#2312): applies a `ResolvedFrame` to
 * a context before a widget body paints into `frame.content`. The DOM twin
 * is frame-css.ts; both read the same resolved numbers.
 *
 * Order matches the DOM's CSS transform list: animate output (translate,
 * then scale around the box centre) BEFORE the authored rotation, then the
 * CSS-equivalent effects, then the container chrome under the content with
 * the content clipped to its rounded inner box. Caller brackets with
 * `ctx.save()` / `ctx.restore()`.
 */
import type { Box, ResolvedFrame } from "./frame";

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Rounded-rect path with circular corners (CSS `border-radius` geometry). */
export function roundedRectPath(ctx: Ctx2D, b: Box, radius: number): void {
  const r = Math.max(0, Math.min(radius, b.w / 2, b.h / 2));
  ctx.beginPath();
  ctx.moveTo(b.x + r, b.y);
  ctx.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + b.h, r);
  ctx.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, r);
  ctx.arcTo(b.x, b.y + b.h, b.x, b.y, r);
  ctx.arcTo(b.x, b.y, b.x + b.w, b.y, r);
  ctx.closePath();
}

function paintChrome(ctx: Ctx2D, frame: ResolvedFrame): void {
  const style = frame.input.chrome;
  if (!style) return;
  const { box, content, borderWidth: bw } = frame;
  const radius = style.borderRadius ?? 0;
  if (style.backgroundColor) {
    roundedRectPath(ctx, box, radius);
    ctx.fillStyle = style.backgroundColor;
    ctx.fill();
  }
  if (bw > 0 && style.borderColor) {
    const half = bw / 2;
    roundedRectPath(ctx, { x: box.x + half, y: box.y + half, w: box.w - bw, h: box.h - bw }, Math.max(0, radius - half));
    ctx.lineWidth = bw;
    ctx.strokeStyle = style.borderColor;
    ctx.stroke();
  }
  if (radius > 0) {
    roundedRectPath(ctx, content, Math.max(0, radius - (style.padding ?? 0) - bw));
    ctx.clip();
  }
}

export function applyFrameToCtx(ctx: Ctx2D, frame: ResolvedFrame): void {
  const { box, animate } = frame;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  // Animate translations are fractions of the WHOLE widget box (CSS % on
  // the DOM's outer div).
  if (animate.tx !== 0 || animate.ty !== 0) ctx.translate(animate.tx * box.w, animate.ty * box.h);
  if (animate.scale !== 1) {
    ctx.translate(cx, cy);
    ctx.scale(animate.scale, animate.scale);
    ctx.translate(-cx, -cy);
  }
  if (frame.input.rotation) {
    ctx.translate(cx, cy);
    ctx.rotate((frame.input.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  const alpha = animate.alpha * frame.opacity;
  if (alpha < 1) ctx.globalAlpha *= alpha;
  if (frame.blendMode) ctx.globalCompositeOperation = frame.blendMode;
  const blurs: string[] = [];
  for (const f of frame.filters) {
    if (f.kind === "blur") blurs.push(`blur(${f.px}px)`);
    else {
      ctx.shadowBlur = f.radius;
      ctx.shadowColor = `rgba(255,255,255,${f.alpha.toFixed(2)})`;
    }
  }
  if (blurs.length > 0) ctx.filter = blurs.join(" ");
  paintChrome(ctx, frame);
}
