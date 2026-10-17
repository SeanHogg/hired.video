/**
 * Transform effect — translate / scale / rotate the composited frame.
 *
 * Implementation: rather than transform-then-draw the source (which
 * would require re-running the source draw inside the transform stack),
 * we read the canvas, transform-blit it back. Slower but works for any
 * composition that preceded this effect in the stack.
 *
 * Params:
 *   - tx, ty: translation in pixels
 *   - scale: uniform scale factor (1 = identity)
 *   - rotateDeg: rotation in degrees, around the canvas centre
 */

import { registerEffect } from "./registry";
import { numberOr } from "./params";

registerEffect({
  kind: "transform",
  labelKey: "studio.effects.kind.transform",
  category: "transform",
  defaults: { tx: 0, ty: 0, scale: 1, rotateDeg: 0 },
  apply(effect, { ctx, canvas }) {
    const tx = numberOr(effect.params.tx, 0);
    const ty = numberOr(effect.params.ty, 0);
    const scale = numberOr(effect.params.scale, 1);
    const rotateDeg = numberOr(effect.params.rotateDeg, 0);

    // No-op when params are identity to keep the M5 cost low for the
    // 99% case of "user added the effect but didn't tweak it."
    if (tx === 0 && ty === 0 && scale === 1 && rotateDeg === 0) return;

    const w = canvas.width;
    const h = canvas.height;
    const snapshot = ctx.getImageData(0, 0, w, h);

    // Stash the pixels into an offscreen buffer so we can clear and
    // re-draw transformed.
    const off = new OffscreenCanvas(w, h);
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    offCtx.putImageData(snapshot, 0, 0);

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.translate(w / 2 + tx, h / 2 + ty);
    ctx.rotate((rotateDeg * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(off, -w / 2, -h / 2);
    ctx.restore();
  },
});
