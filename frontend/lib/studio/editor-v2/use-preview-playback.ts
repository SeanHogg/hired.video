/**
 * Preview playback for the v2 canvas editor.
 *
 * Owns the playhead clock (`requestAnimationFrame`-driven), drives the
 * active scene off the playhead, and keeps the optional music track in
 * sync. Single source of truth so the play button, the canvas (for
 * widget visibility), and any future timeline indicator all read from
 * one hook — no consumer recomputes "what scene are we in?" locally.
 *
 * Out of scope for this pass (gap-registered): video-clip audio tracks,
 * voiceover playback, frame-accurate sync with WebCodecs render. The
 * preview is "good enough" for the user to judge the composition; the
 * render facade still owns export.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolvePlayableSrc } from "@/lib/studio/music-catalog";
import { totalDurationSeconds, type CanvasState } from "./canvas-state";

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
}

export function usePreviewPlayback(state: CanvasState): PreviewPlayback {
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playheadRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const duration = useMemo(() => totalDurationSeconds(state), [state]);

  // Keep the ref in sync with state — rAF reads from the ref to avoid
  // stale-closure issues when isPlaying flips.
  useEffect(() => {
    playheadRef.current = playhead;
  }, [playhead]);

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

  // Music track sync. Lazily creates the audio element when the chosen
  // source changes; pauses on stop; seeks on user-initiated jumps.
  // resolvePlayableSrc() unifies stock + custom + procedural sources —
  // there's no parallel resolution path anywhere in the editor.
  const musicSource = state.musicSource;
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = await resolvePlayableSrc(musicSource);
      if (cancelled) return;
      setResolvedSrc(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [musicSource]);
  useEffect(() => {
    if (!resolvedSrc) {
      audioRef.current?.pause();
      audioRef.current = null;
      return;
    }
    if (audioRef.current?.src !== resolvedSrc) {
      audioRef.current?.pause();
      const audio = new Audio(resolvedSrc);
      audio.preload = "auto";
      audioRef.current = audio;
    }
  }, [resolvedSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      // Snap audio to the latest playhead (read via ref so this effect
      // doesn't re-run on every rAF tick, which would cause audio
      // scrubbing clicks). Once playing the audio advances under its own
      // clock; we only re-sync when isPlaying or the track itself flips.
      const target = playheadRef.current;
      if (Math.abs(audio.currentTime - target) > 0.25) {
        audio.currentTime = Math.min(audio.duration || target, target);
      }
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying, resolvedSrc]);

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
      if (audioRef.current) {
        audioRef.current.currentTime = Math.min(
          audioRef.current.duration || clamped,
          clamped,
        );
      }
    },
    [duration],
  );

  const reset = useCallback(() => {
    setIsPlaying(false);
    playheadRef.current = 0;
    setPlayhead(0);
  }, []);

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
  };
}
