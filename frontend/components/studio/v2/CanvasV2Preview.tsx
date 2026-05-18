/**
 * CanvasV2Preview — canvas-based playback surface for V2 projects.
 *
 * Drives the SAME `canvas-v2:*` effect registry the export pipeline
 * uses (`renderTimelineFrame()`), so what the viewer sees in the
 * preview matches the pixels in the rendered MP4. Closes gap #830 —
 * the previous preview path (`CanvasStage` in `mode="preview"`)
 * rendered widgets as React DOM, which drifted from the canvas-2D
 * export on font metrics, CTA pill geometry, and anything else CSS
 * computed differently from canvas-2D.
 *
 * Lifecycle:
 *   1. Build a Timeline from CanvasState whenever `state` changes
 *      (memoised on state identity).
 *   2. Run `preloadSources` + `preloadCanvasV2Media` once per timeline
 *      change so media URLs + linked-content entities are warm before
 *      the first paint.
 *   3. RAF loop calls `renderTimelineFrame(canvas, timeline, frame)`
 *      against the playhead from the parent's `PreviewPlayback`.
 *   4. Dispose the renderer state on unmount / timeline-change to free
 *      cached `<video>` elements.
 *
 * Edit-mode CanvasStage stays as-is — that surface still needs DOM for
 * drag / select / resize handles. Preview is the canvas-only surface.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  canvasStateToTimeline,
  resolveTimelineAudioSources,
} from "@/lib/studio/editor-v2/timeline-emit";
import { preloadCanvasV2Media } from "@/lib/timeline/effects";
import {
  createRendererState,
  disposeRendererState,
  preloadSources,
  renderTimelineFrame,
  type RendererState,
} from "@/lib/timeline/frame-renderer";
import type { PreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";

export interface CanvasV2PreviewProps {
  state: CanvasState;
  playback: PreviewPlayback;
  /** Display zoom (0..1+). Computed by the caller — `CanvasStatePreview`
   *  derives it from a fit-to-container ResizeObserver; the editor's
   *  inline canvas reuses the surrounding `<CanvasStage>` zoom so the
   *  swap looks seamless on play/pause. */
  zoom: number;
  className?: string;
}

export default function CanvasV2Preview({
  state,
  playback,
  zoom,
  className,
}: CanvasV2PreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<RendererState | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(-1);
  const [preloadReady, setPreloadReady] = useState(false);

  // Memoise the timeline on CanvasState identity. `canvasStateToTimeline`
  // is pure on its input, so re-emitting on every state change is cheap
  // and gives the renderer fresh widget tracks when the editor mutates.
  const timeline = useMemo(() => canvasStateToTimeline(state), [state]);

  // Renderer state — created once per timeline change so cached
  // `<video>` / `<image>` elements survive across frames. Disposed
  // when the timeline changes (or the component unmounts) so editing
  // a long project doesn't leak DOM elements.
  useEffect(() => {
    let cancelled = false;
    setPreloadReady(false);
    const rs = createRendererState({}, { useProxies: true });
    stateRef.current = rs;
    (async () => {
      // Audio sources aren't drawn — but resolving them keeps the
      // map consistent with what the export pipeline will see, so
      // future audio-aware preview surfaces (e.g. waveform overlay)
      // can read from the same shape.
      await resolveTimelineAudioSources(state);
      await Promise.all([
        preloadSources(timeline, rs),
        preloadCanvasV2Media(timeline),
      ]);
      if (!cancelled) setPreloadReady(true);
    })().catch(() => {
      if (!cancelled) setPreloadReady(true);
    });
    return () => {
      cancelled = true;
      disposeRendererState(rs);
      stateRef.current = null;
    };
  }, [timeline, state]);

  // RAF loop — paints whenever the playhead's frame index changes.
  // Reading the playback object directly each tick (instead of via
  // useEffect/useMemo) keeps the loop independent of React's render
  // cycle, which would otherwise stutter under high-frequency state
  // updates from the parent.
  useEffect(() => {
    function paint() {
      const canvas = canvasRef.current;
      const rs = stateRef.current;
      if (canvas && rs && preloadReady) {
        const frame = Math.max(
          0,
          Math.floor(playback.playhead * timeline.fps),
        );
        if (frame !== lastFrameRef.current) {
          lastFrameRef.current = frame;
          void renderTimelineFrame(canvas, timeline, rs, frame).catch(() => {
            // A single-frame failure shouldn't crash the loop — most
            // commonly a video seek that bailed before metadata loaded.
          });
        }
      }
      rafRef.current = requestAnimationFrame(paint);
    }
    rafRef.current = requestAnimationFrame(paint);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [timeline, playback, preloadReady]);

  return (
    <canvas
      ref={canvasRef}
      width={state.width}
      height={state.height}
      className={cn("block bg-black shadow-lg", className)}
      style={{
        width: state.width,
        height: state.height,
        transform: `scale(${zoom})`,
        transformOrigin: "top left",
      }}
    />
  );
}
