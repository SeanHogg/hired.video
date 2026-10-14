/**
 * The widget frame — everything about how a widget sits on the stage that
 * is NOT its kind's own content: box, container chrome, rotation, animate
 * / enter-exit motion, and the CSS-equivalent effect stack.
 *
 * Resolved ONCE here, then handed to both renderers (#2312):
 *   - the DOM stage turns it into CSS (`frameToCss`, frame-css.ts)
 *   - the export painter applies it to a 2D context (`applyFrameToCtx`,
 *     frame-canvas.ts)
 * so the editor preview, the watch page and the posted MP4 cannot disagree
 * on where a widget is, how it moves, or what chrome it wears. Widget
 * plugins (lib/studio/widgets/plugins) only draw INSIDE `content`.
 *
 * Pure and React-free — imported by the export pipeline.
 */
import type { ContainerStyle, Widget } from "@/lib/studio/editor-v2/canvas-state";
import { isWidgetMotion, type WidgetMotion } from "@/lib/studio/editor-v2/widget-motion";
import { evaluateWidgetPositionAt, parseWidgetKeyframes } from "@/lib/studio/widgets/evaluate-widget-position";
import {
  ANIMATE_EFFECT_KINDS,
  computeAnimateOutput,
  type AnimateInput,
  type AnimateOutput,
} from "@/lib/timeline/effects/animate";
import { resolveEffectAt } from "@/lib/timeline/effects/keyframes";
import { BLEND_EFFECT_KIND, resolveBlendMode, type BlendMode } from "@/lib/timeline/effects/blend";

export interface EffectEntry {
  kind: string;
  params: Record<string, unknown>;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A widget's placement + look, independent of its kind. Position is in
 *  0..1 fractions of the canvas. */
export interface FrameInput {
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  /** Degrees, clockwise, around the widget's centre. */
  rotation: number;
  motion: WidgetMotion | null;
  chrome: ContainerStyle | null;
  effects: EffectEntry[];
}

/** One CSS-equivalent visual effect, in stack order. */
export type FrameFilter = { kind: "blur"; px: number } | { kind: "glow"; radius: number; alpha: number };

export interface ResolvedFrame {
  input: FrameInput;
  /** Whole widget box in canvas px — chrome paints here. */
  box: Box;
  /** `box` inset by padding + border — the widget body paints here. */
  content: Box;
  /** Border width as drawn (a colour with no width draws 2px). */
  borderWidth: number;
  animate: AnimateOutput;
  /** Product of the `opacity` effects (animate alpha is separate). */
  opacity: number;
  filters: FrameFilter[];
  /** How the widget composites onto the stage (#282). Null = normal. The
   *  name is valid for both CSS `mix-blend-mode` and canvas
   *  `globalCompositeOperation`. */
  blendMode: BlendMode | null;
  /** Effects with no CSS / ctx-state equivalent — the export's per-widget
   *  pixel pass runs these; the DOM preview can't. */
  pixelEffects: EffectEntry[];
}

/** Effect kinds folded into frame state (both renderers) — never re-run
 *  by the pixel pass. */
const FRAME_STATE_EFFECT_KINDS: ReadonlySet<string> = new Set(["blur", "glow", "opacity", BLEND_EFFECT_KIND]);

export function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Sanitised container chrome — keeps only well-typed, non-empty fields;
 *  null when nothing is left. The one reader for saved chrome. */
export function parseContainerStyle(value: unknown): ContainerStyle | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const style: ContainerStyle = {};
  if (typeof v.backgroundColor === "string" && v.backgroundColor) style.backgroundColor = v.backgroundColor;
  if (typeof v.borderColor === "string" && v.borderColor) style.borderColor = v.borderColor;
  if (typeof v.borderWidth === "number" && v.borderWidth > 0) style.borderWidth = v.borderWidth;
  if (typeof v.borderRadius === "number" && v.borderRadius > 0) style.borderRadius = v.borderRadius;
  if (typeof v.padding === "number" && v.padding > 0) style.padding = v.padding;
  return Object.keys(style).length > 0 ? style : null;
}

/** Saved effect chain coerced to `{kind, params}` entries. */
export function parseEffectStack(value: unknown): EffectEntry[] {
  if (!Array.isArray(value)) return [];
  const out: EffectEntry[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as { kind?: unknown; params?: unknown };
    if (typeof e.kind !== "string") continue;
    const params = (e.params && typeof e.params === "object" ? e.params : {}) as Record<string, unknown>;
    out.push({ kind: e.kind, params });
  }
  return out;
}

