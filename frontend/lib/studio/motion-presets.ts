/**
 * Motion + transition catalogs — single source of truth for the global
 * animation intensity (motion) and the default scene-to-scene
 * transition (cut / fade / slide / cinematic). Both v1 (via
 * `script.video.theme.motion` / `.transition`) and v2 (via
 * `CanvasState.motion` / `.defaultTransition`) read from these arrays.
 */

export type MotionStyle = "minimal" | "moderate" | "cinematic";

export interface MotionPreset {
  id: MotionStyle;
  label: string;
  hint: string;
  /** i18n keys for `label` / `hint` — pickers render through t(). */
  labelKey: string;
  hintKey: string;
}

export const MOTION_PRESETS: MotionPreset[] = [
  { id: "minimal", label: "Minimal", hint: "Clean · subtle", labelKey: "studio.motion.minimal.label", hintKey: "studio.motion.minimal.hint" },
  { id: "moderate", label: "Moderate", hint: "Balanced", labelKey: "studio.motion.moderate.label", hintKey: "studio.motion.moderate.hint" },
  { id: "cinematic", label: "Cinematic", hint: "Bold · dramatic", labelKey: "studio.motion.cinematic.label", hintKey: "studio.motion.cinematic.hint" },
];

export type TransitionKind = "cut" | "fade" | "slide" | "cinematic-fade";

export interface TransitionPreset {
  id: TransitionKind;
  label: string;
  hint: string;
  /** i18n keys for `label` / `hint` — pickers render through t(). */
  labelKey: string;
  hintKey: string;
}

export const TRANSITION_PRESETS: TransitionPreset[] = [
  { id: "cut", label: "Cut", hint: "Hard cut between scenes", labelKey: "studio.transition.cut.label", hintKey: "studio.transition.cut.hint" },
  { id: "fade", label: "Fade", hint: "Cross-dissolve", labelKey: "studio.transition.fade.label", hintKey: "studio.transition.fade.hint" },
  { id: "slide", label: "Slide", hint: "Horizontal slide", labelKey: "studio.transition.slide.label", hintKey: "studio.transition.slide.hint" },
  { id: "cinematic-fade", label: "Cinematic fade", hint: "Fade through black", labelKey: "studio.transition.cinematicFade.label", hintKey: "studio.transition.cinematicFade.hint" },
];

export function findMotionPreset(id: MotionStyle | null | undefined): MotionPreset | null {
  if (!id) return null;
  return MOTION_PRESETS.find((m) => m.id === id) ?? null;
}

export function findTransitionPreset(
  id: TransitionKind | null | undefined,
): TransitionPreset | null {
  if (!id) return null;
  return TRANSITION_PRESETS.find((t) => t.id === id) ?? null;
}
