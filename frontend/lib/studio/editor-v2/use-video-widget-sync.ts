/**
 * `useVideoWidgetSync` — drives a `<video>` widget element from the V2
 * editor's central playhead. Closes the video-widget half of #559 (the
 * music + voiceover half already routes through `useMusicScheduler` —
 * see `use-preview-playback.ts`).
 *
 * Without this hook, video widgets render their first frame but the
 * audio + frame advance only kick in when the user manually clicks the
 * `<video>` controls (which are deliberately disabled). When the user
 * hits Play in the editor, every visible non-muted video widget needs
 * its element told to play; when paused, all elements pause; when
 * scrubbed, all elements seek.
 *
 * Per the DRY rule the audio scheduling lives in ONE place
 * (`use-music-scheduler.ts` for music + voiceovers, this hook for
 * video-widget audio). Both read from the same `playhead` source of
 * truth so the editor preview stays in sync.
 */
import { useEffect, useRef } from "react";

export interface UseVideoWidgetSyncOpts {
  /** Clip-local time in seconds — how far into THIS widget's playback
   *  window the editor's playhead currently sits. */
  clipTimeSec: number;
  /** Whether the editor is currently in playback mode. When true the
   *  element is told to play; when false it's paused and seeked to
   *  the current clipTimeSec so the user sees the right frame. */
  isPlayback: boolean;
}

/** Bind a `<video>` element to the editor's playback clock. Pass an
 *  existing ref (e.g. ChromaVideoBody already manages one for its
 *  paint loop) OR omit and the hook mints one. Idempotent on every
 *  render — calling `.play()` on an already-playing element is a
 *  no-op; same for `.pause()`. The hook handles the autoplay promise
 *  rejection that fires when an unmuted video tries to play before a
 *  user gesture has primed audio (the user clicking Play IS the
 *  gesture, but browser policies vary). */
export function useVideoWidgetSync(
  { clipTimeSec, isPlayback }: UseVideoWidgetSyncOpts,
  existingRef?: React.RefObject<HTMLVideoElement | null>,
): React.RefObject<HTMLVideoElement | null> {
  const mintedRef = useRef<HTMLVideoElement | null>(null);
  const ref = existingRef ?? mintedRef;

  // Seek + play/pause. Reads clipTimeSec each tick so a scrub during
  // pause updates the visible frame without restarting the element.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Only seek when the divergence is meaningful — the element's own
    // currentTime advances at the same wall-clock rate while playing,
    // so re-seeking every frame would stutter. 0.15s tolerance is the
    // industry-standard "good enough" for editor preview sync.
    if (Math.abs(el.currentTime - clipTimeSec) > 0.15) {
      try {
        el.currentTime = clipTimeSec;
      } catch {
        // Some browsers throw if the video hasn't loaded metadata yet
        // — swallow so the first paint still renders.
      }
    }
    if (isPlayback) {
      // The play() promise rejects on cross-origin autoplay blocks.
      // Editor playback always follows a user click so it's almost
      // always allowed, but we still swallow the promise so a single
      // blocked video can't crash the whole rAF loop.
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [clipTimeSec, isPlayback, ref]);

  // Pause on unmount — a widget removed mid-playback shouldn't keep
  // sounding from a disconnected element.
  useEffect(() => {
    return () => {
      ref.current?.pause();
    };
  }, [ref]);

  return ref;
}
