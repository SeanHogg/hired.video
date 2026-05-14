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
}

export const MOTION_PRESETS: MotionPreset[] = [
  { id: "minimal", label: "Minimal", hint: "Clean · subtle" },
  { id: "moderate", label: "Moderate", hint: "Balanced" },
  { id: "cinematic", label: "Cinematic", hint: "Bold · dramatic" },
];

export type TransitionKind = "cut" | "fade" | "slide" | "cinematic-fade";

export interface TransitionPreset {
  id: TransitionKind;
  label: string;
  hint: string;
}

export const TRANSITION_PRESETS: TransitionPreset[] = [
  { id: "cut", label: "Cut", hint: "Hard cut between scenes" },
  { id: "fade", label: "Fade", hint: "Cross-dissolve" },
  { id: "slide", label: "Slide", hint: "Horizontal slide" },
  { id: "cinematic-fade", label: "Cinematic fade", hint: "Fade through black" },
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
