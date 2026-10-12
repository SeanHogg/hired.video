/**
 * useTimelineFramePlayer — drives a `TimelineFramePlayer` (the preview that
 * paints through the export's frame compositor) from the editor playhead.
 *
 *   - The Timeline is `canvasStateToTimeline(state)`: the exact input the
 *     export renders, so filters, effects and scene transitions match.
 *   - Engagement-asset titles are preloaded the way the export preloads
 *     them, so cards carry the same text.
 *   - The watermark follows the same branding policy the export receives.
 *   - Painting follows the playhead (which `usePreviewPlayback` advances
 *     once per animation frame) and stops while the tab is hidden; on
 *     return the current frame is repainted.
 *
 * Audio sources are not passed: audio tracks never paint, and resolving
 * them can render procedural music — the playback hook already owns audio.
 * The heavy compositor (effect registry + painters) is imported lazily so
 * surfaces that mount the overlay don't pay for it until it opens.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { TimelineFramePlayer } from "@/lib/timeline/frame-player";
import { useShowBranding } from "../use-show-branding";
import type { CanvasState } from "./canvas-state";
import { canvasStateToTimeline } from "./timeline-emit";

export interface UseTimelineFramePlayerArgs {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  state: CanvasState;
  /** Seconds from the start of the composition. */
  playhead: number;
  /** Project whose engagement-asset titles the cards read (as on export). */
  projectId?: string | null;
}

export function useTimelineFramePlayer({
  canvasRef,
  state,
  playhead,
  projectId,
}: UseTimelineFramePlayerArgs): { ready: boolean } {
  const playerRef = useRef<TimelineFramePlayer | null>(null);
  const [player, setPlayer] = useState<TimelineFramePlayer | null>(null);
  const [ready, setReady] = useState(false);
  const includeBranding = useShowBranding();
  const timeline = useMemo(() => canvasStateToTimeline(state), [state]);
  const frame = Math.floor(playhead * timeline.fps);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  // One player per mounted canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    void import("@/lib/timeline/frame-player").then(({ TimelineFramePlayer }) => {
      if (cancelled) return;
      const created = new TimelineFramePlayer(canvas);
      playerRef.current = created;
      setPlayer(created);
    });
    return () => {
      cancelled = true;
      playerRef.current?.dispose();
      playerRef.current = null;
      setPlayer(null);
    };
  }, [canvasRef]);

  // (Re)load whenever the Timeline changes.
  useEffect(() => {
    if (!player) return;
    let cancelled = false;
    void (async () => {
      try {
        if (projectId) {
          const { preloadEngagementTitles } = await import("@/lib/timeline/effects/engagement-asset");
          await preloadEngagementTitles(projectId, timeline);
        }
        player.requestFrame(frameRef.current);
        await player.load(timeline, {});
      } catch (err) {
        console.warn("[timeline] preview preload failed", err);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [player, timeline, projectId]);

  useEffect(() => {
    player?.setIncludeBranding(includeBranding);
  }, [player, includeBranding]);

  // Follow the playhead; skip work while the tab is hidden.
  useEffect(() => {
    if (!player) return;
    if (typeof document !== "undefined" && document.hidden) return;
    player.requestFrame(frame);
  }, [player, frame]);

  useEffect(() => {
    if (!player || typeof document === "undefined") return;
    const onVisibility = () => {
      if (!document.hidden) player.requestFrame(frameRef.current);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [player]);

  return { ready };
}
