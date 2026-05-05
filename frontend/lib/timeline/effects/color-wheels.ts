/**
 * Color wheels — lift / gamma / gain — the foundation of professional
 * color grading. Maps directly onto the M2 milestone "simple color
 * tools" in [project_nle_decision.md](memory).
 *
 * Each control is an RGB triple in 0..2 space (1 = identity). The
 * formula is the standard ASC CDL form:
 *   out = pow(in * gain + lift, 1/gamma)
 *
 * Operates on canvas pixels — runs after the clip has been drawn. For
 * M5 we'll port this to a WebGPU shader pipeline; for M2 the CPU loop
 * is acceptable on modest timelines.
 *
 * Params:
 *   - lift:  [number, number, number] additive offset, typically -1..1
 *   - gamma: [number, number, number] tone curve, typically 0.1..3
 *   - gain:  [number, number, number] multiplicative slope, typically 0..2
 */

import { registerEffect } from "./registry";

const IDENTITY: [number, number, number] = [1, 1, 1];
const ZERO_LIFT: [number, number, number] = [0, 0, 0];

registerEffect({
  kind: "color-wheels",
  label: "Color wheels",
  category: "color",
  proOnly: true,
  defaults: { lift: ZERO_LIFT, gamma: IDENTITY, gain: IDENTITY },
  apply(effect, { ctx, canvas }) {
    const lift = triple(effect.params.lift, ZERO_LIFT);
    const gamma = triple(effect.params.gamma, IDENTITY);
    const gain = triple(effect.params.gain, IDENTITY);

    if (
      lift[0] === 0 && lift[1] === 0 && lift[2] === 0 &&
      gamma[0] === 1 && gamma[1] === 1 && gamma[2] === 1 &&
      gain[0] === 1 && gain[1] === 1 && gain[2] === 1
    ) return;

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;

    // Pre-compute inverse gamma per channel — pow() is the hot path.
    const invG: [number, number, number] = [
      1 / Math.max(0.0001, gamma[0]),
      1 / Math.max(0.0001, gamma[1]),
      1 / Math.max(0.0001, gamma[2]),
    ];

    for (let i = 0; i < px.length; i += 4) {
      px[i]     = applyChan(px[i],     gain[0], lift[0], invG[0]);
      px[i + 1] = applyChan(px[i + 1], gain[1], lift[1], invG[1]);
      px[i + 2] = applyChan(px[i + 2], gain[2], lift[2], invG[2]);
    }
    ctx.putImageData(data, 0, 0);
  },
});

function applyChan(value: number, gain: number, lift: number, invGamma: number): number {
  const norm = value / 255;
  const lifted = norm * gain + lift;
  const tone = lifted <= 0 ? 0 : Math.pow(lifted, invGamma);
  if (tone <= 0) return 0;
  if (tone >= 1) return 255;
  return tone * 255;
}

function triple(v: unknown, fallback: [number, number, number]): [number, number, number] {
  if (
    Array.isArray(v) &&
    v.length === 3 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    typeof v[2] === "number"
  ) {
    return [v[0], v[1], v[2]];
  }
  return fallback;
}