/** Placement at `scenePlayheadSec` (seconds from scene start). Transform
 *  keyframes lerp the pose; enter/exit `motion` still rides on the input
 *  and is applied later by `computeAnimateOutput` inside `resolveFrame`. */
export function frameInputFromWidget(widget: Widget, scenePlayheadSec = 0): FrameInput {
  const p = evaluateWidgetPositionAt(widget, scenePlayheadSec);
  return {
    x: p.x,
    y: p.y,
    width: p.width,
    height: p.height,
    z: p.z,
    rotation: p.rotation,
    motion: widget.motion,
    chrome: parseContainerStyle(widget.containerStyle),
    effects: parseEffectStack(widget.effects),
  };
}

/** Frame fields as they ride on a `canvas-v2:*` clip effect's params.
 *  `scenePlayheadSec` evaluates persisted transform keyframes so the
 *  export painter sees the same pose as the DOM preview. */
export function frameInputFromParams(params: Record<string, unknown>, scenePlayheadSec = 0): FrameInput {
  const p = evaluateWidgetPositionAt(
    {
      position: {
        x: numberOr(params.x, 0),
        y: numberOr(params.y, 0),
        width: numberOr(params.width, 1),
        height: numberOr(params.height, 0.1),
        z: numberOr(params.z, 1),
        rotation: numberOr(params.rotation, 0),
      },
      keyframes: parseWidgetKeyframes(params.keyframes),
    },
    scenePlayheadSec,
  );
  return {
    x: p.x,
    y: p.y,
    width: p.width,
    height: p.height,
    z: p.z,
    rotation: p.rotation,
    motion: isWidgetMotion(params.motion) ? params.motion : null,
    chrome: parseContainerStyle(params.containerStyle),
    effects: parseEffectStack(params.effects),
  };
}

/** Border width as both renderers draw it (colour without width = 2px). */
export function chromeBorderWidth(style: ContainerStyle | null): number {
  if (!style?.borderColor) return 0;
  return style.borderWidth ?? 2;
}

export function resolveFrame(
  input: FrameInput,
  canvas: { width: number; height: number },
  time: AnimateInput,
): ResolvedFrame {
  const box: Box = {
    x: input.x * canvas.width,
    y: input.y * canvas.height,
    w: input.width * canvas.width,
    h: input.height * canvas.height,
  };
  const borderWidth = chromeBorderWidth(input.chrome);
  const inset = (input.chrome?.padding ?? 0) + borderWidth;
  const content: Box = {
    x: box.x + inset,
    y: box.y + inset,
    w: Math.max(0, box.w - inset * 2),
    h: Math.max(0, box.h - inset * 2),
  };

  // Keyframed params (#282) resolve once at the widget's progress, so the
  // DOM preview and the export read identical numbers.
  const progress = time.clipDurationSec > 0 ? time.clipTimeSec / time.clipDurationSec : 0;
  const effects = input.effects.map((e) => resolveEffectAt(e, progress));

  let opacity = 1;
  const filters: FrameFilter[] = [];
  for (const e of effects) {
    switch (e.kind) {
      case "opacity": {
        const v = clamp01(numberOr(e.params.opacity, 1));
        if (v < 1) opacity *= v;
        break;
      }
      case "blur": {
        const v = clamp01(numberOr(e.params.intensity, 0));
        if (v > 0) filters.push({ kind: "blur", px: Math.round(v * 24) });
        break;
      }
      case "glow": {
        const v = clamp01(numberOr(e.params.intensity, 0));
        if (v > 0) filters.push({ kind: "glow", radius: Math.round(8 + v * 24), alpha: 0.4 + v * 0.4 });
        break;
      }
      default:
        break;
    }
  }

  return {
    input,
    box,
    content,
    borderWidth,
    animate: computeAnimateOutput(effects, time, input.motion),
    opacity,
    filters,
    blendMode: resolveBlendMode(effects),
    pixelEffects: effects.filter((e) => !FRAME_STATE_EFFECT_KINDS.has(e.kind) && !ANIMATE_EFFECT_KINDS.has(e.kind)),
  };
}
