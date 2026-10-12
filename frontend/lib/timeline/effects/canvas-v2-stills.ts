/**
 * canvas-v2 render prep — the module-scoped media cache the widget
 * painters (widget-plugins.ts) read synchronously, and the async passes that fill
 * it before painting:
 *
 *   preloadCanvasV2Media    every image / video / webcam URL + linked-content
 *                           summary + widget font, before the encode loop
 *                           (images fully decoded, fonts settled — #742)
 *   syncCanvasV2VideosToFrame  per rendered frame: seek every active video /
 *                           webcam widget to its clip-local time and wait for
 *                           the decoded frame, so the export paints the frame
 *                           the preview plays instead of a stale one
 *   prepareCanvasV2Stills   a still export (document page, poster): seek each
 *                           preloaded video to the still's time and wait for
 *                           the decoded frame
 *   isCanvasV2VideoDrawable whether a video has a frame to draw (else the
 *                           caller paints a placeholder)
 *
 * The appliers stay synchronous (per the registry contract): a cache miss
 * starts a lazy load (`ensureImageLoaded` / `ensureVideoLoaded`) and paints
 * nothing for that frame.
 */
import type { Clip, ClipEffect, Timeline } from "@shared/timeline";
import { stringOr } from "@/lib/studio/widgets/frame";
import {
  getLinkedContentMeta,
  isLinkedContentKind,
  type LinkedContentKind,
  type LinkedContentSummary,
} from "@/lib/studio/editor-v2/linked-content";
import type { WidgetAssets } from "@/lib/studio/widgets/plugin";
import { pluginForEffectKind, renderContextFromParams } from "@/lib/studio/widgets/registry";

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

/** The cached image for `url`, or null (and a lazy load starts on a miss). */
export function ensureImageLoaded(url: string): HTMLImageElement | null {
  if (!url) return null;
  const cached = imageCache.get(url);
  if (cached instanceof HTMLImageElement) return cached;
  if (cached === "loading" || cached === "failed") return null;
  imageCache.set(url, "loading");
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => void decodeImage(img).then(() => imageCache.set(url, img));
  img.onerror = () => imageCache.set(url, "failed");
  img.src = url;
  return null;
}

/**
 * Wait until a loaded image is fully decoded, so the first frame that draws
 * it paints real pixels instead of racing the decoder (#742). A decode
 * failure is non-fatal — the draw path copes with whatever the element has.
 */
export async function decodeImage(img: HTMLImageElement): Promise<void> {
  if (typeof img.decode !== "function") return;
  try {
    await img.decode();
  } catch {
    /* non-fatal — see above */
  }
}

/** The clip-local media time (seconds) a video / webcam widget shows at
 *  `clipFrame`. ONE definition for the appliers' best-effort seek and the
 *  render's awaited seek (`syncCanvasV2VideosToFrame`). */
export function canvasV2VideoTimeSec(clipFrame: number, fps: number): number {
  return clipFrame / fps;
}

/** The cached video for `url`, or null (and a lazy load starts on a miss). */
export function ensureVideoLoaded(url: string): HTMLVideoElement | null {
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

/** A linked-content entity's preloaded summary by `${kind}:${id}`:
 *  undefined = not preloaded, "loading", null = unavailable. */
export function cachedLinkedContent(key: string): LinkedContentSummary | null | "loading" | undefined {
  return linkedContentCache.get(key);
}

/**
 * Pre-warm the media cache for every image / video / linked entity the
 * timeline's widget plugins declare (`assets()`). Called by the render strategy before the
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
  for (const { assets } of timelineWidgetAssets(timeline)) {
    for (const url of assets.images ?? []) imageUrls.add(url);
    for (const url of assets.videos ?? []) videoUrls.add(url);
    for (const { kind, id } of assets.linkedContent ?? []) linkedEntities.add(`${kind}:${id}`);
  }
  // Fonts: load every family the widgets paint with, then wait for the
  // document's font set to settle so frame 0 never draws a fallback face.
  const fontsSettled = preloadWidgetFonts(timeline).then(() =>
    typeof document !== "undefined" && document.fonts ? document.fonts.ready : undefined,
  );
  const tasks: Promise<unknown>[] = [fontsSettled];
  for (const url of imageUrls) {
    tasks.push(
      new Promise<void>((resolve) => {
        const cached = imageCache.get(url);
        if (cached instanceof HTMLImageElement) return resolve();
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          void decodeImage(img).then(() => {
            imageCache.set(url, img);
            resolve();
          });
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
  // linked-content painter (synchronous, per the registry
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

/** The video / webcam URLs one clip's widgets play. */
function clipVideoUrls(clip: Clip): string[] {
  return (clip.effects ?? []).flatMap((effect) => effectAssets(effect)?.videos ?? []);
}

/** What a `canvas-v2:*` effect's plugin needs loaded (null: not a widget). */
function effectAssets(effect: ClipEffect): WidgetAssets | null {
  const plugin = pluginForEffectKind(effect.kind);
  return plugin ? plugin.assets(plugin.parse(effect.params)) : null;
}

/** Every widget effect in the timeline with its assets. */
function timelineWidgetAssets(timeline: Timeline): Array<{ effect: ClipEffect; assets: WidgetAssets }> {
  const out: Array<{ effect: ClipEffect; assets: WidgetAssets }> = [];
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      for (const effect of clip.effects ?? []) {
        const assets = effectAssets(effect);
        if (assets) out.push({ effect, assets });
      }
    }
  }
  return out;
}

