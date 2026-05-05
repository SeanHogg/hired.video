/**
 * Rectangular mask — restricts the visible area of the clip to a
 * rectangle, with optional feathered edges. Foundation for the M5
 * crop / shape-mask suite; the rectangle generalises to arbitrary
 * polygons later.
 *
 * Params:
 *   - x, y, width, height: 0..1 normalised rect (0,0 is top-left)
 *   - feather: 0..0.5 — fractional fade band on each edge
 *   - invert: boolean — when true, hides the rect instead of showing it
 */

import { registerEffect } from "./registry";

registerEffect({
  kind: "mask-rect",
  label: "Rectangular mask",
  category: "transform",
  proOnly: true,
  defaults: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, feather: 0, invert: false },
  apply(effect, { ctx, canvas }) {
    const x = clamp01(numberOr(effect.params.x, 0));
    const y = clamp01(numberOr(effect.params.y, 0));
    const w = clamp01(numberOr(effect.params.width, 1));
    const h = clamp01(numberOr(effect.params.height, 1));
    const feather = clamp(numberOr(effect.params.feather, 0), 0, 0.5);
    const invert = effect.params.invert === true;

    const cw = canvas.width;
    const ch = canvas.height;
    const rectL = x * cw;
    const rectT = y * ch;
    const rectR = (x + w) * cw;
    const rectB = (y + h) * ch;
    const fpx = feather * Math.min(cw, ch);

    const img = ctx.getImageData(0, 0, cw, ch);
    const px = img.data;
    let i = 0;
    for (let py = 0; py < ch; py++) {
      for (let pxX = 0; pxX < cw; pxX++) {
        const inside = pxX >= rectL && pxX < rectR && py >= rectT && py < rectB;
        let alpha: number;
        if (fpx <= 0) {
          alpha = inside ? 1 : 0;
        } else {
          // Distance to rectangle edge — positive inside, negative outside.
          const dxL = pxX - rectL;
          const dxR = rectR - pxX;
          const dyT = py - rectT;
          const dyB = rectB - py;
          const insideDist = Math.min(dxL, dxR, dyT, dyB);
          if (insideDist >= fpx) alpha = 1;
          else if (insideDist <= -fpx) alpha = 0;
          else alpha = (insideDist + fpx) / (2 * fpx);
        }
        if (invert) alpha = 1 - alpha;
        px[i + 3] = px[i + 3] * alpha;
        i += 4;
      }
    }
    ctx.putImageData(img, 0, 0);
  },
});

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
