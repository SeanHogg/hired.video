/**
 * Chroma key (green-screen) registry entry. Turns pixels close to a
 * target colour into transparent so the video track underneath shows
 * through.
 *
 * Per the standing DRY rule, the actual keying math lives in
 * `lib/studio/chroma-key.ts` (`applyChromaKeyToPixels`) and is shared
 * with the editor preview `ChromaVideoBody` — there is exactly ONE
 * implementation of "is this pixel close enough to the key" in the
 * editor. This file just plumbs the registry effect into that helper.
 *
 * Params:
 *   - keyColor: "#RRGGBB" — usually green or blue
 *   - threshold: 0..1 — chromatic distance under which a pixel is fully keyed
 *   - softness: 0..1 — distance over which the matte feathers
 *   - spillSuppression: 0..1 — how strongly to desaturate keyed colour
 *     remnants on the foreground (reduces green fringe)
 */

import { registerEffect } from "./registry";
import { numberOr, stringOr } from "./params";
import {
  applyChromaKeyToPixels,
  DEFAULT_CHROMA_KEY,
} from "@/lib/studio/chroma-key";

registerEffect({
  kind: "chroma-key",
  labelKey: "studio.effects.kind.chromaKey",
  category: "key",
  proOnly: true,
  defaults: { ...DEFAULT_CHROMA_KEY },
  apply(effect, { ctx, canvas }) {
    const params = {
      keyColor: stringOr(effect.params.keyColor, DEFAULT_CHROMA_KEY.keyColor),
      threshold: numberOr(effect.params.threshold, DEFAULT_CHROMA_KEY.threshold),
      softness: numberOr(effect.params.softness, DEFAULT_CHROMA_KEY.softness),
      spillSuppression: numberOr(
        effect.params.spillSuppression,
        DEFAULT_CHROMA_KEY.spillSuppression ?? 0,
      ),
    };
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyChromaKeyToPixels(img.data, params);
    ctx.putImageData(img, 0, 0);
  },
});
