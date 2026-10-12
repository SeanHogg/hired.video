/**
 * Registers every widget plugin (lib/studio/widgets) as an export painter.
 * The bracket is shared: resolve the frame at the clip-local time, apply it,
 * let the plugin paint its drawing into the content box, then run the pixel
 * pass. A new plugin needs no code here.
 */
import i18n from "@/lib/i18n/i18n";
import { applyFrameToCtx } from "@/lib/studio/widgets/frame-canvas";
import type { DrawEnv } from "@/lib/studio/widgets/draw-ops";
import type { PaintMedia } from "@/lib/studio/widgets/paint-ops";
import { cachedQrMatrix } from "@/lib/studio/widgets/qr-encoder";
import { UNIQUE_WIDGET_PLUGINS, renderContextFromParams } from "@/lib/studio/widgets/registry";
import { canvasV2VideoTimeSec, cachedLinkedContent, ensureImageLoaded, ensureVideoLoaded } from "./canvas-v2-stills";
import { cachedEngagementTitle } from "./engagement-asset";
import { registerEffect, type EffectContext } from "./registry";
import { applyWidgetPixelEffects, resolveClipFrame } from "./widget-frame";

function exportEnv(params: Record<string, unknown>, ctx: EffectContext): DrawEnv {
  return {
    render: renderContextFromParams(params),
    canvas: { width: ctx.canvas.width, height: ctx.canvas.height },
    clipTimeSec: ctx.fps > 0 ? ctx.clipFrame / ctx.fps : 0,
    clipDurationSec: ctx.fps > 0 ? ctx.clipDurationFrames / ctx.fps : 0,
    // Measure on the frame's own context; the font is restored after.
    measure: (font) => (s) => {
      ctx.ctx.save();
      ctx.ctx.font = font;
      const width = ctx.ctx.measureText(s).width;
      ctx.ctx.restore();
      return width;
    },
    t: (key, vars) => String(vars ? i18n.t(key, vars) : i18n.t(key)),
    lookups: {
      linkedContent: (kind, id) => {
        const cached = cachedLinkedContent(`${kind}:${id}`);
        return cached === "loading" ? undefined : cached;
      },
      engagementTitle: cachedEngagementTitle,
      // Loaded by `withExportTarget` before an export that needs it.
      qrMatrix: cachedQrMatrix,
    },
  };
}

/** Media from the preloaded cache; a video is nudged to the clip-local time
 *  when the render's awaited seek (`syncCanvasV2VideosToFrame`) missed. */
function exportMedia({ clipFrame, fps }: EffectContext): PaintMedia {
  return {
    image: ensureImageLoaded,
    video(url) {
      const v = ensureVideoLoaded(url);
      if (!v) return null;
      const target = canvasV2VideoTimeSec(clipFrame, fps);
      if (v.duration && Math.abs(v.currentTime - target) > 1 / fps) {
        try {
          v.currentTime = Math.min(v.duration, Math.max(0, target));
        } catch {
          // Some browsers throw before metadata loads — paint what we have.
        }
      }
      return v;
    },
  };
}

for (const plugin of UNIQUE_WIDGET_PLUGINS) {
  registerEffect({
    kind: plugin.effectKind,
    ...plugin.meta,
    apply(effect, env) {
      const { ctx, canvas, timelineFrame, fps } = env;
      const frame = resolveClipFrame(effect.params, env);
      const params = plugin.parse(effect.params);
      ctx.save();
      applyFrameToCtx(ctx, frame);
      plugin.paint(ctx, frame.content, params, exportEnv(effect.params, env), exportMedia(env));
      ctx.restore();
      const pixelEffects = [...frame.pixelEffects, ...plugin.pixelEffects(params)];
      applyWidgetPixelEffects(ctx, canvas, pixelEffects, frame.content, timelineFrame, fps);
    },
  });
}
