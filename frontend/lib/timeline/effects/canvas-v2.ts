/**
 * canvas-v2 effects — render-side appliers for the widgets authored in
 * the new Studio editor (see `frontend/pages/studio/v2/`). Every v2
 * widget ends up as a single ClipEffect with a `canvas-v2:` prefix; the
 * appliers below paint the widget's content at its fractional position
 * within the canvas.
 *
 * Position contract: x, y, width, height are 0..1 fractions of the
 * canvas dimensions. Stored that way so the same widget renders the
 * same composition at any output resolution (720p preview, 4K export).
 *
 * Image / video widgets carry their media as a `url` (R2 / blob /
 * remote). To stay synchronous (per the registry contract), the
 * appliers lazy-load into a module-scoped cache. First-frame draws
 * miss the cache and paint nothing for that widget; subsequent frames
 * hit. The render strategy MUST call `preloadCanvasV2Media()` before
 * the encode loop starts so the first frame is correct.
 */

import type { ClipEffect, Timeline } from "@shared/timeline";
import { getEffectDefinition, registerEffect } from "./registry";
import { drawParticleField } from "./particle-field";
import { ANIMATE_EFFECT_KINDS, applyAnimateEffectsToCtx } from "./animate";
import { drawChart } from "@/lib/studio/chart-canvas";
import { filtersToCss, type VideoFilters } from "@/lib/studio/video-filters";
import { resolveCtaFontSizes } from "@/lib/studio/editor-v2/canvas-state";
import {
  estimateVisemesForText,
  getPresenter,
  type Viseme,
} from "@/lib/studio/avatar/presenters";
import { paintPresenter } from "@/lib/studio/avatar/paint";
import {
  getLinkedContentMeta,
  isLinkedContentKind,
  resolveLinkedContentCtaTypography,
  type LinkedContentKind,
  type LinkedContentSummary,
} from "@/lib/studio/editor-v2/linked-content";
import type { ChartType } from "@/types/video-script";
import type { ChartFormat } from "@/lib/studio/chart-data";

/** Normalised entry — the effect chain after legacy-prop synthesis. */
interface ResolvedEffect {
  kind: string;
  params: Record<string, unknown>;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation in degrees, clockwise, around the rect's centre. */
  rotation: number;
}

function readRect(
  params: Record<string, unknown>,
  canvasWidth: number,
  canvasHeight: number,
): Rect {
  return {
    x: numberOr(params.x, 0) * canvasWidth,
    y: numberOr(params.y, 0) * canvasHeight,
    w: numberOr(params.width, 1) * canvasWidth,
    h: numberOr(params.height, 0.1) * canvasHeight,
    rotation: numberOr(params.rotation, 0),
  };
}

/**
 * Apply the rect's centre-origin rotation to the current ctx transform
 * AND fold in the per-widget effect stack so the next draw inherits any
 * CSS-equivalent filter / shadow / alpha. Every canvas-v2 applier
 * brackets its draw in `ctx.save()/restore()` and calls this once
 * before drawing, so the editor's CSS-driven preview and the render-
 * side pixels match without per-applier rotation or effect math.
 *
 * Only the subset of widget effects that maps cleanly onto canvas-2D
 * state is applied here (blur via `ctx.filter`, glow via `shadowBlur`/
 * `shadowColor`, opacity via `globalAlpha`). Full-frame pixel ops
 * (film-grain, glitch, vignette, chromatic-aberration, sharpen, lut,
 * curves, …) need a per-widget offscreen compositor that doesn't
 * exist yet (#643) — they ride along in the saved data so adding the
 * compositor later picks them up without a schema migration.
 */
