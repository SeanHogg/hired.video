/**
 * Opacity effect — simplest possible per-clip effect, exercises the
 * registry plumbing end-to-end. Reduces the alpha of everything the
 * clip drew so far in the composite stack.
 *
 * Params:
 *   - opacity: 0..1
 */

import { registerEffect } from "./registry";
import { clamp01, numberOr } from "./params";

registerEffect({
  kind: "opacity",
  labelKey: "studio.effects.kind.opacity",
  category: "transform",
  defaults: { opacity: 1 },
  apply(effect, { ctx, canvas }) {
    const opacity = clamp01(numberOr(effect.params.opacity, 1));
    if (opacity >= 1) return;

    // Pull the current pixels, multiply alpha, write back. Done at the
    // pixel level rather than via globalAlpha because the clip has
    // already been drawn — globalAlpha would only affect future draws.
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    for (let i = 3; i < px.length; i += 4) {
      px[i] = px[i] * opacity;
    }
    ctx.putImageData(data, 0, 0);
  },
});
