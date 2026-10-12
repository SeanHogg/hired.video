/**
 * Animation seeds — per-template `AnimationState` factories for
 * `mediaKind: "animation"` projects. Parallel to:
 *   - `editor-v2/template-seeds.ts` (Timeline kinds → CanvasState)
 *   - `game/game-seeds.ts` (game kind → GameState)
 *   - `image/image-seeds.ts` (image kind → ImageState)
 *
 * Each call returns a fresh `AnimationState` with the canvas dimensions,
 * fps, and starter frame count appropriate for the chosen template. Per
 * PRD §1.2 canvas-runtime extensibility, every kind owns its own seed
 * registry; `seedTemplate(template)` in `lib/studio/template-dispatch.ts`
 * dispatches to this one for animation-kind templates.
 *
 * Templates and their presets are kept in sync with
 * [components/studio/templates/catalog.tsx]'s animation entries — the
 * id strings are the join key.
 */

import {
  createBlankAnimationState,
  insertFrameAfter,
  type AnimationState,
} from "@shared/animation-state";

/** Per-template preset — dimensions + fps + starter frame count. The
 *  starter frame count seeds the strip so a fresh project isn't a
 *  single blank canvas — the user lands on a 4-frame loop they can
 *  immediately overpaint. */
interface AnimationTemplatePreset {
  width: number;
  height: number;
  fps: number;
  starterFrames: number;
  /** Loop count for export — 0 = forever (the typical animator default). */
  loopCount?: number;
}

const ANIMATION_TEMPLATE_PRESETS: Record<string, AnimationTemplatePreset> = {
  // Logo loop — square brand bug; smooth at 24fps; 8 starter frames
  // gives the user a useful budget for a simple wipe / spin / pulse.
  "animation-logo-loop":   { width: 512, height: 512, fps: 24, starterFrames: 8 },
  // Loading spinner — small square; smooth at 30fps so the spinner
  // looks fluid; 6 frames is the canonical "spinner" cadence.
  "animation-spinner":     { width: 256, height: 256, fps: 30, starterFrames: 6 },
  // Reaction GIF — Twitter/Reddit-friendly 480² at 15fps; 12 frames
  // gives ~0.8s loops, the typical "meme reaction" duration.
  "animation-reaction":    { width: 480, height: 480, fps: 15, starterFrames: 12 },
  // Explainer loop — wider 640×360 16:9 mini-GIF for tutorial content;
  // 12fps "on 2s" feels animator-drawn rather than computer-smooth.
  "animation-explainer":   { width: 640, height: 360, fps: 12, starterFrames: 16 },
};

/** Resolve the seed for an animation template. Unknown ids fall back
 *  to a blank single-frame default so a future template id added to
 *  the catalog without a matching preset here still produces a usable
 *  project (Animation MVP semantics — the user can manually extend the
 *  frame strip if the seed didn't pre-fill). */
export function seedAnimationFromTemplate(
  templateId: string | null | undefined,
): AnimationState {
  const preset = templateId ? ANIMATION_TEMPLATE_PRESETS[templateId] : undefined;
  if (!preset) return createBlankAnimationState();
  let state = createBlankAnimationState(
    preset.width,
    preset.height,
    { kind: "color", color: "#ffffff" },
    preset.fps,
  );
  if (preset.loopCount !== undefined) {
    state = { ...state, loopCount: preset.loopCount };
  }
  // Seed additional frames so the user lands on a strip they can play
  // immediately. `insertFrameAfter` chains so the final activeFrameId
  // points at the LAST inserted frame; reset to the first frame so the
  // editor opens on the start of the strip.
  for (let i = 1; i < preset.starterFrames; i++) {
    const { state: next } = insertFrameAfter(state, state.activeFrameId);
    state = next;
  }
  if (state.frames.length > 0) {
    state = { ...state, activeFrameId: state.frames[0].id };
  }
  return state;
}

/** Exposed for tests + the catalog UI — adding a template entry to
 *  ANIMATION_TEMPLATE_PRESETS without registering it here still works
 *  via the seed fallback, but consumers that want to render a sized
 *  thumbnail (the studio chooser card) read the preset directly. */
export function getAnimationTemplatePreset(
  templateId: string | null | undefined,
): AnimationTemplatePreset | null {
  if (!templateId) return null;
  return ANIMATION_TEMPLATE_PRESETS[templateId] ?? null;
}