function applyWidgetCanvasState(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  effects: ResolvedEffect[],
  rect: Rect,
  clipFrame: number,
  clipDurationFrames: number,
  fps: number,
): void {
  // Phase 1 — animate effects mutate transform / alpha based on the
  // clip-local time. Applied FIRST so subsequent rotation composes on
  // top of the animated transform (matches v1's per-frame Ken-Burns
  // matrix ordering). Math lives in `computeAnimateOutput` so the
  // editor preview and the renderer derive from one definition.
  applyAnimateEffectsToCtx(ctx, effects, rect, {
    clipTimeSec: fps > 0 ? clipFrame / fps : 0,
    clipDurationSec: fps > 0 ? clipDurationFrames / fps : 0,
  });
  // Phase 2 — widget rotation (centre-origin).
  if (rect.rotation) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((rect.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  // Phase 3 — CSS-equivalent stack (opacity multiplies the animate
  // fade, so a manual opacity + animate-fade-in compose correctly).
  if (effects.length === 0) return;
  const filters: string[] = [];
  let alpha = 1;
  for (const e of effects) {
    const ep = e.params;
    switch (e.kind) {
      case "opacity": {
        const v = clamp01(numberOr(ep.opacity, 1));
        if (v < 1) alpha *= v;
        break;
      }
      case "blur": {
        const v = clamp01(numberOr(ep.intensity, 0));
        if (v > 0) filters.push(`blur(${Math.round(v * 24)}px)`);
        break;
      }
      case "glow": {
        const v = clamp01(numberOr(ep.intensity, 0));
        if (v > 0) {
          ctx.shadowBlur = Math.round(8 + v * 24);
          ctx.shadowColor = `rgba(255,255,255,${(0.4 + v * 0.4).toFixed(2)})`;
        }
        break;
      }
      default:
        break;
    }
  }
  if (filters.length > 0) ctx.filter = filters.join(" ");
  if (alpha < 1) ctx.globalAlpha *= alpha;
}

/**
 * Normalise a widget's effect chain — coerces saved data into the
 * `{kind, params}` shape applicators expect. Legacy `params.animation`
 * has been lifted into `effects` at hydration (see `timeline-emit.ts`),
 * so this is now a pure shape coercion.
 */
function widgetEffects(params: Record<string, unknown>): ResolvedEffect[] {
  const raw = Array.isArray(params.effects) ? params.effects : [];
  const out: ResolvedEffect[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as { kind?: unknown; params?: unknown };
    if (typeof e.kind !== "string") continue;
    const p = (e.params && typeof e.params === "object" ? e.params : {}) as Record<string, unknown>;
    out.push({ kind: e.kind, params: p });
  }
  return out;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Kinds already folded into `ctx` state by `applyWidgetCanvasState` —
 *  the offscreen pixel pass below skips them so they don't double-apply
 *  (would compound a blur, double-darken an opacity, etc.). Animate
 *  kinds are also skipped: they mutated transform/alpha in the same
 *  pre-paint pass and have no pixel-domain equivalent. */
const CSS_EQUIVALENT_EFFECT_KINDS = new Set(["blur", "glow", "opacity"]);

/**
 * Apply full-frame pixel effects (film-grain, vignette, glitch,
 * chromatic-aberration, sharpen, lut, curves, hsl, color-wheels,
 * mask-*, chroma-key, power-window, …) scoped to a single widget's
 * bounding box. Implements the per-widget offscreen compositor #643
 * gap-registered as remaining work: snapshot the widget's painted
 * region, route the registry's existing canvas-2D appliers against an
 * offscreen sized to the bbox (so their `getImageData(0,0,canvas.w,
 * canvas.h)` calls see only the widget's pixels), then composite the
 * processed offscreen back over the original rect.
 *
 * Skips the CSS-equivalent subset (`blur`/`glow`/`opacity`) — those
 * are already applied via `applyWidgetCanvasState`. Rotated widgets
 * use their axis-aligned bbox; rotation-aware bbox sampling is a
 * fidelity gap noted on #643. Callers invoke once at the END of each
 * widget applier, AFTER `ctx.restore()` has popped the state changes
 * `applyWidgetCanvasState` made.
 */
function applyWidgetPixelEffects(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  effects: ResolvedEffect[],
  rect: Rect,
  timelineFrame: number,
  fps: number,
): void {
  if (effects.length === 0) return;
  const pixelEffects = effects.filter(
    (e) =>
      !CSS_EQUIVALENT_EFFECT_KINDS.has(e.kind) &&
      !ANIMATE_EFFECT_KINDS.has(e.kind),
  );
  if (pixelEffects.length === 0) return;

  // Snapshot region — clamp to canvas bounds so a partly-offscreen
  // widget doesn't blow up `getImageData`. Round to ints; sub-pixel
  // snapshots fail in some browsers.
  const sx = Math.max(0, Math.floor(rect.x));
  const sy = Math.max(0, Math.floor(rect.y));
  const sw = Math.min(canvas.width - sx, Math.ceil(rect.w));
  const sh = Math.min(canvas.height - sy, Math.ceil(rect.h));
  if (sw <= 0 || sh <= 0) return;

  let off: OffscreenCanvas;
  try {
    off = new OffscreenCanvas(sw, sh);
  } catch {
    // Older browsers without OffscreenCanvas — silently skip the pass.
    // (Editor preview is the typical surface; export goes through
    // strategy code that runs in a worker where OffscreenCanvas is
    // available.)
    return;
  }
  const offCtx = off.getContext("2d");
  if (!offCtx) return;
  offCtx.drawImage(
    canvas as CanvasImageSource,
    sx, sy, sw, sh,
    0, 0, sw, sh,
  );

  // Route through the shared registry so adding a new pixel effect
  // automatically participates here too — no per-effect plumbing.
  for (const e of pixelEffects) {
    const def = getEffectDefinition(e.kind);
    if (!def) continue;
    try {
      def.apply(
        { kind: e.kind, params: e.params } as ClipEffect,
        {
          ctx: offCtx,
          canvas: off,
          timelineFrame,
          clipFrame: timelineFrame,
          clipDurationFrames: 1,
          fps,
        },
      );
    } catch {
      // Effect blew up against the offscreen — skip rather than
      // failing the whole frame.
    }
  }

  ctx.save();
  ctx.clearRect(sx, sy, sw, sh);
  ctx.drawImage(off, 0, 0, sw, sh, sx, sy, sw, sh);
  ctx.restore();
}

// ───────────────────────────────────────────────────────────────────────────
// Module-scoped media cache for sourceless image/video widgets.
// ───────────────────────────────────────────────────────────────────────────

const imageCache = new Map<string, HTMLImageElement | "loading" | "failed">();
const videoCache = new Map<string, HTMLVideoElement | "loading" | "failed">();
// Keyed by `${kind}:${id}` — mirrors the `encodeLinkedContentRef` shape
// so future consumers can share the cache key. Populated by the preload
// pass via the registry's `fetchSummary`; null means the entity exists
// but couldn't be fetched (private / deleted / network failure).
const linkedContentCache = new Map<string, LinkedContentSummary | null | "loading">();

function ensureImageLoaded(url: string): HTMLImageElement | null {
  if (!url) return null;
  const cached = imageCache.get(url);
  if (cached instanceof HTMLImageElement) return cached;
  if (cached === "loading" || cached === "failed") return null;
  imageCache.set(url, "loading");
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => imageCache.set(url, img);
  img.onerror = () => imageCache.set(url, "failed");
  img.src = url;
  return null;
}

function ensureVideoLoaded(url: string): HTMLVideoElement | null {
  if (!url) return null;
  const cached = videoCache.get(url);
  if (cached instanceof HTMLVideoElement) return cached;
  if (cached === "loading" || cached === "failed") return null;
  videoCache.set(url, "loading");
  const v = document.createElement("video");
  v.crossOrigin = "anonymous";
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.onloadedmetadata = () => videoCache.set(url, v);
  v.onerror = () => videoCache.set(url, "failed");
  v.src = url;
  return null;
}

/**
 * Pre-warm the media cache for every `canvas-v2:image` / `canvas-v2:video`
 * effect in the timeline. Called by the render strategy before the
 * encode loop so first-frame paints aren't blank.
 *
 * Returns once every referenced image/video has hit HAVE_METADATA, OR
 * a 10-second timeout elapses (whichever first). The timeout is a
 * safety valve — a render shouldn't hang indefinitely on a dead URL.
 */
export async function preloadCanvasV2Media(timeline: Timeline): Promise<void> {
  const imageUrls = new Set<string>();
  const videoUrls = new Set<string>();
  const linkedEntities = new Set<string>();
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      for (const effect of clip.effects ?? []) {
        if (effect.kind === "canvas-v2:image") {
          const url = stringOr(effect.params.url, "");
          if (url) imageUrls.add(url);
        } else if (effect.kind === "canvas-v2:video") {
          const url = stringOr(effect.params.url, "");
          if (url) videoUrls.add(url);
        } else if (effect.kind === "canvas-v2:webcam") {
          const url = stringOr(effect.params.recordingUrl, "");
          if (url) videoUrls.add(url);
        } else if (effect.kind === "canvas-v2:linked-content") {
          const kindRaw = stringOr(effect.params.entityKind, "");
          const id = stringOr(effect.params.entityId, "");
          if (kindRaw && id && isLinkedContentKind(kindRaw)) {
            linkedEntities.add(`${kindRaw}:${id}`);
          }
        }
      }
    }
  }
  const tasks: Promise<unknown>[] = [];
  for (const url of imageUrls) {
    tasks.push(
      new Promise<void>((resolve) => {
        const cached = imageCache.get(url);
        if (cached instanceof HTMLImageElement) return resolve();
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          imageCache.set(url, img);
          resolve();
        };
        img.onerror = () => {
          imageCache.set(url, "failed");
          resolve();
        };
        img.src = url;
        imageCache.set(url, "loading");
      }),
    );
  }
  for (const url of videoUrls) {
    tasks.push(
      new Promise<void>((resolve) => {
        const cached = videoCache.get(url);
        if (cached instanceof HTMLVideoElement) return resolve();
        const v = document.createElement("video");
        v.crossOrigin = "anonymous";
        v.muted = true;
        v.playsInline = true;
        v.preload = "auto";
        v.onloadedmetadata = () => {
          videoCache.set(url, v);
          resolve();
        };
        v.onerror = () => {
          videoCache.set(url, "failed");
          resolve();
        };
        v.src = url;
        videoCache.set(url, "loading");
      }),
    );
  }
  // Linked-content entities — fetch each entity's summary so the
  // canvas-v2:linked-content applier (synchronous, per the registry
  // contract) can paint title + subtitle from cache. Errors collapse
  // to a `null` cache entry which the applier renders as an empty card
  // — never throws.
  for (const key of linkedEntities) {
    if (linkedContentCache.has(key)) continue;
    const sepIdx = key.indexOf(":");
    if (sepIdx <= 0) continue;
    const kind = key.slice(0, sepIdx) as LinkedContentKind;
    const id = key.slice(sepIdx + 1);
    if (!isLinkedContentKind(kind) || !id) continue;
    linkedContentCache.set(key, "loading");
    tasks.push(
      getLinkedContentMeta(kind)
        .fetchSummary(id)
        .then((summary) => {
          linkedContentCache.set(key, summary);
        })
        .catch(() => {
          linkedContentCache.set(key, null);
        }),
    );
  }
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 10_000));
  await Promise.race([Promise.all(tasks), timeout]);
}

// ───────────────────────────────────────────────────────────────────────────
// canvas-v2:background — fills the canvas. V1 background clips carry
// only this effect; widget clips on V2 paint on top.
// ───────────────────────────────────────────────────────────────────────────

registerEffect({
  kind: "canvas-v2:background",
  label: "Scene background",
  category: "transform",
  defaults: { color: "#0f172a" },
  paramHints: { color: { type: "color" } },
  apply(effect, { ctx, canvas, timelineFrame }) {
    const baseColor = stringOr(effect.params.color, "#0f172a");
    // Paint the solid fallback first so any rich-effect path can layer
    // over it; for `solid` / no-effect that's the whole job.
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const effectValue = stringOr(effect.params.backgroundEffect, "");
    if (!effectValue) return;
    paintRichBackground(ctx, canvas, effectValue, baseColor, timelineFrame);
  },
});

