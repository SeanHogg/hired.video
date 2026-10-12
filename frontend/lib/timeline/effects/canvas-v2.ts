/**
 * canvas-v2 scene background — the painter for `canvas-v2:background`, the
 * one effect every scene's background clip carries. Widget clips on V2 paint
 * on top through their plugins (lib/studio/widgets, registered by
 * widget-plugins.ts); nothing per widget kind lives here.
 */

import { registerEffect } from "./registry";
import { drawParticleField } from "./particle-field";
import { stringOr } from "@/lib/studio/widgets/frame";

// ───────────────────────────────────────────────────────────────────────────
// canvas-v2:background — fills the canvas. V1 background clips carry
// only this effect; widget clips on V2 paint on top.
// ───────────────────────────────────────────────────────────────────────────

registerEffect({
  kind: "canvas-v2:background",
  labelKey: "studio.effects.kind.sceneBackground",
  category: "transform",
  defaults: { color: "#0f172a" },
  paramHints: { color: { type: "color" } },
  apply(effect, { ctx, canvas, timelineFrame }) {
    const baseColor = stringOr(effect.params.color, "#0f172a");
    // Paint the solid fallback first so any rich-effect path can layer
    // over it; for `solid` / no-effect that's the whole job.
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const effectValue = stringOr(effect.params.backgroundEffect, "");
    if (!effectValue) return;
    paintRichBackground(ctx, canvas, effectValue, baseColor, timelineFrame);
  },
});

// Decode + render the encoded BgPreset.value over the already-painted
// solid bg. Mirrors the editor preview's `SceneBackgroundEffect` so the
// two surfaces produce the same pixels — single seam, both consumers
// stay in lock-step (#649 closure).
function paintRichBackground(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvas: { width: number; height: number },
  effectValue: string,
  baseColor: string,
  timelineFrame: number,
): void {
  const [rawKind, color, color2] = effectValue.split(":");
  const w = canvas.width;
  const h = canvas.height;
  switch (rawKind) {
    case "gradient": {
      const c1 = color ?? "#000000";
      const c2 = color2 ?? c1;
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "dark-tech-grid": {
      const accent = color ?? "#7c3aed";
      ctx.fillStyle = "#0f0f23";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = accent + "33";
      ctx.lineWidth = 1;
      const step = 40;
      for (let x = 0; x <= w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      break;
    }
    case "particles": {
      drawParticleField(ctx, 0, 0, w, h, color ?? "#7c3aed", timelineFrame, {
        baseColor,
      });
      break;
    }
    default:
      // Unknown encoding — fall back to the solid we already painted.
      break;
  }
}
