/**
 * A document's overlay elements → one transparent PNG per printed page, at
 * print resolution, for the downloads (the letter's print / Word builder,
 * the résumé's print page) to lay over the page.
 *
 * Painted by the studio's EXPORT compositor — the same path a video export
 * takes: the elements become a timeline (`canvasStateToTimeline`), media and
 * linked cards preload (`preloadCanvasV2Media`), and every element's clip
 * effect runs through the effect registry (`applyEffects`: the widget
 * plugins for text / shapes / dividers, the canvas-v2 painters for images,
 * video, chips, CTA, charts, linked cards, comic bubbles, avatars, and the
 * engagement-asset painter). EVERY widget kind has a painter
 * (`EXPORT_PAINTERS`, checked by a test); nothing is skipped:
 *
 *   video / webcam   a still: the frame at STILL_AT_SEC (seeked and decoded
 *                    first); a clip that can't be read draws a labelled
 *                    placeholder in its box
 *   images           made canvas-safe first (canvas-safe-image.ts: CORS or
 *                    the API's image proxy), so the page never taints
 *
 *   library media    an image / video stored by media-library id is resolved
 *                    to its URL first (media-source-urls.ts)
 *
 * Each page is drawn on its own canvas at native page px (fonts are
 * authored in them) on a context scaled to print resolution and translated
 * to that page. Per-element pixel effects (grain,
 * vignette, LUT, …) read raw pixels, so they run in DEVICE pixels after
 * each element paints (`runDevicePixelPass`). Positions are in PAGE units
 * (overlay-plane.ts): y = 1.2 is 20% down page 2.
 */
import "@/lib/timeline/effects";
import type { Timeline } from "@shared/timeline";
import { emptyCanvasState, type Widget, type WidgetKind } from "@/lib/studio/editor-v2/canvas-state";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import { applyEffects, type EffectContext } from "@/lib/timeline/effects/registry";
import { isCanvasV2VideoDrawable, preloadCanvasV2Media, prepareCanvasV2Stills } from "@/lib/timeline/effects/canvas-v2-stills";
import { preloadEngagementTitles } from "@/lib/timeline/effects/engagement-asset";
import { applyWidgetPixelEffects } from "@/lib/timeline/effects/widget-frame";
import { applyFrameToCtx } from "@/lib/studio/widgets/frame-canvas";
import { frameInputFromWidget, resolveFrame, type Box, type EffectEntry } from "@/lib/studio/widgets/frame";
import { WIDGET_PLUGINS } from "@/lib/studio/widgets/registry";
import { withExportTarget } from "@/lib/studio/widgets/export-target";
import { toPlanePosition } from "./overlay-plane";
import { canvasSafeImageUrl } from "./canvas-safe-image";
import { resolveMediaSources } from "./media-source-urls";

/** Print resolution: 2 device px per CSS px (192 dpi). */
export const PRINT_SCALE = 2;
/** Where a video's still is taken from (past a black first frame). */
export const STILL_AT_SEC = 0.1;
const FPS = 30;

/** Every widget kind → the export painter (registered effect kind) that
 *  draws it, and whether a still must seek its video first. Derived from
 *  the plugin registry, which is a `Record` over WidgetKind. */
export const EXPORT_PAINTERS = Object.fromEntries(
  Object.entries(WIDGET_PLUGINS).map(([kind, plugin]) => [kind, { effect: plugin.effectKind, still: plugin.playsVideo }]),
) as Record<WidgetKind, { effect: string; still: boolean }>;

