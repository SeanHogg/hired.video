// VideoPreview.tsx — canvas RAF loop calling frameRenderer.render().

import { useEffect, useRef, useCallback } from "react";
import { render } from "@/lib/renderer/frame-renderer";
import type { CompiledVideo } from "@/lib/compiler/types";

interface Props {
  compiledVideo: CompiledVideo | null;
  playing: boolean;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  className?: string;
}

export default function VideoPreview({ compiledVideo, playing, currentTime, onTimeUpdate, className }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const timeRef     = useRef(currentTime);
  const lastTsRef   = useRef<number | null>(null);

  // Keep timeRef in sync with currentTime prop (for scrubbing)
  useEffect(() => {
    timeRef.current = currentTime;
  }, [currentTime]);

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
