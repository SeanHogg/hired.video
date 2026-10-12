/**
 * Per-widget motion model — enter / exit animations applied to a widget
 * over its visibility window. Distinct from `CanvasState.motion`, which
 * is a global intensity preset that the render pipeline applies uniformly.
 *
 * Authoring data: the inspector UI in `widget-sections/` writes these
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

/** i18n keys for each motion kind — translate with t() at render. */
export const MOTION_KIND_LABEL_KEYS: Record<MotionKind, string> = {
  none: "studio.inspector.motion.kind.none",
  fade: "studio.inspector.motion.kind.fade",
  "slide-left": "studio.inspector.motion.kind.slideLeft",
  "slide-right": "studio.inspector.motion.kind.slideRight",
  "slide-up": "studio.inspector.motion.kind.slideUp",
  "slide-down": "studio.inspector.motion.kind.slideDown",
  scale: "studio.inspector.motion.kind.scale",
  pulse: "studio.inspector.motion.kind.pulse",
};

/** i18n keys for each easing curve — translate with t() at render. */
export const MOTION_EASING_LABEL_KEYS: Record<MotionEasing, string> = {
  linear: "studio.inspector.motion.easing.linear",
  "ease-in": "studio.inspector.motion.easing.easeIn",
  "ease-out": "studio.inspector.motion.easing.easeOut",
  "ease-in-out": "studio.inspector.motion.easing.easeInOut",
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

/** Runtime guard for motion read back from persisted / effect params. */
export function isWidgetMotion(value: unknown): value is WidgetMotion {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { enter?: unknown; exit?: unknown };
  return isMotionPhase(v.enter) && isMotionPhase(v.exit);
}

function isMotionPhase(value: unknown): value is MotionPhase {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { kind?: unknown; durationSeconds?: unknown; easing?: unknown };
  return typeof v.kind === "string" && typeof v.durationSeconds === "number" && typeof v.easing === "string";
}

export function defaultMotion(): WidgetMotion {
  return {
    enter: { kind: "none", durationSeconds: DEFAULT_MOTION_DURATION_SECONDS, easing: "ease-out" },
    exit: { kind: "none", durationSeconds: DEFAULT_MOTION_DURATION_SECONDS, easing: "ease-in" },
  };
}

