// VideoPreview.tsx — canvas RAF loop calling frameRenderer.render().
// When an audio track is provided it is played/paused in sync with the video.

import { useEffect, useRef, useCallback } from "react";
import { render } from "@/lib/renderer/frame-renderer";
import type { CompiledVideo } from "@/lib/compiler/types";
import type { VideoAudio } from "@/types/video-script";
import { getAmbientPlayer } from "@/lib/audio/ambient-player";

interface Props {
  compiledVideo: CompiledVideo | null;
  playing: boolean;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  className?: string;
  audio?: VideoAudio;
}

export default function VideoPreview({ compiledVideo, playing, currentTime, onTimeUpdate, className, audio }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const timeRef     = useRef(currentTime);
  const lastTsRef   = useRef<number | null>(null);
  const audioActiveRef = useRef<string | null>(null);

  // Keep timeRef in sync with currentTime prop (for scrubbing)
  useEffect(() => {
    timeRef.current = currentTime;
  }, [currentTime]);

  // ── Audio: start/stop in sync with playing ────────────────────────────────
  useEffect(() => {
    const player = getAmbientPlayer();
    const trackKey = audio?.track;
    const volume   = audio?.volume ?? 0.6;

    if (playing && trackKey && trackKey !== "none") {
      if (audioActiveRef.current !== trackKey) {
        // New track or first play
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
    return () => { getAmbientPlayer().stop(); };
  }, []);

  // ── Live volume changes ───────────────────────────────────────────────────
  useEffect(() => {
    if (audio?.volume !== undefined && getAmbientPlayer().playing) {
      getAmbientPlayer().setVolume(audio.volume);
    }
  }, [audio?.volume]);

  // ── Canvas RAF loop ───────────────────────────────────────────────────────
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
