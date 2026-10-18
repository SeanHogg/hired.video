import { useEffect, useRef } from "react";

import { VideoTracker } from "@/lib/analytics/video-tracker";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import type { usePreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";

type Playback = ReturnType<typeof usePreviewPlayback>;

/** Per-second engagement tracking for the live-canvas branch of
 *  <PublicStudioCanvas/>. Drives VideoTracker's playhead-mode API off the
 *  shared preview playback state. */
export function useCanvasPlayheadTracker(
  analyticsProjectId: string | undefined,
  canvasState: CanvasState | null,
  playback: Playback,
): void {
  // Per-second engagement tracking on the canvas branch. The tracker's
  // playhead-mode API matches what we drive the live preview with —
  // no <video> element required. Same telemetry shape as the baked-MP4
  // branch so analytics dashboards don't have to branch by source.
  const trackerRef = useRef<{ tick: (t: number) => void; end: () => void; detach: () => void } | null>(null);
  useEffect(() => {
    if (!analyticsProjectId || !canvasState || playback.duration <= 0) return;
    const tracker = new VideoTracker(analyticsProjectId);
    const handle = tracker.attachPlayhead(playback.duration);
    trackerRef.current = handle;
    return () => {
      handle.detach();
      trackerRef.current = null;
    };
  }, [analyticsProjectId, canvasState, playback.duration]);
  useEffect(() => {
    trackerRef.current?.tick(playback.playhead);
  }, [playback.playhead]);
  useEffect(() => {
    if (
      trackerRef.current &&
      !playback.isPlaying &&
      playback.duration > 0 &&
      playback.playhead >= playback.duration
    ) {
      trackerRef.current.end();
    }
  }, [playback.isPlaying, playback.playhead, playback.duration]);
}
