/**
 * Global HSL — hue / saturation / lightness shift on the whole image.
 * Closes part of #352. The qualified-range secondary lives in
 * `secondary.ts`; this is the un-qualified primary HSL control.
 *
 * Hue shift wraps modulo 360°. Saturation/lightness are -1..1 deltas
 * that are added to the per-pixel HSL, then clamped 0..1 before the
 * inverse conversion. CPU-bound today; M5 WebGPU port will collapse
 * the per-pixel RGB↔HSL into a fragment shader.
 */

import { registerEffect } from "./registry";
import { clamp01, numberOr, wrap01 } from "./params";
import { rgbToHsl, hslToRgb } from "./hsl-math";

registerEffect({
  kind: "hsl",
  labelKey: "studio.effects.kind.hsl",
  category: "color",
  proOnly: true,
  defaults: { hueShift: 0, saturation: 0, lightness: 0 },
  paramHints: {
    hueShift: { type: "number", min: -180, max: 180, step: 1 },
    saturation: { type: "number", min: -1, max: 1, step: 0.01 },
    lightness: { type: "number", min: -1, max: 1, step: 0.01 },
  },
  apply(effect, { ctx, canvas }) {
    const hueShift = numberOr(effect.params.hueShift, 0);
    const dSat = numberOr(effect.params.saturation, 0);
    const dLum = numberOr(effect.params.lightness, 0);
    if (hueShift === 0 && dSat === 0 && dLum === 0) return;

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    const hueOff = hueShift / 360;

    for (let i = 0; i < px.length; i += 4) {
      const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
      const h2 = wrap01(h + hueOff);
      const s2 = clamp01(s + dSat);
      const l2 = clamp01(l + dLum);
      const [r2, g2, b2] = hslToRgb(h2, s2, l2);
      px[i] = r2;
      px[i + 1] = g2;
      px[i + 2] = b2;
    }
    ctx.putImageData(data, 0, 0);
  },
});
