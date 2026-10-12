/**
 * Canvas2D interpreter for a widget drawing (#2312) — the export half of
 * every plugin. The DOM half is components/studio/widgets/WidgetDrawingView;
 * both read the same ops (draw-ops.ts), so a geometry rule lives in exactly
 * one place: the plugin that emitted the op.
 *
 * Media is resolved through `PaintMedia`: the export passes its preloaded
 * cache (lib/timeline/effects/widget-plugins.ts), so this stays synchronous.
 */
import type { Box } from "./frame";
import { roundedRectPath, type Ctx2D } from "./frame-canvas";
import { fitRect, type DrawOp, type PathCmd, type Stroke } from "./draw-ops";
import { fontShorthand, textBaselineOffset } from "./text-layout";

/** The drawable surface of a loaded image / video. */
export type PaintableImage = CanvasImageSource & { naturalWidth: number; naturalHeight: number };
export type PaintableVideo = CanvasImageSource & { videoWidth: number; videoHeight: number };

export interface PaintMedia {
  image(url: string): PaintableImage | null;
  /** The video seeked to the clip-local time, or null while it loads. */
  video(url: string): PaintableVideo | null;
}

export const NO_MEDIA: PaintMedia = { image: () => null, video: () => null };

function tracePath(ctx: Ctx2D, d: ReadonlyArray<PathCmd>): void {
  ctx.beginPath();
  for (const c of d) {
    if (c[0] === "M") ctx.moveTo(c[1], c[2]);
    else if (c[0] === "L") ctx.lineTo(c[1], c[2]);
    else if (c[0] === "C") ctx.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
    else ctx.closePath();
  }
}

function ellipsePath(ctx: Ctx2D, b: Box): void {
  ctx.beginPath();
  ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
}

function fillAndStroke(ctx: Ctx2D, fill: string | undefined, stroke: Stroke | undefined): void {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke && stroke.width > 0) {
    ctx.lineWidth = stroke.width;
    ctx.strokeStyle = stroke.color;
    ctx.lineJoin = "round";
    if (stroke.dash) ctx.setLineDash(stroke.dash);
    ctx.stroke();
    if (stroke.dash) ctx.setLineDash([]);
  }
}

/** Canvas text-spacing state the SVG side pins with `TEXT_RESET_STYLE`;
 *  feature-detected because older engines lack the properties. */
function resetTextSpacing(ctx: Ctx2D): void {
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  if ("wordSpacing" in ctx) ctx.wordSpacing = "0px";
  if ("fontKerning" in ctx) ctx.fontKerning = "normal";
}

function paintMedia(ctx: Ctx2D, op: Extract<DrawOp, { op: "media" }>, media: PaintMedia): void {
  let el: CanvasImageSource;
  let srcW: number;
  let srcH: number;
  if (op.media === "image") {
    const img = media.image(op.url);
    if (!img) return;
    [el, srcW, srcH] = [img, img.naturalWidth, img.naturalHeight];
  } else {
    const video = media.video(op.url);
    if (!video) return;
    [el, srcW, srcH] = [video, video.videoWidth, video.videoHeight];
  }
  const dest = fitRect(op.box, op.fit, srcW, srcH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(op.box.x, op.box.y, op.box.w, op.box.h);
  ctx.clip();
  if (op.filter) {
    // Compose with any blur the frame already set.
    ctx.filter = ctx.filter && ctx.filter !== "none" ? `${ctx.filter} ${op.filter}` : op.filter;
  }
  if (op.mirror) {
    const cx = op.box.x + op.box.w / 2;
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-cx, 0);
  }
  ctx.drawImage(el, dest.x, dest.y, dest.w, dest.h);
  ctx.restore();
}

function paintOp(ctx: Ctx2D, op: DrawOp, media: PaintMedia): void {
  switch (op.op) {
    case "rect":
      roundedRectPath(ctx, op.box, op.radius ?? 0);
      fillAndStroke(ctx, op.fill, op.stroke);
      return;
    case "ellipse":
      ellipsePath(ctx, op.box);
      fillAndStroke(ctx, op.fill, op.stroke);
      return;
    case "path":
      tracePath(ctx, op.d);
      fillAndStroke(ctx, op.fill, op.stroke);
      return;
    case "text":
      ctx.font = fontShorthand(op.font);
      ctx.fillStyle = op.color;
      ctx.textAlign = op.align;
      // The DOM's SVG text sits on the same alphabetic baseline, with the
      // same spacing / kerning (text-layout `TEXT_RESET_STYLE`).
      ctx.textBaseline = "alphabetic";
      resetTextSpacing(ctx);
      ctx.fillText(op.text, op.x, op.y + textBaselineOffset(op.font));
      return;
    case "media":
      paintMedia(ctx, op, media);
      return;
    case "raster":
      ctx.save();
      ctx.beginPath();
      ctx.rect(op.box.x, op.box.y, op.box.w, op.box.h);
      ctx.clip();
      op.paint(ctx, op.box);
      ctx.restore();
      return;
    case "embed":
      paintOps(ctx, op.fallback, media);
      return;
  }
}

/** Paint a drawing. Editor-only hints are skipped: the export is playback. */
export function paintOps(ctx: Ctx2D, ops: ReadonlyArray<DrawOp>, media: PaintMedia): void {
  for (const op of ops) {
    if (op.editorOnly) continue;
    const alpha = op.alpha ?? 1;
    if (alpha < 1) {
      ctx.save();
      ctx.globalAlpha *= alpha;
      paintOp(ctx, op, media);
      ctx.restore();
    } else {
      paintOp(ctx, op, media);
    }
  }
}