// Decode + render the encoded BgPreset.value over the already-painted
// solid bg. Mirrors the editor preview's `SceneBackgroundEffect` so the
// two surfaces produce the same pixels — single seam, both consumers
// stay in lock-step (#649 closure).
function paintRichBackground(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvas: { width: number; height: number },
  effectValue: string,
  baseColor: string,
  timelineFrame: number,
): void {
  const [rawKind, color, color2] = effectValue.split(":");
  const w = canvas.width;
  const h = canvas.height;
  switch (rawKind) {
    case "gradient": {
      const c1 = color ?? "#000000";
      const c2 = color2 ?? c1;
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "dark-tech-grid": {
      const accent = color ?? "#7c3aed";
      ctx.fillStyle = "#0f0f23";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = accent + "33";
      ctx.lineWidth = 1;
      const step = 40;
      for (let x = 0; x <= w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      break;
    }
    case "particles": {
      drawParticleField(ctx, 0, 0, w, h, color ?? "#7c3aed", timelineFrame, {
        baseColor,
      });
      break;
    }
    default:
      // Unknown encoding — fall back to the solid we already painted.
      break;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// canvas-v2:text — positioned text widget with optional background fill.
// ───────────────────────────────────────────────────────────────────────────

registerEffect({
  kind: "canvas-v2:text",
  label: "Text widget",
  category: "title",
  defaults: {
    x: 0,
    y: 0,
    width: 0.4,
    height: 0.15,
    text: "Text",
    fontPx: 32,
    color: "#ffffff",
    fontWeight: "normal",
    align: "left",
    background: null,
  },
  paramHints: {
    color: { type: "color" },
    align: {
      type: "select",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Centre" },
        { value: "right", label: "Right" },
      ],
    },
  },
  apply(effect, { ctx, canvas, timelineFrame, clipFrame, clipDurationFrames, fps }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const effects = widgetEffects(effect.params);
    const { x, y, w, h } = rect;
    const text = stringOr(effect.params.text, "");
    const fontPx = numberOr(effect.params.fontPx, 32);
    const color = stringOr(effect.params.color, "#ffffff");
    const fontWeight = stringOr(effect.params.fontWeight, "normal");
    const align = stringOr(effect.params.align, "left") as "left" | "center" | "right";
    const background = effect.params.background;
    ctx.save();
    applyWidgetCanvasState(ctx, effects, rect, clipFrame, clipDurationFrames, fps);
    if (typeof background === "string" && background) {
      ctx.fillStyle = background;
      ctx.fillRect(x, y, w, h);
    }
    ctx.fillStyle = color;
    ctx.font = `${fontWeight === "bold" ? "bold " : ""}${fontPx}px sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = align;
    const tx = align === "center" ? x + w / 2 : align === "right" ? x + w : x;
    wrapText(ctx, text, tx, y + h / 2, w, fontPx * 1.2);
    ctx.restore();
    applyWidgetPixelEffects(ctx, canvas, effects, rect, timelineFrame, fps);
  },
});

// ───────────────────────────────────────────────────────────────────────────
// canvas-v2:image — positioned image widget. URL-backed.
// ───────────────────────────────────────────────────────────────────────────

registerEffect({
  kind: "canvas-v2:image",
  label: "Image widget",
  category: "transform",
  defaults: { x: 0, y: 0, width: 0.3, height: 0.3, url: "", fit: "cover" },
  paramHints: {
    fit: {
      type: "select",
      options: [
        { value: "cover", label: "Cover" },
        { value: "contain", label: "Contain" },
        { value: "stretch", label: "Stretch" },
      ],
    },
  },
  apply(effect, { ctx, canvas, timelineFrame, clipFrame, clipDurationFrames, fps }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const effects = widgetEffects(effect.params);
    const { x, y, w, h } = rect;
    const url = stringOr(effect.params.url, "");
    if (!url) return;
    const img = ensureImageLoaded(url);
    if (!img) return;
    const fit = stringOr(effect.params.fit, "cover") as "cover" | "contain" | "stretch";
    ctx.save();
    applyWidgetCanvasState(ctx, effects, rect, clipFrame, clipDurationFrames, fps);
    applyWidgetGrade(ctx, effect.params);
    drawWithFit(ctx, img, x, y, w, h, fit, img.naturalWidth, img.naturalHeight);
    ctx.restore();
    applyWidgetPixelEffects(ctx, canvas, effects, rect, timelineFrame, fps);
  },
});

/** Compose a per-widget colour grade (#596/#806) onto the current
 *  `ctx.filter`, preserving any blur/glow `applyWidgetCanvasState`
 *  already set. Identity grades are a no-op, so existing widgets are
 *  unaffected. `ctx.restore()` (called by the applier) clears it. */
function applyWidgetGrade(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  params: Record<string, unknown>,
): void {
  const grade = filtersToCss(params.filters as VideoFilters | null | undefined);
  if (!grade) return;
  const existing = ctx.filter && ctx.filter !== "none" ? `${ctx.filter} ` : "";
  ctx.filter = existing + grade;
}

// ───────────────────────────────────────────────────────────────────────────
// canvas-v2:video — positioned video widget. URL-backed. The renderer
// seeks the video to the clip's local time and snapshots the frame.
// ───────────────────────────────────────────────────────────────────────────

registerEffect({
  kind: "canvas-v2:video",
  label: "Video widget",
  category: "transform",
  defaults: { x: 0, y: 0, width: 0.5, height: 0.5, url: "", muted: false },
  apply(effect, { ctx, canvas, clipFrame, clipDurationFrames, fps, timelineFrame }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    // Per-widget chromaKey is stored on the video widget's params as a
    // typed field (see `VideoWidgetParams.chromaKey`) and emitted as a
    // sibling param on the canvas-v2:video clip effect. We synthesize
    // a `chroma-key` entry into the effect chain so the offscreen pixel
    // pass below routes through the same registered effect every other
    // chroma surface uses — no parallel keying path.
    const effects = widgetEffectsWithChromaSynthesis(effect.params);
    const { x, y, w, h } = rect;
    const url = stringOr(effect.params.url, "");
    if (!url) return;
    const v = ensureVideoLoaded(url);
    if (!v) return;
    const target = clipFrame / fps;
    if (v.duration && Math.abs(v.currentTime - target) > 1 / fps) {
      // Best-effort sync — full seek-on-await would block the synchronous
      // applier contract. Render strategies that need frame-accurate video
      // widgets should pre-seek via a sibling channel; for previews the
      // small drift is acceptable.
      try {
        v.currentTime = Math.min(v.duration, Math.max(0, target));
      } catch {
        // Some browsers throw before metadata fully loads — silent skip.
      }
    }
    ctx.save();
    applyWidgetCanvasState(ctx, effects, rect, clipFrame, clipDurationFrames, fps);
    applyWidgetGrade(ctx, effect.params);
    drawWithFit(ctx, v, x, y, w, h, "cover", v.videoWidth, v.videoHeight);
    ctx.restore();
    applyWidgetPixelEffects(ctx, canvas, effects, rect, timelineFrame, fps);
  },
});

/** Reads the standard `widget.effects[]` chain AND folds a `chroma-key`
 *  effect entry in front of it when the video clip params carry a
 *  typed `chromaKey` block. Keeps the schema clean (chroma is a video-
 *  widget property, not a generic effect users add via the Effects
 *  panel) while routing the actual keying through the shared registered
 *  effect — one keying implementation, one pixel pass. */
function widgetEffectsWithChromaSynthesis(
  params: Record<string, unknown>,
): ResolvedEffect[] {
  const base = widgetEffects(params);
  const ck = params.chromaKey;
  if (!ck || typeof ck !== "object") return base;
  const c = ck as Record<string, unknown>;
  // Skip the synthesis if the keyColor isn't a string — the user hasn't
  // really configured anything and the registered effect would default
  // to bright green which would silently mangle the frame.
  if (typeof c.keyColor !== "string") return base;
  const synth: ResolvedEffect = {
    kind: "chroma-key",
    params: {
      keyColor: c.keyColor,
      threshold: typeof c.threshold === "number" ? c.threshold : 0.4,
      softness: typeof c.softness === "number" ? c.softness : 0.1,
      spillSuppression:
        typeof c.spillSuppression === "number" ? c.spillSuppression : 0.5,
    },
  };
  return [...base, synth];
}

// ───────────────────────────────────────────────────────────────────────────
// canvas-v2:shape-rect / canvas-v2:shape-circle / canvas-v2:divider
// ───────────────────────────────────────────────────────────────────────────

registerEffect({
  kind: "canvas-v2:shape-rect",
  label: "Rectangle",
  category: "transform",
  defaults: {
    x: 0,
    y: 0,
    width: 0.3,
    height: 0.3,
    fill: "#0ea5e9",
    strokeColor: "#ffffff",
    strokeWidth: 0,
    cornerRadius: 8,
  },
  paramHints: {
    fill: { type: "color" },
    strokeColor: { type: "color" },
  },
  apply(effect, { ctx, canvas, timelineFrame, clipFrame, clipDurationFrames, fps }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const effects = widgetEffects(effect.params);
    const { x, y, w, h } = rect;
    const fill = stringOr(effect.params.fill, "#0ea5e9");
    const strokeColor = stringOr(effect.params.strokeColor, "#ffffff");
    const strokeWidth = numberOr(effect.params.strokeWidth, 0);
    const r = Math.min(numberOr(effect.params.cornerRadius, 0), w / 2, h / 2);
    ctx.save();
    applyWidgetCanvasState(ctx, effects, rect, clipFrame, clipDurationFrames, fps);
    drawRoundedRect(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (strokeWidth > 0) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
    }
    ctx.restore();
    applyWidgetPixelEffects(ctx, canvas, effects, rect, timelineFrame, fps);
  },
});

registerEffect({
  kind: "canvas-v2:shape-circle",
  label: "Circle",
  category: "transform",
  defaults: {
    x: 0,
    y: 0,
    width: 0.25,
    height: 0.25,
    fill: "#22c55e",
    strokeColor: "#ffffff",
    strokeWidth: 0,
  },
  paramHints: {
    fill: { type: "color" },
    strokeColor: { type: "color" },
  },
  apply(effect, { ctx, canvas, timelineFrame, clipFrame, clipDurationFrames, fps }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const effects = widgetEffects(effect.params);
    const { x, y, w, h } = rect;
    const fill = stringOr(effect.params.fill, "#22c55e");
    const strokeColor = stringOr(effect.params.strokeColor, "#ffffff");
    const strokeWidth = numberOr(effect.params.strokeWidth, 0);
    ctx.save();
    applyWidgetCanvasState(ctx, effects, rect, clipFrame, clipDurationFrames, fps);
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (strokeWidth > 0) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
    }
    ctx.restore();
    applyWidgetPixelEffects(ctx, canvas, effects, rect, timelineFrame, fps);
  },
});

registerEffect({
  kind: "canvas-v2:divider",
  label: "Divider",
  category: "transform",
  defaults: {
    x: 0,
    y: 0,
    width: 0.6,
    height: 0.02,
    color: "#ffffff",
    thickness: 2,
  },
  paramHints: { color: { type: "color" } },
  apply(effect, { ctx, canvas, timelineFrame, clipFrame, clipDurationFrames, fps }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const effects = widgetEffects(effect.params);
    const { x, y, w, h } = rect;
    const color = stringOr(effect.params.color, "#ffffff");
    const thickness = numberOr(effect.params.thickness, 2);
    ctx.save();
    applyWidgetCanvasState(ctx, effects, rect, clipFrame, clipDurationFrames, fps);
    ctx.fillStyle = color;
    ctx.fillRect(x, y + h / 2 - thickness / 2, w, thickness);
    ctx.restore();
    applyWidgetPixelEffects(ctx, canvas, effects, rect, timelineFrame, fps);
  },
});

// ───────────────────────────────────────────────────────────────────────────
// canvas-v2:chips — pill-shaped labels laid out row or column.
// ───────────────────────────────────────────────────────────────────────────

registerEffect({
  kind: "canvas-v2:chips",
  label: "Chips",
  category: "transform",
  defaults: {
    x: 0,
    y: 0,
    width: 0.6,
    height: 0.2,
    chips: [],
    fontPx: 14,
    fontFamily: "",
    chipColor: "#1e293b",
    textColor: "#f1f5f9",
    direction: "row",
  },
  paramHints: {
    chipColor: { type: "color" },
    textColor: { type: "color" },
    direction: {
      type: "select",
      options: [
        { value: "row", label: "Row" },
        { value: "column", label: "Column" },
      ],
    },
  },
  apply(effect, { ctx, canvas, timelineFrame, clipFrame, clipDurationFrames, fps }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const effects = widgetEffects(effect.params);
    const { x, y, w, h } = rect;
    const chips = Array.isArray(effect.params.chips)
      ? (effect.params.chips as unknown[]).filter((c): c is string => typeof c === "string")
      : [];
    if (chips.length === 0) return;
    const fontPx = numberOr(effect.params.fontPx, 14);
    const fontFamily = stringOr(effect.params.fontFamily, "") || "sans-serif";
    const chipColor = stringOr(effect.params.chipColor, "#1e293b");
    const textColor = stringOr(effect.params.textColor, "#f1f5f9");
    const direction = stringOr(effect.params.direction, "row") === "column" ? "column" : "row";
    ctx.save();
    applyWidgetCanvasState(ctx, effects, rect, clipFrame, clipDurationFrames, fps);
    ctx.font = `${fontPx}px ${fontFamily}`;
    ctx.textBaseline = "middle";
    const padX = Math.round(fontPx * 0.7);
    const padY = Math.round(fontPx * 0.3);
    const gap = Math.round(fontPx * 0.4);
    const chipH = fontPx + padY * 2;
    const radius = chipH / 2;
    if (direction === "column") {
      let cursorY = y;
      for (const chip of chips) {
        if (cursorY + chipH > y + h) break;
        const tw = ctx.measureText(chip).width;
        const chipW = Math.min(w, tw + padX * 2);
        ctx.fillStyle = chipColor;
        drawRoundedRect(ctx, x, cursorY, chipW, chipH, radius);
        ctx.fill();
        ctx.fillStyle = textColor;
        ctx.textAlign = "left";
        ctx.fillText(chip, x + padX, cursorY + chipH / 2);
        cursorY += chipH + gap;
      }
    } else {
      let cursorX = x;
      let cursorY = y;
      for (const chip of chips) {
        const tw = ctx.measureText(chip).width;
        const chipW = Math.min(w, tw + padX * 2);
        // Wrap to a new row when the next chip would overflow the bbox width.
        if (cursorX + chipW > x + w && cursorX > x) {
          cursorX = x;
          cursorY += chipH + gap;
        }
        if (cursorY + chipH > y + h) break;
        ctx.fillStyle = chipColor;
        drawRoundedRect(ctx, cursorX, cursorY, chipW, chipH, radius);
        ctx.fill();
        ctx.fillStyle = textColor;
        ctx.textAlign = "left";
        ctx.fillText(chip, cursorX + padX, cursorY + chipH / 2);
        cursorX += chipW + gap;
      }
    }
    ctx.restore();
    applyWidgetPixelEffects(ctx, canvas, effects, rect, timelineFrame, fps);
  },
});

// ───────────────────────────────────────────────────────────────────────────
// canvas-v2:chart — delegates to the shared `drawChart` so editor preview
// and export produce identical pixels (same DRY seam used by V1 charts).
// ───────────────────────────────────────────────────────────────────────────

registerEffect({
  kind: "canvas-v2:chart",
  label: "Chart",
  category: "transform",
  defaults: {
    x: 0,
    y: 0,
    width: 0.5,
    height: 0.4,
    chartType: "bar",
    data: "",
    format: "csv",
    title: "",
    takeaway: "",
    colors: [],
  },
  apply(effect, { ctx, canvas, timelineFrame, clipFrame, clipDurationFrames, fps }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const effects = widgetEffects(effect.params);
    const { x, y, w, h } = rect;
    const chartType = stringOr(effect.params.chartType, "bar") as ChartType;
    const data = stringOr(effect.params.data, "");
    const formatRaw = stringOr(effect.params.format, "csv");
    const format = (formatRaw === "tsv" || formatRaw === "json" ? formatRaw : "csv") as ChartFormat;
    const title = stringOr(effect.params.title, "");
    const takeaway = stringOr(effect.params.takeaway, "");
    const colors = Array.isArray(effect.params.colors)
      ? (effect.params.colors as unknown[]).filter((c): c is string => typeof c === "string")
      : undefined;
    ctx.save();
    applyWidgetCanvasState(ctx, effects, rect, clipFrame, clipDurationFrames, fps);
    drawChart(ctx, {
      chartType,
      data,
      format,
      x,
      y,
      w,
      h,
      title: title || undefined,
      takeaway: takeaway || undefined,
      colors,
      foreground: "#ffffff",
    });
    ctx.restore();
    applyWidgetPixelEffects(ctx, canvas, effects, rect, timelineFrame, fps);
  },
});

// ───────────────────────────────────────────────────────────────────────────
// canvas-v2:webcam — recorded video clip with optional horizontal mirror.
// Lives on the same video-cache as canvas-v2:video; the registry calls
// `preloadCanvasV2Media` doesn't know about webcam URLs, so this kind is
// gap-registered for pre-warm (#656) — the first frame paints empty.
// ───────────────────────────────────────────────────────────────────────────

registerEffect({
  kind: "canvas-v2:webcam",
  label: "Webcam",
  category: "transform",
  defaults: {
    x: 0,
    y: 0,
    width: 0.4,
    height: 0.4,
    recordingUrl: "",
    mirror: true,
    muted: true,
  },
  apply(effect, { ctx, canvas, clipFrame, clipDurationFrames, fps, timelineFrame }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const effects = widgetEffects(effect.params);
    const { x, y, w, h } = rect;
    const url = stringOr(effect.params.recordingUrl, "");
    const mirror = effect.params.mirror !== false;
    ctx.save();
    applyWidgetCanvasState(ctx, effects, rect, clipFrame, clipDurationFrames, fps);
    if (!url) {
      // No recording yet — draw the placeholder card so the layout
      // still reflects where the webcam will land.
      ctx.fillStyle = "rgba(20,20,28,0.6)";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#94a3b8";
      ctx.font = `${Math.max(10, Math.round(h * 0.08))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Webcam placeholder", x + w / 2, y + h / 2);
      ctx.restore();
      applyWidgetPixelEffects(ctx, canvas, effects, rect, timelineFrame, fps);
      return;
    }
    const v = ensureVideoLoaded(url);
    if (!v) {
      ctx.restore();
      return;
    }
    const target = clipFrame / fps;
    if (v.duration && Math.abs(v.currentTime - target) > 1 / fps) {
      try {
        v.currentTime = Math.min(v.duration, Math.max(0, target));
      } catch {
        // Browser threw before metadata loaded — silent skip.
      }
    }
    if (mirror) {
      // Flip horizontally around the rect centre. The save() above
      // captures the transform, so restore() unwinds it.
      ctx.translate(x + w / 2, 0);
      ctx.scale(-1, 1);
      ctx.translate(-(x + w / 2), 0);
    }
    drawWithFit(ctx, v, x, y, w, h, "cover", v.videoWidth, v.videoHeight);
    ctx.restore();
    applyWidgetPixelEffects(ctx, canvas, effects, rect, timelineFrame, fps);
  },
});

// ───────────────────────────────────────────────────────────────────────────
// canvas-v2:cta — end-card with headline + subheadline + button.
// ───────────────────────────────────────────────────────────────────────────

registerEffect({
  kind: "canvas-v2:cta",
  label: "CTA card",
  category: "title",
  defaults: {
    x: 0.15,
    y: 0.3,
    width: 0.7,
    height: 0.4,
    headline: "Let's talk",
    subheadline: "",
    ctaText: "Learn more",
    ctaUrl: "",
    bgColor: "#0f172a",
    textColor: "#f8fafc",
    accentColor: "#7c3aed",
    accentTextColor: "#ffffff",
    cardFontPx: 24,
    ctaFontPx: 14,
  },
  paramHints: {
    bgColor: { type: "color" },
    textColor: { type: "color" },
    accentColor: { type: "color" },
    accentTextColor: { type: "color" },
  },
  apply(effect, { ctx, canvas, timelineFrame, clipFrame, clipDurationFrames, fps }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const effects = widgetEffects(effect.params);
    const { x, y, w, h } = rect;
    const headline = stringOr(effect.params.headline, "");
    const subheadline = stringOr(effect.params.subheadline, "");
    const ctaText = stringOr(effect.params.ctaText, "Call to action");
    const bgColor = stringOr(effect.params.bgColor, "#0f172a");
    const textColor = stringOr(effect.params.textColor, "#f8fafc");
    const accentColor = stringOr(effect.params.accentColor, "#7c3aed");
    const accentTextColor = stringOr(effect.params.accentTextColor, "#ffffff");
    const rawCard = typeof effect.params.cardFontPx === "number" ? effect.params.cardFontPx : undefined;
    const rawCta = typeof effect.params.ctaFontPx === "number" ? effect.params.ctaFontPx : undefined;
    // Shared resolver — same headline/sub/button policy as the DOM
    // preview in CanvasStage so the editor preview and the rendered
    // pixels can't drift.
    const fontSizes = resolveCtaFontSizes(rawCard, rawCta);
    ctx.save();
    applyWidgetCanvasState(ctx, effects, rect, clipFrame, clipDurationFrames, fps);
    // Card body with rounded corners.
    const radius = Math.min(24, Math.min(w, h) * 0.08);
    ctx.fillStyle = bgColor;
    drawRoundedRect(ctx, x, y, w, h, radius);
    ctx.fill();
    // Layout: headline (top centre), subheadline (below), button (bottom).
    const padding = Math.round(Math.min(w, h) * 0.08);
    const headlineFontPx = fontSizes.headline;
    const subFontPx = fontSizes.subheadline;
    const buttonFontPx = fontSizes.button;
    const buttonH = buttonFontPx + Math.round(buttonFontPx * 1.1);
    const buttonY = y + h - padding - buttonH;
    ctx.fillStyle = textColor;
    ctx.font = `bold ${headlineFontPx}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(headline, x + w / 2, y + padding, w - padding * 2);
    if (subheadline) {
      ctx.font = `${subFontPx}px sans-serif`;
      ctx.globalAlpha = 0.8;
      ctx.fillText(
        subheadline,
        x + w / 2,
        y + padding + headlineFontPx + Math.round(subFontPx * 0.4),
        w - padding * 2,
      );
      ctx.globalAlpha = 1;
    }
    // Pill button.
    ctx.font = `bold ${buttonFontPx}px sans-serif`;
    const buttonText = ctaText || "Call to action";
    const buttonTextW = ctx.measureText(buttonText).width;
    const buttonW = Math.min(w - padding * 2, buttonTextW + buttonFontPx * 2);
    const buttonX = x + (w - buttonW) / 2;
    ctx.fillStyle = accentColor;
    drawRoundedRect(ctx, buttonX, buttonY, buttonW, buttonH, buttonH / 2);
    ctx.fill();
    ctx.fillStyle = accentTextColor;
    ctx.textBaseline = "middle";
    ctx.fillText(buttonText, x + w / 2, buttonY + buttonH / 2);
    ctx.restore();
    applyWidgetPixelEffects(ctx, canvas, effects, rect, timelineFrame, fps);
  },
});

// ───────────────────────────────────────────────────────────────────────────
// canvas-v2:linked-content — embed a user's resume / job / article /
// profile / company / video as a card on the canvas. The editor preview
// path mounts the entity's OWN React renderer via `LinkedContentBody`;
// the render path can't do that (canvas-only, no React), so this
// applier draws a thumbnail card with title + subtitle + a CTA pill.
//
// Entity data is fetched in `preloadCanvasV2Media`'s preload pass and
// stashed in `linkedContentCache` so this applier stays synchronous
// per the registry contract. Cache miss / fetch failure renders the
// neutral empty card — never throws.
//
// Resolves the architectural half of gap #813 (the registry now has
// the applier). Full pixel-parity with `<LinkedContentBody>` (running
// each entity's full template renderer through canvas) is a separate
// fidelity gap — drawing this thumbnail is the export-completeness
// fix; deeper rendering rides on the canvas-side template renderer
// being available later.
// ───────────────────────────────────────────────────────────────────────────

registerEffect({
  kind: "canvas-v2:linked-content",
  label: "Linked content card",
  category: "title",
  defaults: {
    x: 0.15,
    y: 0.2,
    width: 0.7,
    height: 0.6,
    entityKind: "resume",
    entityId: "",
    bgColor: "#ffffff",
    textColor: "#0f172a",
    mutedColor: "#64748b",
    accentColor: "#4f46e5",
    accentTextColor: "#ffffff",
  },
  paramHints: {
    bgColor: { type: "color" },
    textColor: { type: "color" },
    mutedColor: { type: "color" },
    accentColor: { type: "color" },
    accentTextColor: { type: "color" },
  },
  apply(effect, { ctx, canvas, timelineFrame, clipFrame, clipDurationFrames, fps }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const effects = widgetEffects(effect.params);
    const { x, y, w, h } = rect;
    const kindRaw = stringOr(effect.params.entityKind, "resume");
    const entityId = stringOr(effect.params.entityId, "");
    const bgColor = stringOr(effect.params.bgColor, "#ffffff");
    const textColor = stringOr(effect.params.textColor, "#0f172a");
    const mutedColor = stringOr(effect.params.mutedColor, "#64748b");
    const accentColor = stringOr(effect.params.accentColor, "#4f46e5");
    const accentTextColor = stringOr(effect.params.accentTextColor, "#ffffff");

    ctx.save();
    applyWidgetCanvasState(ctx, effects, rect, clipFrame, clipDurationFrames, fps);

    const radius = Math.min(24, Math.min(w, h) * 0.08);
    ctx.fillStyle = bgColor;
    drawRoundedRect(ctx, x, y, w, h, radius);
    ctx.fill();

    const padding = Math.round(Math.min(w, h) * 0.07);
    const cacheKey = isLinkedContentKind(kindRaw) && entityId ? `${kindRaw}:${entityId}` : null;
    const cached = cacheKey ? linkedContentCache.get(cacheKey) : undefined;
    const summary =
      cached && cached !== "loading" ? cached : null;
    const kindLabel = isLinkedContentKind(kindRaw)
      ? getLinkedContentMeta(kindRaw).label
      : "Linked content";
    // CTA typography goes through the shared resolver so the DOM
    // `<CtaPill>` (LinkedContentBody.tsx) and this canvas-2D painter
    // can't drift on what the pill says or what font it's set in.
    const ctaTypography = isLinkedContentKind(kindRaw)
      ? resolveLinkedContentCtaTypography(kindRaw, {
          ctaText: stringOr(effect.params.ctaText, ""),
          ctaFontPx:
            typeof effect.params.ctaFontPx === "number"
              ? effect.params.ctaFontPx
              : undefined,
          ctaFontWeight:
            effect.params.ctaFontWeight === "normal" ? "normal" : "bold",
          ctaFontFamily: stringOr(effect.params.ctaFontFamily, ""),
        })
      : {
          label: stringOr(effect.params.ctaText, "Open"),
          fontPx: null,
          fontWeight: "bold" as const,
          fontFamily: "sans-serif",
        };
    const ctaLabel = ctaTypography.label;

    // Kind label (small, muted) — anchors the card so viewers see
    // "Resume / Job / Article" before the title.
    const kindFontPx = Math.max(11, Math.round(Math.min(w, h) * 0.05));
    ctx.font = `600 ${kindFontPx}px sans-serif`;
    ctx.fillStyle = mutedColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(kindLabel.toUpperCase(), x + padding, y + padding, w - padding * 2);

    // Title — bold, primary text colour. Cursor advances by the ACTUAL
    // number of wrapped lines so the subtitle below never collides with
    // a multi-line title.
    const titleFontPx = Math.max(18, Math.round(Math.min(w, h) * 0.11));
    const titleLineH = titleFontPx * 1.2;
    ctx.font = `bold ${titleFontPx}px sans-serif`;
    ctx.fillStyle = textColor;
    const titleY = y + padding + kindFontPx + Math.round(kindFontPx * 0.4);
    const title = summary?.title ?? (entityId ? `Loading ${kindLabel.toLowerCase()}…` : `No ${kindLabel.toLowerCase()} selected`);
    const titleLines = wrapText(ctx, title, x + padding, titleY + titleFontPx / 2, w - padding * 2, titleLineH);
    const titleBlockH = Math.max(1, titleLines) * titleLineH;

    // Subtitle — muted, optional. Anchored below the actual title block,
    // not its single-line projection.
    const subFontPx = Math.max(13, Math.round(titleFontPx * 0.55));
    const subLineH = subFontPx * 1.3;
    let cursorY = titleY + titleBlockH + Math.round(subFontPx * 0.3);
    if (summary?.subtitle) {
      ctx.font = `${subFontPx}px sans-serif`;
      ctx.fillStyle = mutedColor;
      const subLines = wrapText(
        ctx,
        summary.subtitle,
        x + padding,
        cursorY + subFontPx / 2,
        w - padding * 2,
        subLineH,
      );
      cursorY += Math.max(1, subLines) * subLineH + Math.round(subFontPx * 0.4);
    }

    // CTA pill at bottom-right — computed first so body lines can stop
    // above it without overlap. Author override (ctaTypography.fontPx)
    // wins; otherwise we fall back to the bounding-box heuristic so
    // un-customised pills keep their current scale-with-card behaviour.
    const ctaFontPx =
      ctaTypography.fontPx ??
      Math.max(12, Math.round(Math.min(w, h) * 0.06));
    const ctaFontWeight = ctaTypography.fontWeight;
    const ctaFontFamily = ctaTypography.fontFamily;
    ctx.font = `${ctaFontWeight} ${ctaFontPx}px ${ctaFontFamily}`;
    const ctaPadX = ctaFontPx;
    const ctaH = ctaFontPx + Math.round(ctaFontPx * 1.1);
    const ctaTextW = ctx.measureText(ctaLabel).width;
    const ctaW = ctaTextW + ctaPadX * 2;
    const ctaX = x + w - padding - ctaW;
    const ctaY = y + h - padding - ctaH;

    // Body bullets — drawn between subtitle and CTA. Each line wraps
    // within the card width. Cursor advances by the ACTUAL line count
    // wrapText consumed (returned from the helper) so a bullet that
    // wraps to N visual rows pushes the next bullet down by N rows
    // instead of the previous `Math.ceil(width / maxWidth)` estimate,
    // which underestimated whenever word boundaries forced an early
    // wrap and caused the next bullet to overprint the last visual
    // row of the previous one.
    const bodyFontPx = Math.max(12, Math.round(titleFontPx * 0.46));
    const bodyLineH = bodyFontPx * 1.35;
    const bodyMaxY = ctaY - padding * 0.8;
    if (summary?.body && summary.body.length > 0) {
      ctx.font = `${bodyFontPx}px sans-serif`;
      ctx.fillStyle = textColor;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      for (const line of summary.body) {
        if (cursorY + bodyLineH > bodyMaxY) break;
        const usedLines = wrapText(
          ctx,
          line,
          x + padding,
          cursorY + bodyFontPx / 2,
          w - padding * 2,
          bodyLineH,
        );
        cursorY += Math.max(1, usedLines) * bodyLineH;
      }
    }

    // Badge chips — pill row above the CTA. Wraps to a second row if
    // there's vertical room; truncates otherwise.
    if (summary?.badges && summary.badges.length > 0) {
      const chipFontPx = Math.max(11, Math.round(bodyFontPx * 0.85));
      ctx.font = `600 ${chipFontPx}px sans-serif`;
      const chipPadX = Math.round(chipFontPx * 0.6);
      const chipPadY = Math.round(chipFontPx * 0.3);
      const chipGap = Math.round(chipFontPx * 0.4);
      const chipH = chipFontPx + chipPadY * 2;
      const chipsBottomY = ctaY - padding * 0.4;
      const chipsStartY = Math.max(cursorY + bodyLineH * 0.5, chipsBottomY - chipH);
      let chipX = x + padding;
      const chipY = chipsStartY;
      for (const badge of summary.badges) {
        const textW = ctx.measureText(badge).width;
        const chipW = textW + chipPadX * 2;
        if (chipX + chipW > ctaX - chipGap) break;
        ctx.fillStyle = mutedColor;
        ctx.globalAlpha = 0.18;
        drawRoundedRect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = textColor;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(badge, chipX + chipPadX, chipY + chipH / 2);
        chipX += chipW + chipGap;
      }
    }

    // Draw the CTA pill last so it sits over everything else. Font is
    // already set above when measuring; restore it here in case body
    // bullets or badges reset the context.
    ctx.font = `${ctaFontWeight} ${ctaFontPx}px ${ctaFontFamily}`;
    ctx.fillStyle = accentColor;
    drawRoundedRect(ctx, ctaX, ctaY, ctaW, ctaH, ctaH / 2);
    ctx.fill();
    ctx.fillStyle = accentTextColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ctaLabel, ctaX + ctaW / 2, ctaY + ctaH / 2);

    ctx.restore();
    applyWidgetPixelEffects(ctx, canvas, effects, rect, timelineFrame, fps);
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Helpers — shared by every applier above so width/height/fit math
// doesn't drift across effects.
// ───────────────────────────────────────────────────────────────────────────

function drawWithFit(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  fit: "cover" | "contain" | "stretch",
  sourceWidth: number,
  sourceHeight: number,
): void {
  if (!sourceWidth || !sourceHeight || fit === "stretch") {
    ctx.drawImage(source, x, y, w, h);
    return;
  }
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = w / h;
  let dw: number, dh: number, dx: number, dy: number;
  if (fit === "cover") {
    if (sourceRatio > targetRatio) {
      dh = h;
      dw = h * sourceRatio;
      dx = x + (w - dw) / 2;
      dy = y;
    } else {
      dw = w;
      dh = w / sourceRatio;
      dx = x;
      dy = y + (h - dh) / 2;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(source, dx, dy, dw, dh);
    ctx.restore();
  } else {
    if (sourceRatio > targetRatio) {
      dw = w;
      dh = w / sourceRatio;
      dx = x;
      dy = y + (h - dh) / 2;
    } else {
      dh = h;
      dw = h * sourceRatio;
      dx = x + (w - dw) / 2;
      dy = y;
    }
    ctx.drawImage(source, dx, dy, dw, dh);
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Greedy word-wrap onto the canvas. Returns the number of visual lines
 * the text consumed so callers can advance their layout cursor by the
 * actual amount (not a heuristic). The previous `Math.ceil(width/maxWidth)`
 * estimate undercounted whenever wrapping broke earlier than perfect
 * packing (long word didn't fit) — that's what made resume bullets
 * overlap the next line in the linked-content card.
 */
function wrapText(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return 0;
  let line = "";
  let cursorY = y;
  let lineCount = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      lineCount++;
      line = word;
      cursorY += lineHeight;
    } else {
      line = candidate;
    }
  }
  if (line) {
    ctx.fillText(line, x, cursorY);
    lineCount++;
  }
  return lineCount;
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

// ───────────────────────────────────────────────────────────────────────────
// Comic widget appliers (#939 Phase 2). The editor's DOM preview path
// renders these via React; the canvas-2D render path needs equivalent
// pixel logic so motion-comic exports (mp4 / gif) draw them faithfully
// instead of as no-op rects.
//
// Three primitives:
//   - `canvas-v2:speech-bubble` — rounded rect with a tail polygon
//     pointing toward `tailX / tailY` (fractional, 0..1 like the rect).
//   - `canvas-v2:caption-box` — bordered rect with italic-flagged text.
//   - `canvas-v2:sfx-burst` — star / jagged / lightning shape with a
//     short text label centred inside.
//
// Per the DRY rule: text-wrap goes through the existing `wrapAndPaint`
// path the v2 text/cta appliers already use (line breaks + ellipsis
// for overflow). Shape paths are inline because they're each a few
// trig lines; no extra primitives module needed yet.
// ───────────────────────────────────────────────────────────────────────────

registerEffect({
  kind: "canvas-v2:speech-bubble",
  label: "Speech bubble",
  category: "title",
  defaults: {
    x: 0.5,
    y: 0.2,
    width: 0.35,
    height: 0.18,
    bubbleColor: "#ffffff",
    strokeColor: "#0f172a",
    strokeWidth: 3,
    textColor: "#0f172a",
    text: "Hello!",
    fontPx: 24,
    fontFamily: "sans-serif",
    fontWeight: "bold",
    // Tail anchor — fractional canvas coords for the tail tip. The
    // tail base sits at the bubble's bottom edge; this is where the
    // pointed end lands (typically over a character's mouth).
    tailX: 0.55,
    tailY: 0.42,
  },
  paramHints: {
    bubbleColor: { type: "color" },
    strokeColor: { type: "color" },
    textColor:   { type: "color" },
  },
  apply(effect, { ctx, canvas, timelineFrame, clipFrame, clipDurationFrames, fps }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const effects = widgetEffects(effect.params);
    ctx.save();
    applyWidgetCanvasState(ctx, effects, rect, clipFrame, clipDurationFrames, fps);

    const { x, y, w, h } = rect;
    const radius = Math.min(24, Math.min(w, h) * 0.18);
    const tailX = numberOr(effect.params.tailX, 0.5) * canvas.width;
    const tailY = numberOr(effect.params.tailY, (rect.y + rect.h) / canvas.height + 0.05) * canvas.height;
    // Tail base anchor — clamp to a point along the bubble's bottom
    // edge that's inside the rounded-corner region.
    const baseX = Math.max(x + radius, Math.min(x + w - radius, tailX));
    const baseY = y + h;
    const baseHalfWidth = Math.max(4, Math.min(w * 0.1, 14));

    // Combined bubble + tail as one closed path so the stroke wraps
    // both consistently.
    ctx.fillStyle = stringOr(effect.params.bubbleColor, "#ffffff");
    ctx.strokeStyle = stringOr(effect.params.strokeColor, "#0f172a");
    ctx.lineWidth = numberOr(effect.params.strokeWidth, 3);
    ctx.lineJoin = "round";
    ctx.beginPath();
    // Rounded rect path
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y, x + w, y + radius, radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    // Walk along the bottom toward the tail, jog out and back.
    ctx.lineTo(baseX + baseHalfWidth, y + h);
    ctx.lineTo(tailX, tailY);
    ctx.lineTo(baseX - baseHalfWidth, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.arcTo(x, y + h, x, y + h - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Text content — center-aligned, vertically centered in the
    // rounded-rect portion (above the tail).
    const fontPx = numberOr(effect.params.fontPx, 24);
    const weight = stringOr(effect.params.fontWeight, "bold");
    const family = stringOr(effect.params.fontFamily, "sans-serif");
    ctx.font = `${weight === "normal" ? "400" : "700"} ${fontPx}px ${family}`;
    ctx.fillStyle = stringOr(effect.params.textColor, "#0f172a");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const text = stringOr(effect.params.text, "");
    wrapText(ctx, text, x + w / 2, y + h / 2, w - 32, fontPx * 1.2);

    ctx.restore();
    applyWidgetPixelEffects(ctx, canvas, effects, rect, timelineFrame, fps);
  },
});

registerEffect({
  kind: "canvas-v2:caption-box",
  label: "Caption box",
  category: "title",
  defaults: {
    x: 0.1,
    y: 0.85,
    width: 0.8,
    height: 0.1,
    bgColor: "#fef9c3", // pale yellow — classic comic narration box
    strokeColor: "#0f172a",
    strokeWidth: 2,
    textColor: "#0f172a",
    text: "Meanwhile, in the city below…",
    fontPx: 18,
    fontFamily: "Georgia, serif",
    italic: true,
  },
  paramHints: {
    bgColor:     { type: "color" },
    strokeColor: { type: "color" },
    textColor:   { type: "color" },
  },
  apply(effect, { ctx, canvas, timelineFrame, clipFrame, clipDurationFrames, fps }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const effects = widgetEffects(effect.params);
    ctx.save();
    applyWidgetCanvasState(ctx, effects, rect, clipFrame, clipDurationFrames, fps);

    const { x, y, w, h } = rect;
    const bg = stringOr(effect.params.bgColor, "#fef9c3");
    const stroke = stringOr(effect.params.strokeColor, "#0f172a");
    const strokeWidth = numberOr(effect.params.strokeWidth, 2);
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.strokeRect(x, y, w, h);

    const fontPx = numberOr(effect.params.fontPx, 18);
    const italic = effect.params.italic !== false;
    const family = stringOr(effect.params.fontFamily, "Georgia, serif");
    ctx.font = `${italic ? "italic " : ""}500 ${fontPx}px ${family}`;
    ctx.fillStyle = stringOr(effect.params.textColor, "#0f172a");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const text = stringOr(effect.params.text, "");
    wrapText(ctx, text, x + w / 2, y + h / 2, w - 24, fontPx * 1.3);

    ctx.restore();
    applyWidgetPixelEffects(ctx, canvas, effects, rect, timelineFrame, fps);
  },
});

registerEffect({
  kind: "canvas-v2:sfx-burst",
  label: "SFX burst",
  category: "title",
  defaults: {
    x: 0.55,
    y: 0.55,
    width: 0.25,
    height: 0.25,
    shape: "star", // "star" | "jagged" | "lightning"
    fillColor: "#facc15",
    strokeColor: "#0f172a",
    strokeWidth: 3,
    textColor: "#0f172a",
    text: "BOOM!",
    fontPx: 32,
    fontFamily: "Impact, sans-serif",
    rotation: 12, // SFX bursts typically tilt for energy
  },
  paramHints: {
    fillColor:   { type: "color" },
    strokeColor: { type: "color" },
    textColor:   { type: "color" },
  },
  apply(effect, { ctx, canvas, timelineFrame, clipFrame, clipDurationFrames, fps }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const effects = widgetEffects(effect.params);
    ctx.save();
    applyWidgetCanvasState(ctx, effects, rect, clipFrame, clipDurationFrames, fps);

    const { x, y, w, h } = rect;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const radiusOuter = Math.min(w, h) / 2;
    const radiusInner = radiusOuter * 0.55;
    const shape = stringOr(effect.params.shape, "star");
    const fill = stringOr(effect.params.fillColor, "#facc15");
    const stroke = stringOr(effect.params.strokeColor, "#0f172a");
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = numberOr(effect.params.strokeWidth, 3);
    ctx.lineJoin = "round";

    ctx.beginPath();
    if (shape === "lightning") {
      // Two-bolt zigzag inscribed in the bbox.
      ctx.moveTo(cx - radiusOuter * 0.3, y);
      ctx.lineTo(cx + radiusOuter * 0.4, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + radiusOuter * 0.5, y + h);
      ctx.lineTo(cx - radiusOuter * 0.4, cy + radiusOuter * 0.2);
      ctx.lineTo(cx + radiusOuter * 0.1, cy + radiusOuter * 0.1);
      ctx.closePath();
    } else {
      // Star / jagged — N-pointed star with alternating inner/outer
      // radii. Star = 12 points (classic comic "POW"), jagged = 24
      // (more chaotic). Both rotate by the param's rotation (which
      // applyWidgetCanvasState already baked into ctx).
      const pointCount = shape === "jagged" ? 24 : 12;
      for (let i = 0; i < pointCount * 2; i++) {
        const r = i % 2 === 0 ? radiusOuter : radiusInner;
        const angle = (i / (pointCount * 2)) * Math.PI * 2 - Math.PI / 2;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();

    // Label centered inside the star/burst.
    const fontPx = numberOr(effect.params.fontPx, 32);
    const family = stringOr(effect.params.fontFamily, "Impact, sans-serif");
    ctx.font = `900 ${fontPx}px ${family}`;
    ctx.fillStyle = stringOr(effect.params.textColor, "#0f172a");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(stringOr(effect.params.text, ""), cx, cy);

    ctx.restore();
    applyWidgetPixelEffects(ctx, canvas, effects, rect, timelineFrame, fps);
  },
});

// ───────────────────────────────────────────────────────────────────────────
// canvas-v2:avatar — AI presenter avatar (#1557). Painted via the
// programmatic painter in `lib/studio/avatar/paint.ts`. Visemes are
// estimated from the script (one per word) and indexed against the
// clip-local time so the mouth shape advances roughly in step with
// a synchronously-rendered TTS audio track on the same scene.
// ───────────────────────────────────────────────────────────────────────────

registerEffect({
  kind: "canvas-v2:avatar",
  label: "AI presenter avatar",
  category: "transform",
  defaults: {
    x: 0.6,
    y: 0.1,
    width: 0.35,
    height: 0.8,
    presenterId: "presenter-amber",
    script: "",
    speed: 1,
  },
  apply(effect, { ctx, canvas, timelineFrame, clipFrame, clipDurationFrames, fps }) {
    const rect = readRect(effect.params, canvas.width, canvas.height);
    const effects = widgetEffects(effect.params);
    const { x, y, w, h } = rect;
    const presenter = getPresenter(stringOr(effect.params.presenterId, ""));
    const script = stringOr(effect.params.script, "");
    const speed = numberOr(effect.params.speed, 1);

    const viseme: Viseme = resolveVisemeFromTime(
      script,
      speed,
      clipFrame,
      clipDurationFrames,
      fps,
    );

    ctx.save();
    applyWidgetCanvasState(ctx, effects, rect, clipFrame, clipDurationFrames, fps);
    paintPresenter(ctx, presenter, viseme, { x, y, w, h });
    ctx.restore();
    applyWidgetPixelEffects(ctx, canvas, effects, rect, timelineFrame, fps);
  },
});

/** Pick the active viseme for a given clip-local frame. The audio
 *  rendering pass owes us a parallel TTS track of `script`; we estimate
 *  ~3 words per second as the natural delivery rate, scaled by `speed`,
 *  and index the viseme array against the elapsed seconds. Falls back to
 *  the rest viseme when the script is empty or playback is past the
 *  estimated speak duration. */
function resolveVisemeFromTime(
  script: string,
  speed: number,
  clipFrame: number,
  clipDurationFrames: number,
  fps: number,
): Viseme {
  if (!script || fps <= 0) return "rest";
  const visemes = estimateVisemesForText(script);
  if (visemes.length === 0) return "rest";

  const elapsedSec = clipFrame / fps;
  const wordsPerSec = 3 * Math.max(0.5, speed);
  const wordIdx = Math.floor(elapsedSec * wordsPerSec);
  if (wordIdx >= visemes.length) return "rest";
  return visemes[wordIdx];
}
