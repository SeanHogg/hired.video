/**
 * Preview playback for the v2 canvas editor.
 *
 * Owns the playhead clock (`requestAnimationFrame`-driven), drives the
 * active scene off the playhead, and delegates audio scheduling to the
 * shared `useMusicScheduler` hook so V2's preview music + voiceover
 * play through the SAME pipeline as V1's `<VideoPreview/>` and the
 * server render path (`scheduleClipsToDestination`). Per the DRY rule
 * there is one audio-scheduling seam in the editor codebase, and this
 * hook routes through it via the `canvasStateToAudioClips` adapter.
 *
 * Single source of truth so the play button, the canvas (for widget
 * visibility), and any future timeline indicator all read from one
 * hook — no consumer recomputes "what scene are we in?" locally.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMusicScheduler } from "@/lib/audio/use-music-scheduler";
import { totalDurationSeconds, type CanvasState } from "./canvas-state";
import { DEFAULT_AUDIO_MIX } from "./canvas-state";
import { canvasStateToAudioClips } from "./canvas-state-to-clips";

export interface PreviewPlayback {
  /** Seconds from start of composition. */
  playhead: number;
  isPlaying: boolean;
  /** Total composition length in seconds (derived from state). */
  duration: number;
  /** Scene id at the current playhead, or null when state has no scenes. */
  activeSceneIdAtPlayhead: string | null;
  /** Seconds elapsed into the active scene (used for widget
   *  visibleFrom/visibleTo gating). */
  activeSceneElapsed: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  /** Reset to 0 + pause. Called when the user opens a new project. */
  reset: () => void;
  /** Output muted? When true the shared music scheduler runs with
   *  master gain pinned to 0 — the schedule keeps ticking so unmuting
   *  resumes mid-clip without re-decoding buffers. */
  muted: boolean;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
}

export interface UsePreviewPlaybackOptions {
  /** Start in the muted state. Hero "live thumbnail" surfaces pass true
   *  so the autoplay path matches the browser muted-autoplay policy and
   *  the existing flat/baked branches (which already default
   *  `muted = autoplay`). */
  initialMuted?: boolean;
}

export function usePreviewPlayback(
  state: CanvasState,
  options?: UsePreviewPlaybackOptions,
): PreviewPlayback {
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(Boolean(options?.initialMuted));
  const playheadRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const duration = useMemo(() => totalDurationSeconds(state), [state]);

  // Keep the ref in sync with state — rAF reads from the ref to avoid
  // stale-closure issues when isPlaying flips. The shared
  // `useMusicScheduler` also reads from this ref so the scheduler knows
  // the latest playhead at start time without re-rendering every frame.
  useEffect(() => {
    playheadRef.current = playhead;
  }, [playhead]);

  // Audio. Single source — `canvasStateToAudioClips` projects music +
  // voiceovers into the flat AudioClip[] the shared scheduler consumes.
  // Replaces the prior `<audio>`-element-per-music-source code path
  // that couldn't schedule voiceovers and had no audioMix coupling.
  const audioClips = useMemo(() => canvasStateToAudioClips(state), [state]);
  const masterVolume = state.audioMix?.masterGain ?? DEFAULT_AUDIO_MIX.masterGain;
  useMusicScheduler({
    playing: isPlaying,
    clips: audioClips,
    masterVolume: muted ? 0 : masterVolume,
    playheadRef,
  });

  const tick = useCallback(
    (now: number) => {
      const last = lastTickRef.current;
      lastTickRef.current = now;
      const dt = last == null ? 0 : (now - last) / 1000;
      const next = Math.min(duration, playheadRef.current + dt);
      playheadRef.current = next;
      setPlayhead(next);
      if (next >= duration) {
        setIsPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [duration],
  );

  // rAF loop lifecycle.
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTickRef.current = null;
      return;
    }
    lastTickRef.current = null;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, tick]);

  const play = useCallback(() => {
    if (duration <= 0) return;
    // Snap back to 0 if we're already at the end.
    if (playheadRef.current >= duration) {
      playheadRef.current = 0;
      setPlayhead(0);
    }
    setIsPlaying(true);
  }, [duration]);

  const pause = useCallback(() => setIsPlaying(false), []);
  const toggle = useCallback(
    () => (isPlaying ? pause() : play()),
    [isPlaying, pause, play],
  );

  const seek = useCallback(
    (seconds: number) => {
      const clamped = Math.max(0, Math.min(duration, seconds));
      playheadRef.current = clamped;
      setPlayhead(clamped);
    },
    [duration],
  );

  const reset = useCallback(() => {
    setIsPlaying(false);
    playheadRef.current = 0;
    setPlayhead(0);
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  // Derive the active scene + intra-scene elapsed time from the playhead.
  const { activeSceneIdAtPlayhead, activeSceneElapsed } = useMemo(() => {
    let cursor = 0;
    for (const scene of state.scenes) {
      const end = cursor + scene.durationSeconds;
      if (playhead < end || end === cursor) {
        return {
          activeSceneIdAtPlayhead: scene.id,
          activeSceneElapsed: Math.max(0, playhead - cursor),
        };
      }
      cursor = end;
    }
    const last = state.scenes[state.scenes.length - 1] ?? null;
    return {
      activeSceneIdAtPlayhead: last?.id ?? null,
      activeSceneElapsed: last?.durationSeconds ?? 0,
    };
  }, [playhead, state.scenes]);

  return {
    playhead,
    isPlaying,
    duration,
    activeSceneIdAtPlayhead,
    activeSceneElapsed,
    play,
    pause,
    toggle,
    seek,
    reset,
    muted,
    setMuted,
    toggleMute,
  };
}
