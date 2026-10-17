/**
 * Secondary color correction — qualified hue range with HSL push.
 * Closes part of #352. Pairs with `hsl.ts` (global HSL) and
 * `power-window.ts` (shape-mask qualifier).
 *
 * The qualifier band is a sector on the hue circle (`qualHueCenter` ±
 * `qualHueWidth`) with optional `qualHueFeather` for soft edges. The
 * hue/sat/light deltas apply only within the qualified region,
 * weighted by the per-pixel qualifier mask. Setting qualHueWidth to
 * 0.5 (its max) covers the full circle and degrades to global HSL.
 *
 * Hue values surface in degrees (0..360) for editor ergonomics; the
 * shared `hsl-math` primitives operate on 0..1 internally.
 */

import { registerEffect } from "./registry";
import { clamp01, numberOr, wrap01 } from "./params";
import { rgbToHsl, hslToRgb, hueQualifierWeight } from "./hsl-math";

registerEffect({
  kind: "secondary",
  labelKey: "studio.effects.kind.secondary",
  category: "color",
  proOnly: true,
  defaults: {
    qualHueCenter: 0,
    qualHueWidth: 60,
    qualHueFeather: 15,
    hueShift: 0,
    saturation: 0,
    lightness: 0,
  },
  paramHints: {
    qualHueCenter: { type: "number", min: 0, max: 360, step: 1 },
    qualHueWidth: { type: "number", min: 1, max: 180, step: 1 },
    qualHueFeather: { type: "number", min: 0, max: 90, step: 1 },
    hueShift: { type: "number", min: -180, max: 180, step: 1 },
    saturation: { type: "number", min: -1, max: 1, step: 0.01 },
    lightness: { type: "number", min: -1, max: 1, step: 0.01 },
  },
  apply(effect, { ctx, canvas }) {
    const center = numberOr(effect.params.qualHueCenter, 0) / 360;
    const width = numberOr(effect.params.qualHueWidth, 60) / 360;
    const feather = numberOr(effect.params.qualHueFeather, 15) / 360;
    const dHue = numberOr(effect.params.hueShift, 0) / 360;
    const dSat = numberOr(effect.params.saturation, 0);
    const dLum = numberOr(effect.params.lightness, 0);

    if (dHue === 0 && dSat === 0 && dLum === 0) return;

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;

    for (let i = 0; i < px.length; i += 4) {
      const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
      const w = hueQualifierWeight(h, center, width, feather);
      if (w <= 0) continue;
      const h2 = wrap01(h + dHue * w);
      const s2 = clamp01(s + dSat * w);
      const l2 = clamp01(l + dLum * w);
      const [r2, g2, b2] = hslToRgb(h2, s2, l2);
      px[i] = r2;
      px[i + 1] = g2;
      px[i + 2] = b2;
    }
    ctx.putImageData(data, 0, 0);
  },
});
