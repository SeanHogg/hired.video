/**
 * Blend-mode effect (#282, NLE M2) — how a widget composites onto what is
 * already on the stage.
 *
 * The mode names are the shared vocabulary of CSS `mix-blend-mode` and
 * Canvas 2D `globalCompositeOperation`, so the DOM preview (frame-css.ts)
 * and the export painter (frame-canvas.ts) apply the SAME string and cannot
 * disagree. Like `opacity` / `blur`, the work happens in frame state, so the
 * registry `apply()` is a no-op.
 */
import { registerEffect } from "./registry";

export const BLEND_EFFECT_KIND = "blend";

export const BLEND_MODES = [
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;

export type BlendMode = (typeof BLEND_MODES)[number];

const MODE_SET: ReadonlySet<string> = new Set(BLEND_MODES);

export function isBlendMode(v: unknown): v is BlendMode {
  return typeof v === "string" && MODE_SET.has(v);
}

/** i18n key for a mode's label: `studio.effects.option.blend.colorDodge`. */
export function blendModeLabelKey(mode: BlendMode): string {
  const camel = mode.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  return `studio.effects.option.blend.${camel}`;
}

/** The blend mode a stack asks for — the LAST valid `blend` entry wins
 *  (a widget composites once). Null = normal (source-over). */
export function resolveBlendMode(
  effects: ReadonlyArray<{ kind: string; params: Record<string, unknown> }> | undefined,
): BlendMode | null {
  if (!effects) return null;
  let mode: BlendMode | null = null;
  for (const e of effects) {
    if (e.kind === BLEND_EFFECT_KIND && isBlendMode(e.params.mode)) mode = e.params.mode;
  }
  return mode;
}

registerEffect({
  kind: BLEND_EFFECT_KIND,
  labelKey: "studio.effects.kind.blend",
  category: "composite",
  defaults: { mode: "multiply" },
  paramHints: {
    mode: {
      type: "select",
      options: BLEND_MODES.map((m) => ({ value: m, labelKey: blendModeLabelKey(m) })),
    },
  },
  proOnly: true,
  // Folded into frame state by resolveFrame — see the module comment.
  apply() {},
});
