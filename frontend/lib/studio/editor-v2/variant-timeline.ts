/**
 * Fitted cuts for per-network publishing (#2045) — pure.
 *
 *   variantFrame        the output size of a cut in another aspect: the
 *                       master's short side is kept (1920x1080 → 1080x1920,
 *                       1080x1080, 1080x1350), rounded to even pixels for H.264
 *   reframeCanvasState  the same composition on that frame. Every widget's
 *                       rect is mapped about the frame centre:
 *                         • full-bleed widgets (a background video / image
 *                           covering the frame) use COVER — scaled up until
 *                           the new frame is filled, overflow cropped;
 *                         • everything else uses FIT (contain) — the whole
 *                           layout scales down to fit and is centred, so no
 *                           text or CTA is cut off.
 *                       Pixel-sized params (font sizes, strokes, corner radii,
 *                       container chrome) scale with their widget's rect, so
 *                       text keeps its line breaks.
 *   trimTimeline        the emitted Timeline cut at N seconds: clips past the
 *                       cut are dropped, a clip that crosses it is shortened
 *                       (an audio clip gets a short fade-out so the cut
 *                       doesn't click), markers / scene transitions past it go.
 *
 * Only the copy changes — the saved CanvasState and Timeline are never mutated.
 */
import type { PresetAspect } from "@shared/publish-presets";
import { secondsToFrames, type Clip, type Timeline } from "@shared/timeline";
import type { CanvasState, ContainerStyle, Widget, WidgetPosition } from "./canvas-state";

export interface Frame {
  width: number;
  height: number;
}

const ASPECT_RATIO: Record<PresetAspect, number> = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1, "4:5": 4 / 5 };

/** A widget covering at least this share of both frame axes is full-bleed. */
const FULL_BLEED = 0.98;
/** Fade applied to an audio clip the cut shortens. */
const CUT_FADE_SEC = 0.5;
/** Numeric params measured in canvas pixels (WidgetParams `data`). */
const PIXEL_PARAM_KEYS = ["fontPx", "cardFontPx", "ctaFontPx", "strokeWidth", "cornerRadius", "thickness"] as const;
const PIXEL_CONTAINER_KEYS = ["borderWidth", "borderRadius", "padding"] as const;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** The output frame of a cut in `aspect`, keeping the master's short side. */
export function variantFrame(master: Frame, aspect: PresetAspect): Frame {
  const short = Math.min(master.width, master.height);
  const ratio = ASPECT_RATIO[aspect];
  return ratio >= 1
    ? { width: even(short * ratio), height: even(short) }
    : { width: even(short), height: even(short / ratio) };
}

function isFullBleed(p: WidgetPosition): boolean {
  return p.width >= FULL_BLEED && p.height >= FULL_BLEED && p.x <= 1 - FULL_BLEED && p.y <= 1 - FULL_BLEED;
}

/** Map a fractional rect from `from` to `to`, scaled by `scale` about the frame centre. */
function mapRect(p: WidgetPosition, from: Frame, to: Frame, scale: number): WidgetPosition {
  const cx = (p.x + p.width / 2) * from.width;
  const cy = (p.y + p.height / 2) * from.height;
  const w = p.width * from.width * scale;
  const h = p.height * from.height * scale;
  const nx = (cx - from.width / 2) * scale + to.width / 2;
  const ny = (cy - from.height / 2) * scale + to.height / 2;
  return { ...p, x: (nx - w / 2) / to.width, y: (ny - h / 2) / to.height, width: w / to.width, height: h / to.height };
}

function scaleNumbers<T extends object>(obj: T, keys: readonly string[], scale: number): T {
  let out: T | null = null;
  for (const key of keys) {
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    out ??= { ...obj };
    (out as Record<string, unknown>)[key] = value * scale;
  }
  return out ?? obj;
}

