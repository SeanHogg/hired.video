/**
 * Easing curves shared by every time-based effect: widget enter/exit motion
 * (animate.ts) and per-param keyframe tracks (keyframes.ts). One definition
 * so a curve named "ease-out" means the same thing everywhere it is picked.
 *
 * Pure — `t` is clamped by the caller to 0..1.
 */
import type { MotionEasing } from "@/lib/studio/editor-v2/widget-motion";

export function ease(easing: MotionEasing, t: number): number {
  switch (easing) {
    case "ease-in":
      return t * t * t;
    case "ease-out":
      return 1 - Math.pow(1 - t, 3);
    case "ease-in-out":
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case "linear":
    default:
      return t;
  }
}
