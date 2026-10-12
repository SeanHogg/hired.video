/**
 * `canvas-v2:scene-grade` — THE scene colour-filter effect (`Scene.filters`,
 * lib/studio/video-filters.ts), shared by the editor's playback preview and
 * the export (#583, #742). Both render frames through `renderTimelineFrame`,
 * so this applier is the only place a scene's filters become pixels.
 *
 * The emitter (timeline-emit.ts) puts it FIRST on the scene's v3 "scene
 * post" clip, which the compositor runs after every widget, so the grade
 * sees the full composite (background + widgets).
 *
 * Id: kept as `canvas-v2:scene-grade` (the plan named it `canvas-v2:filters`).
 * Saved `timeline_spec` rows already carry this id, `timelineToCanvasState`
 * strips it by id on load, and the baked-render freshness hash covers it —
 * renaming would mark every graded project's hosted video stale and need a
 * legacy alias on both the read and render side for no behavioural gain.
 *
 * Two implementations, one result:
 *   - `ctx.filter` (Chromium, Firefox, Safari 18+): snapshot the composite
 *     into a scratch canvas reused per target canvas (never allocated per
 *     frame) and draw it back through `filtersToCss(filters)`.
 *   - no `ctx.filter` (older Safari): the pixel-math port in
 *     filter-pixels.ts — same CSS function definitions, same order.
 */
import {
  DEFAULT_FILTERS,
  SCENE_GRADE_EFFECT,
  filtersToCss,
  isIdentityFilters,
  type VideoFilters,
} from "@/lib/studio/video-filters";
import { context2d, createScratchPool, type Ctx2D } from "../scratch-canvas";
import { applyFiltersToPixels } from "./filter-pixels";
import { registerEffect } from "./registry";

const snapshotFor = createScratchPool();
let warnedFallback = false;

/** True when the context honours `ctx.filter`. Older Safari has no such
 *  property at all, so a plain `in` check is reliable. */
export function supportsCanvasFilter(ctx: Ctx2D): boolean {
  return "filter" in ctx;
}

/** Grade the composite already painted on `canvas` in place. */
export function applySceneFilters(
  ctx: Ctx2D,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  input: Partial<VideoFilters> | null | undefined,
): void {
  if (!input) return;
  const filters: VideoFilters = { ...DEFAULT_FILTERS, ...input };
  if (isIdentityFilters(filters)) return;
  const w = canvas.width;
  const h = canvas.height;
  if (w <= 0 || h <= 0) return;

  if (supportsCanvasFilter(ctx)) {
    // ctx.filter only affects NEW draws, so snapshot the composite and draw
    // it back through the filter. Opaque grades cover the original fully; a
    // blur's soft edge falls back onto the ungraded pixels, not black.
    const snapshot = snapshotFor(canvas, w, h);
    const snapCtx = snapshot ? context2d(snapshot) : null;
    if (!snapshot || !snapCtx) return;
    snapCtx.clearRect(0, 0, w, h);
    snapCtx.drawImage(canvas, 0, 0);
    ctx.save();
    ctx.filter = filtersToCss(filters);
    ctx.drawImage(snapshot, 0, 0);
    ctx.restore();
    return;
  }

  if (!warnedFallback) {
    warnedFallback = true;
    console.warn("[timeline] ctx.filter unsupported — scene filters use the pixel-math fallback");
  }
  const image = ctx.getImageData(0, 0, w, h);
  applyFiltersToPixels(image.data, w, h, filters);
  ctx.putImageData(image, 0, 0);
}

registerEffect({
  kind: SCENE_GRADE_EFFECT,
  labelKey: "studio.effects.kind.sceneGrade",
  category: "color",
  defaults: {},
  apply(effect, { ctx, canvas }) {
    applySceneFilters(ctx, canvas, effect.params.filters as Partial<VideoFilters> | null | undefined);
  },
});