function reframeWidget(widget: Widget, from: Frame, to: Frame, fit: number, cover: number): Widget {
  const scale = isFullBleed(widget.position) ? cover : fit;
  const params = widget.params as { kind: string; data?: object };
  const data = params.data ? scaleNumbers(params.data, PIXEL_PARAM_KEYS, scale) : params.data;
  const containerStyle: ContainerStyle | undefined = widget.containerStyle
    ? scaleNumbers(widget.containerStyle, PIXEL_CONTAINER_KEYS, scale)
    : widget.containerStyle;
  return {
    ...widget,
    position: mapRect(widget.position, from, to, scale),
    params: (data === params.data ? widget.params : { ...params, data }) as Widget["params"],
    containerStyle,
  };
}

/** The composition re-laid on a frame of `aspect` (see the module comment). */
export function reframeCanvasState(state: CanvasState, aspect: PresetAspect): CanvasState {
  const from: Frame = { width: state.width, height: state.height };
  const to = variantFrame(from, aspect);
  if (to.width === from.width && to.height === from.height) return state;
  const fit = Math.min(to.width / from.width, to.height / from.height);
  const cover = Math.max(to.width / from.width, to.height / from.height);
  return {
    ...state,
    width: to.width,
    height: to.height,
    scenes: state.scenes.map((scene) => ({
      ...scene,
      widgets: scene.widgets.map((w) => reframeWidget(w, from, to, fit, cover)),
    })),
  };
}

function windowClip(
  clip: Clip,
  windowStart: number,
  windowEnd: number,
  fadeFrames: number,
  isAudio: boolean,
): Clip | null {
  const clipEnd = clip.startFrame + clip.durationFrames;
  if (clipEnd <= windowStart || clip.startFrame >= windowEnd) return null;
  const newStart = Math.max(clip.startFrame, windowStart);
  const newEnd = Math.min(clipEnd, windowEnd);
  const durationFrames = newEnd - newStart;
  if (durationFrames <= 0) return null;
  const sourceShift = newStart - clip.startFrame;
  const shortened = newEnd < clipEnd;
  const fadeOut = isAudio && shortened ? Math.max(clip.fadeOutFrames ?? 0, fadeFrames) : clip.fadeOutFrames;
  const { outTransition, ...rest } = clip;
  return {
    ...rest,
    startFrame: newStart - windowStart,
    durationFrames,
    sourceInFrame: clip.sourceInFrame + sourceShift,
    ...(fadeOut !== undefined ? { fadeOutFrames: Math.min(fadeOut, durationFrames) } : {}),
    ...(clip.fadeInFrames !== undefined ? { fadeInFrames: Math.min(clip.fadeInFrames, durationFrames) } : {}),
    ...(!shortened && outTransition ? { outTransition } : {}),
  };
}

/**
 * The Timeline cut of `trimToSec` seconds starting at `startSec` (default 0).
 * null / a non-positive duration with no start returns it unchanged.
 */
export function trimTimeline(
  timeline: Timeline,
  trimToSec: number | null,
  startSec: number | null = null,
): Timeline {
  const start = startSec != null && startSec > 0 ? startSec : 0;
  if ((trimToSec === null || !(trimToSec > 0)) && start === 0) return timeline;
  const startFrame = secondsToFrames(start, timeline.fps);
  const endFrame =
    trimToSec != null && trimToSec > 0
      ? secondsToFrames(start + trimToSec, timeline.fps)
      : Number.POSITIVE_INFINITY;
  const fadeFrames = secondsToFrames(CUT_FADE_SEC, timeline.fps);
  const inWindow = (frame: number) => frame >= startFrame && frame < endFrame;
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      clips: track.clips
        .map((clip) => windowClip(clip, startFrame, endFrame, fadeFrames, track.kind === "audio"))
        .filter((clip): clip is Clip => clip !== null),
    })),
    ...(timeline.markers
      ? { markers: timeline.markers.filter((m) => inWindow(m.frame)).map((m) => ({ ...m, frame: m.frame - startFrame })) }
      : {}),
    ...(timeline.sceneTransitions
      ? {
          sceneTransitions: timeline.sceneTransitions
            .filter((t) => inWindow(t.atFrame))
            .map((t) => ({ ...t, atFrame: t.atFrame - startFrame })),
        }
      : {}),
  };
}
