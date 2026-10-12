/**
 * useKitPlayback — the ONE clock of a kit's video, shared by the frame on
 * the canvas and the strip under it (play / scrub, the scene rows, the
 * Advanced tracks). Muted autoplay the first time a draft's video is shown
 * (browsers allow sound only after a gesture), never again on an edit (an
 * edit would yank the frame out of edit mode); paused whenever the video
 * page is not showing. Selecting a scene (anywhere) seeks to its start.
 */
import { useEffect, useMemo, useRef } from "react";
import type { VideoSceneId } from "@shared/video-plan";
import { emptyCanvasState, type CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { usePreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import { canvasSceneTimes } from "@/lib/build/frame-edits";

interface Args {
  canvas: CanvasState | null;
  /** The video is on screen (its page shows and nothing covers it). */
  active: boolean;
  /** The draft's identity: autoplay runs once per draft. */
  autoplayKey: unknown;
  selected: VideoSceneId;
}

/** Before the video exists the clock runs over nothing (stable identity). */
const NOTHING_YET: CanvasState = emptyCanvasState();

export function useKitPlayback({ canvas, active, autoplayKey, selected }: Args) {
  const playback = usePreviewPlayback(canvas ?? NOTHING_YET, { initialMuted: true });
  const times = useMemo(() => (canvas ? canvasSceneTimes(canvas) : []), [canvas]);
  const startOf = (id: VideoSceneId) => times.find((s) => s.id === id)?.start ?? 0;
  const startRef = useRef(startOf);
  startRef.current = startOf;

  // The playback object is new each render; its play / pause / seek are
  // stable — read them through a ref so effects run on real changes only.
  const controls = useRef(playback);
  controls.current = playback;

  const hasVideo = canvas !== null;
  const startedFor = useRef<unknown>(null);
  const wasActive = useRef(active);
  useEffect(() => {
    // Pause only when the video LEAVES the screen — never re-pause a play
    // someone else started (the Preview shares this clock).
    if (wasActive.current && !active) controls.current.pause();
    wasActive.current = active;
    if (!hasVideo || !active) return;
    if (startedFor.current === autoplayKey) return;
    startedFor.current = autoplayKey;
    controls.current.seek(startRef.current(selected));
    controls.current.play();
    // `selected` is read for the start position only; selecting seeks below.
  }, [active, autoplayKey, hasVideo]);

  const seekedFor = useRef(selected);
  useEffect(() => {
    if (seekedFor.current === selected) return;
    seekedFor.current = selected;
    controls.current.seek(startRef.current(selected));
  }, [selected]);

  const playingId = times.reduce<VideoSceneId | null>((found, s) => (playback.playhead >= s.start ? s.id : found), null);
  return { playback, times, playingId };
}

export type KitPlayback = ReturnType<typeof useKitPlayback>;
