/**
 * Effect registry — the single dispatch point for every per-clip visual
 * effect that runs during the render compositor pass.
 *
 * Per the standing DRY rule, the frame compositor does NOT branch on
 * effect kind inline. It iterates a clip's `effects` array and asks the
 * registry to apply each one. Adding a new effect (a glitch transition
 * helper, a Total-FX stylize filter, a motion-graphics primitive) is one
 * `registerEffect()` call — no edits to the compositor itself.
 *
 * The same registry serves M2 (color grading / keyframes / green-screen /
 * masks / blend modes) and M5 (Total FX / Motion Graphics / Advanced
 * Titles / Advanced Transitions). The split between "milestones" is a
 * scoping artefact; the runtime model is one effect bus.
 */

import type { ClipEffect } from "@shared/timeline";

export interface EffectContext {
  /** The composited canvas the effect modifies in place. Effects may
   *  read from it and write to it; the registry guarantees the active
   *  clip has already been drawn before effects run. */
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** Frame index relative to the timeline (0-based). */
  timelineFrame: number;
  /** Frame index relative to the clip's start (0 at the clip's startFrame).
   *  Effects that animate over a clip's lifetime read this. */
  clipFrame: number;
  /** Total clip duration in frames — used for normalised t = clipFrame/duration. */
  clipDurationFrames: number;
  /** Output frame rate so time-based params (e.g. seconds) can be
   *  converted to frames once at the call site, not per effect. */
  fps: number;
}

/**
 * Effect appliers MUST be synchronous. Per-frame compositing happens
 * inline — the encoder consumes the canvas bitmap as soon as the
 * effect chain returns, so any awaited async work would race the
 * encoder. Effects that need async setup (model load, resource fetch)
 * do that at registration time and cache the result, then apply
 * synchronously per frame.
 */
export type EffectApplier = (
  effect: ClipEffect,
  context: EffectContext,
) => void;

/**
 * Per-param UI hint. Effects with a string param that should render as
 * a select instead of a text box declare it here. The EffectsPanel
 * reads these hints — every effect's panel layout is driven by ONE
 * shared dispatcher; no effect-specific UI code lives in the panel.
 */
export type EffectParamHint =
  | { type: "select"; options: { value: string; label: string }[] }
  | { type: "text"; multiline?: boolean }
  | { type: "color" }
  | { type: "number"; min?: number; max?: number; step?: number };

export interface EffectDefinition {
  kind: string;
  /** Short human-readable label for the effects panel. */
  label: string;
  /** UI grouping in the effects panel — keeps the panel scannable as
   *  the catalog grows. New groups appear automatically.
   *
   *  `animate` effects mutate the widget's transform / alpha BEFORE it
   *  paints (see `applyWidgetCanvasState` in canvas-v2.ts). Their
   *  registry `apply()` is a no-op — the math lives in the transform
   *  phase, matching the existing `blur`/`glow`/`opacity` convention. */
  category: "color" | "transform" | "key" | "stylize" | "title" | "animate";
  /** Default params seeded into the effect when the user adds it via
   *  the panel. The user then tweaks; the renderer reads `params`. */
  defaults: Record<string, unknown>;
  /** Optional per-param UI hints. When absent, the EffectsPanel falls
   *  back to inferring the control type from the default value's
   *  shape (number → slider, hex string → colour, etc.). */
  paramHints?: Record<string, EffectParamHint>;
  /** Pro-only effect — picker shows a "(Pro)" suffix and intercepts add
   *  for free-tier users. Render-side trusts the gate (chosen effects
   *  always apply) since the gate happens at edit time. Maps to the
   *  Lightworks-Pro tier in `memory/project_nle_decision.md`. */
  proOnly?: boolean;
  apply: EffectApplier;
}

const REGISTRY = new Map<string, EffectDefinition>();

/** Register an effect definition. Throws on duplicate kind so a typo
 *  fails loud instead of silently shadowing an earlier registration. */
export function registerEffect(def: EffectDefinition): void {
  if (REGISTRY.has(def.kind)) {
    throw new Error(`Effect kind '${def.kind}' is already registered`);
  }
  REGISTRY.set(def.kind, def);
}

export function getEffectDefinition(kind: string): EffectDefinition | null {
  return REGISTRY.get(kind) ?? null;
}

/** All registered effects, sorted by category then label for stable
 *  presentation in the editor's effect picker. */
export function listEffects(): EffectDefinition[] {
  return Array.from(REGISTRY.values()).sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.label.localeCompare(b.label);
  });
}

/**
 * Apply every effect on the active clip in array order. Effects compose
 * — earlier effects feed into later ones via the canvas pixels. The
 * scene compositor and the timeline compositor BOTH call this; nothing
 * else in the codebase should iterate effects manually. Single
 * dispatch point per the standing DRY rule.
 */
export function applyEffects(
  effects: ClipEffect[] | undefined,
  context: EffectContext,
): void {
  if (!effects || effects.length === 0) return;
  for (const effect of effects) {
    const def = REGISTRY.get(effect.kind);
    if (!def) {
      // Unknown effect kinds are silently skipped so a project saved
      // with a future-version effect still renders the rest of its
      // composition rather than crashing the export.
      continue;
    }
    def.apply(effect, context);
  }
}

/** Reset the registry — exported for tests; production never calls this. */
export function _resetRegistryForTests(): void {
  REGISTRY.clear();
}
