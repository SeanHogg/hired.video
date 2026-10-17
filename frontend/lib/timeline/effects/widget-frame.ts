/**
 * Export-side widget frame plumbing (#2312): resolve a `canvas-v2:*` clip's
 * frame at the clip-local time, and run the per-widget pixel pass. Every
 * widget painter — plugin or legacy applier — brackets its draw with these,
 * so frame behaviour is identical across kinds.
 */
import { numberOr } from "@/lib/numeric";
import { frameInputFromParams, resolveFrame, type Box, type EffectEntry, type ResolvedFrame } from "@/lib/studio/widgets/frame";
import { getEffectDefinition, type EffectContext } from "./registry";

export function resolveClipFrame(
  params: Record<string, unknown>,
  { canvas, clipFrame, clipDurationFrames, fps }: Pick<EffectContext, "canvas" | "clipFrame" | "clipDurationFrames" | "fps">,
): ResolvedFrame {
  const clipTimeSec = fps > 0 ? clipFrame / fps : 0;
  const clipDurationSec = fps > 0 ? clipDurationFrames / fps : 0;
  // Transform keyframes are authored in scene seconds. Clip-local time
  // plus the clip's scene origin (visibleFrom, persisted as
  // keyframeOriginSec) recovers the playhead evaluateWidgetPositionAt
  // expects. 0 when the widget spans the scene.
  const scenePlayheadSec = clipTimeSec + numberOr(params.keyframeOriginSec, 0);
  return resolveFrame(frameInputFromParams(params, scenePlayheadSec), canvas, {
    clipTimeSec,
    clipDurationSec,
  });
}

/**
 * The on-canvas part of a widget box, in whole device pixels, or null when
 * none of it is on the canvas. Both edges are clamped: a widget hanging off
 * the left / top edge covers only its visible part (its far edge stays put),
 * not a box shifted back onto the canvas. Rects outside the canvas are
 * legitimate (fitted full-bleed cuts scale widgets to cover).
 */
export function pixelPassRegion(
  rect: Box,
  canvas: { width: number; height: number },
): { sx: number; sy: number; sw: number; sh: number } | null {
  // Round outward — sub-pixel snapshots fail in some browsers.
  const sx = Math.max(0, Math.floor(rect.x));
  const sy = Math.max(0, Math.floor(rect.y));
  const sw = Math.min(canvas.width, Math.ceil(rect.x + rect.w)) - sx;
  const sh = Math.min(canvas.height, Math.ceil(rect.y + rect.h)) - sy;
  return sw > 0 && sh > 0 ? { sx, sy, sw, sh } : null;
}

/**
 * Apply full-frame pixel effects (film-grain, vignette, glitch, lut, curves,
 * chroma-key, masks, …) scoped to one widget's box: snapshot the painted
 * region, run the registry's appliers against an offscreen sized to it (so
 * their whole-canvas `getImageData` sees only the widget), composite back.
 * Call AFTER `ctx.restore()`. Rotated widgets use their axis-aligned box
 * (fidelity gap noted on #643).
 */
export function applyWidgetPixelEffects(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  pixelEffects: ReadonlyArray<EffectEntry>,
  rect: Box,
  timelineFrame: number,
  fps: number,
): void {
  if (pixelEffects.length === 0) return;
  const region = pixelPassRegion(rect, canvas);
  if (!region) return;
  const { sx, sy, sw, sh } = region;

  let off: OffscreenCanvas;
  try {
    off = new OffscreenCanvas(sw, sh);
  } catch {
    // No OffscreenCanvas (older browsers) — skip the pass.
    return;
  }
  const offCtx = off.getContext("2d");
  if (!offCtx) return;
  offCtx.drawImage(canvas as CanvasImageSource, sx, sy, sw, sh, 0, 0, sw, sh);

  for (const e of pixelEffects) {
    const def = getEffectDefinition(e.kind);
    if (!def) continue;
    try {
      def.apply({ kind: e.kind, params: e.params }, {
        ctx: offCtx,
        canvas: off,
        timelineFrame,
        clipFrame: timelineFrame,
        clipDurationFrames: 1,
        fps,
      });
    } catch {
      // An effect that fails on the offscreen is skipped, not the frame.
    }
  }

  ctx.save();
  ctx.clearRect(sx, sy, sw, sh);
  ctx.drawImage(off, 0, 0, sw, sh, sx, sy, sw, sh);
  ctx.restore();
}
