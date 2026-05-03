/**
 * M5 animated title catalog. Each animation is a preset id; the user
 * picks a preset and customises the text. Per the standing DRY rule
 * titles route through the same effect registry as colour/keying/
 * stylize — there is no parallel "titles renderer."
 *
 * Adding a new animation = one entry in `TITLE_ANIMATIONS` below; both
 * the renderer dispatch and the EffectsPanel pick it up automatically
 * (the panel already enumerates effects from the registry).
 *
 * Single-effect-multiple-presets pattern: rather than registering 50
 * near-identical effects, we register ONE `title-card` effect with a
 * `preset` param. The renderer dispatches on the preset id. Keeps the
 * EffectsPanel dropdown sane while still surfacing the catalog.
 */

import { registerEffect, type EffectContext } from "./registry";

type TitleAnimationId =
  | "fade-in"
  | "slide-from-left"
  | "slide-from-bottom"
  | "typewriter"
  | "lower-third-reveal"
  | "scale-pop";

interface TitleAnimation {
  id: TitleAnimationId;
  label: string;
  /** Renderer hook — receives normalised t in 0..1 over the title's
   *  visible window AND the EffectContext canvas. Each animation is a
   *  small painter; they share the registry plumbing for free. */
  draw(opts: TitleDrawOpts): void;
}

interface TitleDrawOpts {
  ctx: EffectContext["ctx"];
  canvas: EffectContext["canvas"];
  /** 0..1 normalised — 0 at fade-in start, 1 at end. */
  t: number;
  text: string;
  subtitle: string;
  fontPx: number;
  color: string;
  background: string;
}

export const TITLE_ANIMATIONS: TitleAnimation[] = [
  {
    id: "fade-in",
    label: "Fade in",
    draw({ ctx, canvas, t, text, fontPx, color }) {
      ctx.save();
      ctx.globalAlpha = easeOutQuad(t);
      ctx.fillStyle = color;
      ctx.font = `bold ${fontPx}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      ctx.restore();
    },
  },
  {
    id: "slide-from-left",
    label: "Slide from left",
    draw({ ctx, canvas, t, text, fontPx, color }) {
      const eased = easeOutCubic(t);
      const x = -canvas.width + eased * (canvas.width * 1.5);
      ctx.save();
      ctx.fillStyle = color;
      ctx.font = `bold ${fontPx}px sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, canvas.height / 2);
      ctx.restore();
    },
  },
  {
    id: "slide-from-bottom",
    label: "Slide from bottom",
    draw({ ctx, canvas, t, text, fontPx, color }) {
      const eased = easeOutCubic(t);
      const y = canvas.height + (1 - eased) * 100 - canvas.height * 0.15;
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = eased;
      ctx.font = `bold ${fontPx}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, canvas.width / 2, y);
      ctx.restore();
    },
  },
  {
    id: "typewriter",
    label: "Typewriter",
    draw({ ctx, canvas, t, text, fontPx, color }) {
      const visible = Math.ceil(t * text.length);
      const slice = text.slice(0, visible);
      ctx.save();
      ctx.fillStyle = color;
      ctx.font = `bold ${fontPx}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(slice, canvas.width / 2, canvas.height / 2);
      ctx.restore();
    },
  },
  {
    id: "lower-third-reveal",
    label: "Lower-third reveal",
    draw({ ctx, canvas, t, text, subtitle, fontPx, color, background }) {
      const eased = easeOutCubic(Math.min(1, t * 1.5));
      const barHeight = fontPx * 2.4;
      const barWidth = canvas.width * 0.45 * eased;
      const x = canvas.width * 0.05;
      const y = canvas.height - barHeight - canvas.height * 0.08;
      ctx.save();
      ctx.fillStyle = background;
      ctx.fillRect(x, y, barWidth, barHeight);
      if (eased > 0.6) {
        const textAlpha = (eased - 0.6) / 0.4;
        ctx.globalAlpha = textAlpha;
        ctx.fillStyle = color;
        ctx.textBaseline = "middle";
        ctx.font = `bold ${fontPx}px sans-serif`;
        ctx.fillText(text, x + 16, y + barHeight * 0.35);
        if (subtitle) {
          ctx.font = `${Math.round(fontPx * 0.55)}px sans-serif`;
          ctx.fillText(subtitle, x + 16, y + barHeight * 0.7);
        }
      }
      ctx.restore();
    },
  },
  {
    id: "scale-pop",
    label: "Scale pop",
    draw({ ctx, canvas, t, text, fontPx, color }) {
      const scale = 0.6 + easeOutBack(t) * 0.5;
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(scale, scale);
      ctx.globalAlpha = easeOutQuad(Math.min(1, t * 2));
      ctx.fillStyle = color;
      ctx.font = `bold ${fontPx}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 0, 0);
      ctx.restore();
    },
  },
];

const TITLE_BY_ID = new Map(TITLE_ANIMATIONS.map((t) => [t.id, t]));

registerEffect({
  kind: "title-card",
  label: "Title card",
  category: "title",
  defaults: {
    text: "Your title",
    subtitle: "",
    preset: "fade-in" as TitleAnimationId,
    fontPx: 96,
    color: "#ffffff",
    background: "#0ea5e9",
    /** Normalised time over the clip when the title appears (0 = clip
     *  start, 1 = clip end). Slider in the EffectsPanel exposes both. */
    inAt: 0,
    outAt: 1,
  },
  paramHints: {
    text: { type: "text" },
    subtitle: { type: "text" },
    preset: {
      type: "select",
      options: TITLE_ANIMATIONS.map((t) => ({ value: t.id, label: t.label })),
    },
    fontPx: { type: "number", min: 24, max: 240, step: 1 },
  },
  apply(effect, ctx) {
    const text = stringOr(effect.params.text, "Your title");
    const subtitle = stringOr(effect.params.subtitle, "");
    const presetId = stringOr(effect.params.preset, "fade-in") as TitleAnimationId;
    const fontPx = numberOr(effect.params.fontPx, 96);
    const color = stringOr(effect.params.color, "#ffffff");
    const background = stringOr(effect.params.background, "#0ea5e9");
    const inAt = clamp01(numberOr(effect.params.inAt, 0));
    const outAt = clamp01(numberOr(effect.params.outAt, 1));
    if (outAt <= inAt) return;

    const clipT = ctx.clipDurationFrames > 0
      ? ctx.clipFrame / ctx.clipDurationFrames
      : 0;
    if (clipT < inAt || clipT > outAt) return;

    const localT = (clipT - inAt) / (outAt - inAt);
    const animation = TITLE_BY_ID.get(presetId) ?? TITLE_ANIMATIONS[0];
    animation.draw({
      ctx: ctx.ctx,
      canvas: ctx.canvas,
      t: clamp01(localT),
      text,
      subtitle,
      fontPx,
      color,
      background,
    });
  },
});

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(t: number): number {
  const c = 1.70158;
  const c3 = c + 1;
  const x = t - 1;
  return 1 + c3 * x * x * x + c * x * x;
}
