/**
 * capture-thumbnail — snapshot the FIRST FRAME of the current canvas as a
 * downscaled JPEG (#854). The "use the frame I'm staring at" thumbnail source
 * for marketplace-template publishing, alongside Upload / Stock / AI.
 *
 * Reuses the EXACT export visual path (`canvasStateToTimeline` →
 * `renderTimelineFrame`), so the snapshot matches what the rendered MP4 / public
 * watch page paints — no second, drift-prone render path. Audio sources are
 * resolved only because the frame renderer's state takes the same source map;
 * they don't affect the painted frame.
 *
 * V2-only by construction: it consumes a `CanvasState`. V1 has no canvas to
 * snapshot, so callers simply don't offer the action there.
 */
import type { CanvasState } from "./canvas-state";
import { canvasStateToTimeline, resolveTimelineAudioSources } from "./timeline-emit";

/** Render frame 0 of `state` to a JPEG data URL, downscaled so the longest
 *  edge is at most `maxWidth`. Returns null when there's nothing to render
 *  (empty canvas) or a 2D context can't be acquired — callers self-gate the
 *  "use current frame" affordance on a non-null result. */
export async function captureCanvasThumbnail(
  state: CanvasState,
  opts: { maxWidth?: number } = {},
): Promise<string | null> {
  if (!state.scenes || state.scenes.length === 0) return null;
  const timeline = canvasStateToTimeline(state);
  if (!timeline.width || !timeline.height) return null;
  const sources = await resolveTimelineAudioSources(state);
  const {
    createRendererState,
    preloadSources,
    renderTimelineFrame,
    disposeRendererState,
  } = await import("@/lib/timeline/frame-renderer");
  const rstate = createRendererState(sources, { useProxies: true });
  try {
    await preloadSources(timeline, rstate);
    const full = document.createElement("canvas");
    full.width = timeline.width;
    full.height = timeline.height;
    await renderTimelineFrame(full, timeline, rstate, 0);
    const maxWidth = opts.maxWidth ?? 640;
    const scale = Math.min(1, maxWidth / timeline.width);
    const thumb = document.createElement("canvas");
    thumb.width = Math.max(1, Math.round(timeline.width * scale));
    thumb.height = Math.max(1, Math.round(timeline.height * scale));
    const tctx = thumb.getContext("2d");
    if (!tctx) return null;
    tctx.drawImage(full, 0, 0, thumb.width, thumb.height);
    return thumb.toDataURL("image/jpeg", 0.85);
  } finally {
    disposeRendererState(rstate);
  }
}

/** Convert a `data:` URL (e.g. from {@link captureCanvasThumbnail}) into a Blob
 *  so it can be POSTed through `uploadImage`. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? "image/jpeg";
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