/** Which pages (0-based) each widget's box touches, from page units. */
export function pagesTouched(widget: Widget): number[] {
  const { y, height } = widget.position;
  const first = Math.max(0, Math.floor(y));
  const last = Math.max(first, Math.ceil(y + height) - 1);
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/** Back-to-front paint order (higher z on top; later-added wins ties). */
export function paintOrder(widgets: readonly Widget[]): Widget[] {
  return widgets
    .map((w, i) => ({ w, i }))
    .sort((a, b) => a.w.position.z - b.w.position.z || a.i - b.i)
    .map(({ w }) => w);
}

/** Pages the overlays need (at least `minPages`). */
export function overlayPageCount(widgets: readonly Widget[], minPages: number): number {
  return widgets.reduce((n, w) => Math.max(n, ...pagesTouched(w).map((p) => p + 1)), Math.max(1, minPages));
}

/** The widgets as the export draws them: at rest (no enter / exit motion),
 *  always visible, on the plane spanning `pages` pages. */
export function stillWidgets(widgets: readonly Widget[], pages: number): Widget[] {
  return widgets.map((w) => ({
    ...w,
    position: toPlanePosition(w.position, pages),
    motion: null,
    visibleFrom: null,
    visibleTo: null,
  }));
}

/** The media URL a widget's plugin declares (image, video or recording). */
function mediaUrl(widget: Widget): string {
  const assets = WIDGET_PLUGINS[widget.params.kind].assets(widget.params);
  return assets.images?.[0] ?? assets.videos?.[0] ?? "";
}

/** Images swapped for canvas-safe URLs (and what to release afterwards). */
async function withSafeImages(widgets: Widget[]): Promise<{ widgets: Widget[]; unreadable: Set<string>; release: () => void }> {
  const releases: Array<() => void> = [];
  const unreadable = new Set<string>();
  const out = await Promise.all(
    widgets.map(async (w) => {
      const p = w.params;
      if (p.kind !== "image" || p.data.source.kind !== "url" || !p.data.source.url) return w;
      const safe = await canvasSafeImageUrl(p.data.source.url);
      if (!safe) {
        unreadable.add(w.id);
        return w;
      }
      if (safe.release) releases.push(safe.release);
      return { ...w, params: { ...p, data: { ...p.data, source: { kind: "url" as const, url: safe.url } } } };
    }),
  );
  return { widgets: out, unreadable, release: () => releases.forEach((r) => r()) };
}

/** Media that can't be read (no CORS and no proxy, gone, no clip yet): its
 *  box with a play mark (video) or a picture mark (image), never nothing. */
function paintMediaPlaceholder(ctx: EffectContext["ctx"], widget: Widget, plane: { width: number; height: number }): void {
  const frame = resolveFrame({ ...frameInputFromWidget(widget), motion: null }, plane, { clipTimeSec: 0, clipDurationSec: 1 });
  const { x, y, w, h } = frame.content;
  ctx.save();
  applyFrameToCtx(ctx, frame);
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(x, y, w, h);
  const r = Math.min(w, h) * 0.14;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  if (widget.kind === "image") {
    // Mountains + sun.
    ctx.moveTo(x + w * 0.2, y + h * 0.75);
    ctx.lineTo(x + w * 0.42, y + h * 0.45);
    ctx.lineTo(x + w * 0.58, y + h * 0.62);
    ctx.lineTo(x + w * 0.68, y + h * 0.52);
    ctx.lineTo(x + w * 0.8, y + h * 0.75);
    ctx.closePath();
    ctx.moveTo(x + w * 0.72 + r * 0.4, y + h * 0.3);
    ctx.arc(x + w * 0.72, y + h * 0.3, r * 0.4, 0, Math.PI * 2);
  } else {
    ctx.moveTo(x + w / 2 - r * 0.6, y + h / 2 - r);
    ctx.lineTo(x + w / 2 + r, y + h / 2);
    ctx.lineTo(x + w / 2 - r * 0.6, y + h / 2 + r);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

/** An element's pixel effects (the ones that read raw pixels) and the
 *  content box they apply to, on the plane (plane px). */
export function pixelPassFor(widget: Widget, plane: { width: number; height: number }): { effects: EffectEntry[]; content: Box } {
  const frame = resolveFrame({ ...frameInputFromWidget(widget), motion: null }, plane, { clipTimeSec: 0, clipDurationSec: 1 });
  // A video's chroma key is a pixel effect too (the video painter would
  // otherwise run it itself, on the scaled page).
  const ck = widget.params.kind === "video" ? widget.params.data.chromaKey : null;
  const chroma: EffectEntry[] = ck && typeof ck.keyColor === "string"
    ? [{ kind: "chroma-key", params: { keyColor: ck.keyColor, threshold: ck.threshold, softness: ck.softness, spillSuppression: ck.spillSuppression ?? 0.5 } }]
    : [];
  return { effects: [...chroma, ...frame.pixelEffects], content: frame.content };
}

/** The element without its pixel effects: the painter draws it, the pass
 *  runs them in device pixels (a scaled context can't). */
export function withoutPixelEffects(widget: Widget, pixel: readonly EffectEntry[]): Widget {
  if (pixel.length === 0) return widget;
  const p = widget.params;
  if (p.kind === "video" && p.data.chromaKey) {
    widget = { ...widget, params: { ...p, data: { ...p.data, chromaKey: null } } };
  }
  if (!widget.effects) return widget;
  const kinds = pixel.map((e) => e.kind);
  const left = [...kinds];
  const effects = widget.effects.filter((e) => {
    const i = left.indexOf(e.kind);
    if (i < 0) return true;
    left.splice(i, 1);
    return false;
  });
  return { ...widget, effects };
}

/** Run an element's pixel effects on the device-pixel canvas: identity
 *  transform, its content box scaled to print resolution. */
export function runDevicePixelPass(
  ctx: EffectContext["ctx"],
  canvas: EffectContext["canvas"],
  pass: { effects: EffectEntry[]; content: Box },
  scale: number,
  frame: { timelineFrame: number; fps: number },
  apply: typeof applyWidgetPixelEffects = applyWidgetPixelEffects,
): void {
  if (pass.effects.length === 0) return;
  const { x, y, w, h } = pass.content;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  try {
    apply(ctx, canvas, pass.effects, { x: x * scale, y: y * scale, w: w * scale, h: h * scale }, frame.timelineFrame, frame.fps);
  } finally {
    ctx.restore();
  }
}

/** Media the painters would draw as nothing: an unreadable image, a video
 *  with no readable clip, a webcam recording that won't load (a webcam with
 *  no recording draws its own placeholder card). */
function needsPlaceholder(widget: Widget, unreadableImages: ReadonlySet<string>): boolean {
  if (widget.kind === "image") return unreadableImages.has(widget.id) || !mediaUrl(widget);
  if (!EXPORT_PAINTERS[widget.kind].still) return false;
  const url = mediaUrl(widget);
  if (!url) return widget.kind === "video";
  return !isCanvasV2VideoDrawable(url);
}

/** For each page (0-based, `count` of them), the indices into `widgets` of
 *  the elements touching it, in paint order. */
export function widgetsByPage(widgets: readonly Widget[], count: number): number[][] {
  const pages: number[][] = Array.from({ length: count }, () => []);
  widgets.forEach((w, i) => {
    for (const p of pagesTouched(w)) if (p < count) pages[p].push(i);
  });
  return pages;
}

/** A pixel pass moved onto the page starting `offsetY` plane px down (the
 *  device-pixel pass runs with the identity transform, so the page's
 *  translate doesn't reach it). */
export function passOnPage(pass: { effects: EffectEntry[]; content: Box }, offsetY: number): { effects: EffectEntry[]; content: Box } {
  if (offsetY === 0) return pass;
  return { effects: pass.effects, content: { ...pass.content, y: pass.content.y - offsetY } };
}

interface RasterizeArgs {
  /** Visible elements, positions in page units. */
  widgets: readonly Widget[];
  pageWidth: number;
  pageHeight: number;
  /** The document's printed pages (the PNG list is at least this long). */
  pages: number;
  /** The studio project (engagement assets' titles live on it). */
  projectId?: string | null;
  scale?: number;
}

/** One PNG data URL per page — null for a page with nothing on it. */
export async function rasterizeOverlayPages({
  widgets,
  pageWidth,
  pageHeight,
  pages,
  projectId = null,
  scale = PRINT_SCALE,
}: RasterizeArgs): Promise<Array<string | null>> {
  const count = overlayPageCount(widgets, pages);
  const out: Array<string | null> = Array.from({ length: count }, () => null);
  if (widgets.length === 0 || typeof document === "undefined") return out;

  const plane = { width: pageWidth, height: pageHeight * count };
  const ordered = paintOrder(widgets);
  const resolved = await resolveMediaSources(stillWidgets(ordered, count));
  const { widgets: safe, unreadable, release } = await withSafeImages(resolved);
  try {
    // The compositor's input: one transparent scene the plane's size, the
    // elements' pixel effects held back for the device-pixel pass.
    const passes = new Map(safe.map((w) => [w.id, pixelPassFor(w, plane)]));
    const emitted = safe.map((w) => withoutPixelEffects(w, passes.get(w.id)?.effects ?? []));
    const state = { ...emptyCanvasState({ width: plane.width, height: plane.height, fps: FPS }) };
    state.scenes = [{ ...state.scenes[0], backgroundColor: "transparent", widgets: emitted, durationSeconds: 1 }];
    // A page image has no click overlay: CTAs paint their link + QR fallback.
    const timeline: Timeline = await withExportTarget(canvasStateToTimeline(state));
    await Promise.all([preloadCanvasV2Media(timeline), preloadEngagementTitles(projectId, timeline)]);
    await prepareCanvasV2Stills(timeline, STILL_AT_SEC);
    const clips = new Map(timeline.tracks.flatMap((t) => t.clips).map((c) => [c.id, c]));

    // Painters measure in page px (fonts are authored in them) on the whole
    // plane; each page's scaled + translated context takes them to print
    // resolution.
    const logical = { width: plane.width, height: plane.height } as unknown as HTMLCanvasElement;
    const stillFrame = Math.round(STILL_AT_SEC * FPS);

    // One canvas PER PAGE (never the whole plane: pageW×pageH×pages at print
    // scale passes iOS Safari's ~16.7M px canvas cap at 5 pages and draws
    // nothing). A page paints only the elements touching it — one crossing a
    // page break paints on both — so a tainted draw costs only its pages.
    const byPage = widgetsByPage(ordered, count);
    for (let p = 0; p < count; p += 1) {
      const onPage = byPage[p];
      if (onPage.length === 0) continue;
      const page = document.createElement("canvas");
      page.width = Math.round(pageWidth * scale);
      page.height = Math.round(pageHeight * scale);
      const ctx = page.getContext("2d");
      if (!ctx) continue;
      const offsetY = p * pageHeight;
      ctx.scale(scale, scale);
      ctx.translate(0, -offsetY);
      for (const i of onPage) {
        const widget = safe[i];
        if (needsPlaceholder(widget, unreadable)) {
          paintMediaPlaceholder(ctx, widget, plane);
          continue;
        }
        const effects = clips.get(widget.id)?.effects ?? [];
        applyEffects(effects, { ctx, canvas: logical, timelineFrame: stillFrame, clipFrame: stillFrame, clipDurationFrames: FPS, fps: FPS });
        const pass = passes.get(widget.id);
        if (pass) runDevicePixelPass(ctx, page, passOnPage(pass, offsetY), scale, { timelineFrame: stillFrame, fps: FPS });
      }
      try {
        out[p] = page.toDataURL("image/png");
      } catch {
        out[p] = null;
      }
      // Free the backing store now (iOS counts live canvas memory too).
      page.width = 0;
      page.height = 0;
    }
    return out;
  } finally {
    release();
  }
}
