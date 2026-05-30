/**
 * #655 — Editor-side per-frame canvas overlay for scene effects that
 * can't paint via CSS (vignette / film-grain / chromatic-aberration /
 * sharpen / glitch). Mirrors the export-side `applyWidgetPixelEffects`
 * compositor pattern so editor preview matches what the render pass
 * produces.
 *
 * Pure helpers — the caller mounts a transparent `<canvas/>` on top of
 * the stage and feeds it the active scene's effects list each tick.
 * Effects whose look IS CSS-mappable (blur / drop-shadow) continue to
 * fall through `sceneEffectsToCss` so we don't double-render them.
 */

export type EditorPaintableEffectKind =
  | "vignette"
  | "film_grain"
  | "chromatic_aberration"
  | "sharpen"
  | "glitch";

export interface SceneEffect {
  kind: string;
  params?: Record<string, unknown>;
}

const PAINTABLE_KINDS: EditorPaintableEffectKind[] = [
  "vignette",
  "film_grain",
  "chromatic_aberration",
  "sharpen",
  "glitch",
];

export function paintableEffects(effects: SceneEffect[] | undefined): SceneEffect[] {
  if (!effects?.length) return [];
  return effects.filter((e) => (PAINTABLE_KINDS as string[]).includes(e.kind));
}

/**
 * Apply one or more paintable effects to a `<canvas/>` overlay. The
 * canvas should be the same dimensions as the stage; the overlay paints
 * on top of the source compositing. Uses globalCompositeOperation +
 * source-over for ordering — effects run in the order they appear.
 */
export function applySceneEffectsOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  effects: SceneEffect[],
  sourceCanvas?: CanvasImageSource,
): void {
  ctx.save();
  for (const effect of effects) {
    switch (effect.kind as EditorPaintableEffectKind) {
      case "vignette":
        paintVignette(ctx, width, height, effect.params);
        break;
      case "film_grain":
        paintFilmGrain(ctx, width, height, effect.params);
        break;
      case "chromatic_aberration":
        if (sourceCanvas) paintChromaticAberration(ctx, width, height, sourceCanvas, effect.params);
        break;
      case "sharpen":
        // Sharpen is a convolution — too expensive to run per frame in
        // the editor preview. We surface a "Preview-mode hint: sharpen
        // is applied at export only" badge in the inspector. No-op here.
        break;
      case "glitch":
        paintGlitch(ctx, width, height, effect.params);
        break;
      default:
        break;
    }
  }
  ctx.restore();
}

function num(params: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const v = params?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function paintVignette(ctx: CanvasRenderingContext2D, width: number, height: number, params?: Record<string, unknown>) {
  const intensity = Math.max(0, Math.min(1, num(params, "intensity", 0.5)));
  const radius = num(params, "radius", 0.7);
  const cx = width / 2;
  const cy = height / 2;
  const inner = Math.min(width, height) * radius * 0.5;
  const outer = Math.hypot(width, height) * 0.6;
  const gradient = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, `rgba(0,0,0,${intensity})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function paintFilmGrain(ctx: CanvasRenderingContext2D, width: number, height: number, params?: Record<string, unknown>) {
  const intensity = Math.max(0, Math.min(1, num(params, "intensity", 0.15)));
  // Deterministic-ish noise — generated from a seed so the editor
  // preview matches the export pass within one frame.
  const seed = num(params, "seed", 1);
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  let x = seed * 9301 + 49297;
  for (let i = 0; i < data.length; i += 4) {
    x = (x * 9301 + 49297) % 233280;
    const noise = (x / 233280) * 255;
    data[i] = data[i + 1] = data[i + 2] = noise;
    data[i + 3] = Math.round(intensity * 80);
  }
  ctx.putImageData(imageData, 0, 0);
}

function paintChromaticAberration(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  source: CanvasImageSource,
  params?: Record<string, unknown>,
) {
  const shift = num(params, "shiftPx", 4);
  // Red shifted right, blue shifted left, green centred. CSS filter
  // approximation — the export-side compositor uses a real RGB-split
  // shader; this is the editor preview.
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.45;
  ctx.filter = "saturate(1.2)";
  ctx.drawImage(source, shift, 0, width, height);
  ctx.drawImage(source, -shift, 0, width, height);
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-over";
}

function paintGlitch(ctx: CanvasRenderingContext2D, width: number, height: number, params?: Record<string, unknown>) {
  const sliceHeight = num(params, "sliceHeight", 8);
  const shiftMax = num(params, "shiftMax", 16);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.18;
  for (let y = 0; y < height; y += sliceHeight) {
    const dx = (Math.sin(y * 12.9898) * 43_758.5453) % 1;
    const shift = Math.round((dx * 2 - 1) * shiftMax);
    ctx.fillStyle = `rgba(${Math.floor(80 + dx * 80)},${Math.floor(40 + dx * 60)},${Math.floor(200 + dx * 55)},1)`;
    ctx.fillRect(shift, y, width, sliceHeight);
  }
  ctx.restore();
}
