/**
 * Per-widget motion model — enter / exit animations applied to a widget
 * over its visibility window. Distinct from `CanvasState.motion`, which
 * is a global intensity preset that the render pipeline applies uniformly.
 *
 * Authoring data: the inspector UI in `widget-sections.tsx` writes these
 * structures onto each widget. Both consumers run the same
 * `computeAnimateOutput` math: the DOM screen renderer
 * (`<CanvasStage mode="playback"/>` via `widgetEffectsToCss`) and the
 * headless export pipeline (`canvas-v2:*` effect registry called from
 * `renderTimelineFrame`) — single seam, no per-surface motion drift.
 */
export type MotionKind =
  | "none"
  | "fade"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "scale"
  | "pulse";

export type MotionEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export interface MotionPhase {
  kind: MotionKind;
  /** Duration in seconds. 0 means no animation (instant). */
  durationSeconds: number;
  easing: MotionEasing;
}

export interface WidgetMotion {
  enter: MotionPhase;
  exit: MotionPhase;
}

export const DEFAULT_MOTION_DURATION_SECONDS = 0.5;

export const MOTION_KIND_LABELS: Record<MotionKind, string> = {
  none: "None",
  fade: "Fade",
  "slide-left": "Slide from left",
  "slide-right": "Slide from right",
  "slide-up": "Slide from below",
  "slide-down": "Slide from above",
  scale: "Scale",
  pulse: "Pulse",
};

export const MOTION_EASING_LABELS: Record<MotionEasing, string> = {
  linear: "Linear",
  "ease-in": "Ease in",
  "ease-out": "Ease out",
  "ease-in-out": "Ease in/out",
};

export const MOTION_KINDS: MotionKind[] = [
  "none",
  "fade",
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "scale",
  "pulse",
];

export const MOTION_EASINGS: MotionEasing[] = [
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
];

export function defaultMotion(): WidgetMotion {
  return {
    enter: { kind: "none", durationSeconds: DEFAULT_MOTION_DURATION_SECONDS, easing: "ease-out" },
    exit: { kind: "none", durationSeconds: DEFAULT_MOTION_DURATION_SECONDS, easing: "ease-in" },
  };
}

