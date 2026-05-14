/**
 * Per-widget motion model — enter / exit animations applied to a widget
 * over its visibility window. Distinct from `CanvasState.motion`, which
 * is a global intensity preset that the render pipeline applies uniformly.
 *
 * The canvas preview consumes `motionStyleAt()` during playback to drive
 * a CSS transform/opacity on each widget body. The render pipeline
 * round-trips motion through `timeline-emit.ts` into clip params so the
 * exported video matches the preview (renderer wiring tracked in the
 * gap register).
 */
import type { Widget } from "./canvas-state";

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

/** Style applied to a widget at a given moment of scene playback. The
 *  values are CSS-ready (transform / opacity strings) so the canvas
 *  preview just spreads them onto the wrapper's style attribute. */
export interface MotionStyle {
  opacity: number;
  transform: string;
}

const IDENTITY_STYLE: MotionStyle = { opacity: 1, transform: "none" };

/**
 * Compute the live motion style for a widget at `secondsIntoScene`.
 *
 * Window resolution:
 *   - `from` = widget.visibleFrom ?? 0
 *   - `to`   = widget.visibleTo ?? sceneDurationSeconds
 *   - Enter animation runs `[from, from + enter.duration)`
 *   - Exit animation runs `[to - exit.duration, to)`
 *
 * Returns `null` when the widget shouldn't render at all (outside its
 * visibility window). Returns IDENTITY_STYLE when no motion applies.
 */
export function motionStyleAt(
  widget: Widget,
  secondsIntoScene: number,
  sceneDurationSeconds: number,
): MotionStyle | null {
  const from = widget.visibleFrom ?? 0;
  const to = widget.visibleTo ?? sceneDurationSeconds;
  if (secondsIntoScene < from || secondsIntoScene >= to) return null;
  const motion = widget.motion;
  if (!motion) return IDENTITY_STYLE;

  // Enter window.
  if (motion.enter.kind !== "none" && motion.enter.durationSeconds > 0) {
    const enterEnd = from + motion.enter.durationSeconds;
    if (secondsIntoScene < enterEnd) {
      const t = clamp01((secondsIntoScene - from) / motion.enter.durationSeconds);
      return motionStyleFor(motion.enter.kind, ease(t, motion.enter.easing), "enter");
    }
  }

  // Exit window.
  if (motion.exit.kind !== "none" && motion.exit.durationSeconds > 0) {
    const exitStart = to - motion.exit.durationSeconds;
    if (secondsIntoScene >= exitStart) {
      const t = clamp01((secondsIntoScene - exitStart) / motion.exit.durationSeconds);
      return motionStyleFor(motion.exit.kind, ease(t, motion.exit.easing), "exit");
    }
  }

  return IDENTITY_STYLE;
}

function motionStyleFor(
  kind: MotionKind,
  t: number,
  phase: "enter" | "exit",
): MotionStyle {
  // For enter: progress 0 → 1 means "off-screen / invisible → fully present".
  // For exit:  progress 0 → 1 means "fully present → off-screen / invisible".
  const presence = phase === "enter" ? t : 1 - t;
  switch (kind) {
    case "none":
      return IDENTITY_STYLE;
    case "fade":
      return { opacity: presence, transform: "none" };
    case "slide-left":
      return { opacity: 1, transform: `translateX(${(1 - presence) * -40}%)` };
    case "slide-right":
      return { opacity: 1, transform: `translateX(${(1 - presence) * 40}%)` };
    case "slide-up":
      return { opacity: 1, transform: `translateY(${(1 - presence) * 40}%)` };
    case "slide-down":
      return { opacity: 1, transform: `translateY(${(1 - presence) * -40}%)` };
    case "scale":
      return { opacity: presence, transform: `scale(${0.6 + presence * 0.4})` };
    case "pulse": {
      // Pulse only meaningful on enter — small overshoot at midpoint.
      const overshoot = Math.sin(t * Math.PI) * 0.15;
      return {
        opacity: presence,
        transform: `scale(${phase === "enter" ? 1 + overshoot : 1 - overshoot})`,
      };
    }
  }
}

function ease(t: number, easing: MotionEasing): number {
  switch (easing) {
    case "linear":
      return t;
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
