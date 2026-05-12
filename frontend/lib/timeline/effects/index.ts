/**
 * Effect catalog entry point.
 *
 * Importing this module registers every shipped effect into the shared
 * registry. Per the standing DRY rule, callers should NOT individually
 * import each effect file — they import this one barrel and the
 * registry is populated as a side effect.
 *
 * The compositor (frame-renderer.ts) and the editor's effect picker
 * (EffectsPanel.tsx) both import from here so the catalog is identical
 * on render-side and edit-side.
 */

import "./opacity";
import "./transform";
import "./color-wheels";
import "./curves";
import "./hsl";
import "./secondary";
import "./power-window";
import "./lut";
import "./chroma-key";
import "./mask";
import "./stylize";
import "./titles";
import "./scene-legacy";
import "./audio-effects";
import "./canvas-v2";

export { preloadCanvasV2Media } from "./canvas-v2";

export {
  applyEffects,
  getEffectDefinition,
  listEffects,
  registerEffect,
  type EffectContext,
  type EffectDefinition,
  type EffectParamHint,
} from "./registry";

export {
  connectAudioEffectChain,
  getAudioEffectDefinition,
  listAudioEffects,
  processAudioBuffer,
  registerAudioEffect,
  type AudioEffectDefinition,
} from "./audio-registry";
