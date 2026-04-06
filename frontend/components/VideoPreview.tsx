// VideoPreview.tsx — canvas RAF loop calling frameRenderer.render().
// When an audio track is provided it is played/paused in sync with the video.
// When voiceover is provided, per-scene audio is played at the correct time.

import { useEffect, useRef, useCallback } from "react";
import { render } from "@/lib/renderer/frame-renderer";
import type { CompiledVideo } from "@/lib/compiler/types";
import type { VideoAudio, VoiceoverConfig } from "@/types/video-script";
import { getAmbientPlayer } from "@/lib/audio/ambient-player";

interface SceneTiming {
  id: string;
  start: number;
  duration: number;
}

interface Props {
  compiledVideo: CompiledVideo | null;
  playing: boolean;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  className?: string;
  audio?: VideoAudio;
  voiceover?: VoiceoverConfig | null;
  sceneTimings?: SceneTiming[];
}

export default function VideoPreview({ compiledVideo, playing, currentTime, onTimeUpdate, className, audio, voiceover, sceneTimings }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const timeRef     = useRef(currentTime);
  const lastTsRef   = useRef<number | null>(null);
  const audioActiveRef = useRef<string | null>(null);

  // ── Voiceover audio elements ────────────────────────────────────────────
  const voAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const voActiveRef = useRef<string | null>(null);

  // Create/update Audio elements when voiceover config changes
  useEffect(() => {
    const map = voAudiosRef.current;
    // Clean up old elements
    for (const [id, el] of map) {
      el.pause();
      el.src = "";
    }
    map.clear();
    voActiveRef.current = null;

    if (!voiceover?.enabled || !sceneTimings) return;

    for (const timing of sceneTimings) {
      const sceneVo = voiceover.scenes[timing.id];
      if (!sceneVo?.audioUrl) continue;
      const el = new Audio(sceneVo.audioUrl);
      el.preload = "auto";
      map.set(timing.id, el);
    }

    return () => {
      for (const [, el] of map) {
        el.pause();
        el.src = "";
      }
      map.clear();
    };
  }, [voiceover, sceneTimings]);

  // Sync voiceover playback with current time and playing state
  useEffect(() => {
    if (!sceneTimings || !voiceover?.enabled) return;

    const map = voAudiosRef.current;
    if (map.size === 0) return;

    if (!playing) {
      // Pause all
      for (const [, el] of map) {
        if (!el.paused) el.pause();
      }
      voActiveRef.current = null;
      return;
    }

    // Find which scene we're in
    const t = timeRef.current;
    let activeSceneId: string | null = null;
    let offsetInScene = 0;
    for (const timing of sceneTimings) {
      if (t >= timing.start && t < timing.start + timing.duration) {
        activeSceneId = timing.id;
        offsetInScene = t - timing.start;
        break;
      }
    }

    // Pause scenes that are not active
    for (const [id, el] of map) {
      if (id !== activeSceneId && !el.paused) {
        el.pause();
      }
    }

    // Play the active scene's voiceover
    if (activeSceneId && map.has(activeSceneId)) {
      const el = map.get(activeSceneId)!;
      if (voActiveRef.current !== activeSceneId) {
        // New scene — seek and play
        el.currentTime = offsetInScene;
        el.play().catch(() => {});
        voActiveRef.current = activeSceneId;
      }
    } else {
      voActiveRef.current = null;
    }
  });

  // Keep timeRef in sync with currentTime prop (for scrubbing)
  useEffect(() => {
    timeRef.current = currentTime;
  }, [currentTime]);

  // ── Ambient audio: start/stop in sync with playing ────────────────────
  useEffect(() => {
    const player = getAmbientPlayer();
    const trackKey = audio?.track;
    const volume   = audio?.volume ?? 0.6;

    if (playing && trackKey && trackKey !== "none") {
      if (audioActiveRef.current !== trackKey) {
        player.play(trackKey, volume);
        audioActiveRef.current = trackKey;
      }
    } else {
      if (player.playing) {
        player.stop();
        audioActiveRef.current = null;
      }
    }
  }, [playing, audio?.track, audio?.volume]);

  // Stop audio when component unmounts
  useEffect(() => {
    return () => {
      getAmbientPlayer().stop();
      for (const [, el] of voAudiosRef.current) {
        el.pause();
        el.src = "";
      }
      voAudiosRef.current.clear();
    };
  }, []);

  // ── Live volume changes ───────────────────────────────────────────────
  useEffect(() => {
    if (audio?.volume !== undefined && getAmbientPlayer().playing) {
      getAmbientPlayer().setVolume(audio.volume);
    }
  }, [audio?.volume]);

  // ── Canvas RAF loop ───────────────────────────────────────────────────
  const drawFrame = useCallback((ts: number) => {
    if (!compiledVideo || !canvasRef.current) return;

    if (playing) {
      const delta = lastTsRef.current !== null ? (ts - lastTsRef.current) / 1000 : 0;
      lastTsRef.current = ts;
      timeRef.current += delta;

      if (timeRef.current >= compiledVideo.totalDuration) {
        timeRef.current = 0; // loop
      }
      onTimeUpdate(timeRef.current);
    } else {
      lastTsRef.current = null;
    }

    const ctx = canvasRef.current.getContext("2d");
    if (ctx) render(ctx, compiledVideo, timeRef.current);

    rafRef.current = requestAnimationFrame(drawFrame);
  }, [compiledVideo, playing, onTimeUpdate]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawFrame]);

  // Size canvas to match CompiledVideo dimensions
  const width  = compiledVideo?.width  ?? 1280;
  const height = compiledVideo?.height ?? 720;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className ?? "w-full rounded-lg bg-black"}
    />
  );
}