/** Load every font the timeline's widgets paint with — the project font of
 *  each widget and any per-widget `fontFamily` (chips, comics…) — so the
 *  first exported frame doesn't fall back to a system font. */
async function preloadWidgetFonts(timeline: Timeline): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const families = new Set<string>();
  for (const { effect } of timelineWidgetAssets(timeline)) {
    families.add(renderContextFromParams(effect.params).fontFamily);
    const own = stringOr(effect.params.fontFamily, "");
    if (own) families.add(own);
  }
  await Promise.all([...families].map((family) => document.fonts.load(`16px ${family}`).catch(() => [])));
}

/** The video / webcam URLs a timeline's widgets play. */
export function timelineVideoUrls(timeline: Timeline): Set<string> {
  const urls = new Set<string>();
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      for (const url of clipVideoUrls(clip)) urls.add(url);
    }
  }
  return urls;
}

/** Seek a cached video to `targetSec` and resolve once that frame is
 *  decoded (or a bounded timeout passes, so a stuck stream can't hang the
 *  render). Already there → resolves immediately. */
function seekCachedVideo(v: HTMLVideoElement, targetSec: number, fps: number): Promise<void> {
  const target = v.duration ? Math.min(v.duration, Math.max(0, targetSec)) : Math.max(0, targetSec);
  if (Math.abs(v.currentTime - target) <= 1 / fps && v.readyState >= 2) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      v.removeEventListener("seeked", done);
      v.removeEventListener("error", done);
      clearTimeout(timer);
      resolve();
    };
    v.addEventListener("seeked", done);
    v.addEventListener("error", done);
    const timer = setTimeout(done, 3000);
    try {
      v.currentTime = target;
    } catch {
      done();
    }
  });
}

/**
 * Per rendered frame: seek every video / webcam widget active at `frame` to
 * its clip-local time and wait for the decoded frame. The appliers are
 * synchronous (registry contract) and only nudge `currentTime`, which left
 * the export drawing whatever frame happened to be decoded — the preview
 * plays the real one. Awaiting the seek here makes them match (#742).
 */
export async function syncCanvasV2VideosToFrame(timeline: Timeline, frame: number): Promise<void> {
  const seeks: Promise<void>[] = [];
  for (const track of timeline.tracks) {
    if (track.kind !== "video") continue;
    for (const clip of track.clips) {
      if (frame < clip.startFrame || frame >= clip.startFrame + clip.durationFrames) continue;
      for (const url of clipVideoUrls(clip)) {
        const v = videoCache.get(url);
        if (!(v instanceof HTMLVideoElement)) continue;
        seeks.push(seekCachedVideo(v, canvasV2VideoTimeSec(frame - clip.startFrame, timeline.fps), timeline.fps));
      }
    }
  }
  await Promise.all(seeks);
}

/**
 * Still export (a document page, a poster): seek every preloaded video to
 * `atSec` and wait until that frame is decoded, so the synchronous appliers
 * draw a real picture rather than a blank first paint. Call after
 * `preloadCanvasV2Media`. Bounded by a timeout like the preload.
 */
export async function prepareCanvasV2Stills(timeline: Timeline, atSec: number): Promise<void> {
  const seeks = [...timelineVideoUrls(timeline)].map((url) => {
    const v = videoCache.get(url);
    if (!(v instanceof HTMLVideoElement)) return Promise.resolve();
    const target = v.duration ? Math.min(v.duration, Math.max(0, atSec)) : atSec;
    return new Promise<void>((resolve) => {
      const done = () => resolve();
      v.addEventListener("seeked", done, { once: true });
      v.addEventListener("error", done, { once: true });
      try {
        v.currentTime = target;
      } catch {
        resolve();
      }
    });
  });
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 8_000));
  await Promise.race([Promise.all(seeks), timeout]);
}

/** True when `url`'s video loaded and has a decoded frame to draw. */
export function isCanvasV2VideoDrawable(url: string): boolean {
  const v = videoCache.get(url);
  return v instanceof HTMLVideoElement && v.readyState >= 2 && v.videoWidth > 0;
}
