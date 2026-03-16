// animation-graph.ts — converts AnimationSpec → CompiledAnimation with an
// evaluate(elapsed) interpolator.  Elapsed is seconds within the scene.

import type { AnimationSpec } from "../../types/video-script";
import type { CompiledAnimation } from "./types";

// ─── Easing functions ─────────────────────────────────────────────────────────

function linear(t: number): number { return t; }
function easeIn(t: number): number { return t * t; }
function easeOut(t: number): number { return t * (2 - t); }
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
function spring(t: number): number {
  // Damped sine — overshoot then settle
  const c = 0.45; // damping
  const omega = 12;
  return 1 - Math.exp(-c * omega * t) * Math.cos(omega * t);
}

function applyEasing(t: number, easing: CompiledAnimation["easing"]): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (easing) {
    case "easeIn":    return easeIn(clamped);
    case "easeOut":   return easeOut(clamped);
    case "easeInOut": return easeInOut(clamped);
    case "spring":    return spring(clamped);
    default:          return linear(clamped);
  }
}

// ─── Property mappings ────────────────────────────────────────────────────────
// Each AnimationType maps to { property, from, to } deltas.

type AnimDef = { property: CompiledAnimation["property"]; from: number; to: number }[];

function animationDefs(type: AnimationSpec["type"]): AnimDef {
  switch (type) {
    case "fadeIn":    return [{ property: "alpha",  from: 0,    to: 1 }];
    case "slideUp":   return [{ property: "y",      from: 40,   to: 0 }, { property: "alpha", from: 0, to: 1 }];
    case "slideIn":   return [{ property: "x",      from: 60,   to: 0 }, { property: "alpha", from: 0, to: 1 }];
    case "scaleIn":   return [{ property: "scaleX", from: 0.8,  to: 1 }, { property: "scaleY", from: 0.8, to: 1 }, { property: "alpha", from: 0, to: 1 }];
    case "typewriter": return [{ property: "alpha",  from: 0,   to: 1 }]; // Typewriter handled at render level; alpha as fallback
    case "none":      return [];
    default:          return [];
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function compileAnimation(spec: AnimationSpec): CompiledAnimation[] {
  const easing = spec.easing ?? "easeOut";
  const defs = animationDefs(spec.type);

  return defs.map((def) => {
    const startTime = spec.start;
    const endTime = spec.start + spec.duration;

    const anim: CompiledAnimation = {
      property: def.property,
      fromValue: def.from,
      toValue: def.to,
      startTime,
      endTime,
      easing,
      evaluate(elapsed: number): number {
        if (elapsed <= startTime) return def.from;
        if (elapsed >= endTime)   return def.to;
        const t = (elapsed - startTime) / (endTime - startTime);
        return def.from + (def.to - def.from) * applyEasing(t, easing);
      },
    };
    return anim;
  });
}
