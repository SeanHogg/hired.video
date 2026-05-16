/**
 * Fullscreen preview overlay for the v2 canvas editor.
 *
 * Mounts the active scene + widgets at full viewport size with the same
 * `usePreviewPlayback` hook the inline editor uses — single source of
 * truth for "what plays?". No editing affordances (palette, props
 * panel) are shown; the user just watches.
 *
 * Reuses `<SceneThumbnail>` would NOT be right here — thumbnails are
 * stylised glyphs, not full text. We mount the same widget bodies the
 * canvas does by importing CanvasStage and locking its select / drag
 * handlers to no-ops. This guarantees the preview matches what the user
 * sees while editing (DRY: one widget renderer, two consumers).
 */
import { useEffect, useMemo, useState } from "react";
import { X, Play, Pause, SkipBack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import type { CanvasState, Scene } from "@/lib/studio/editor-v2/canvas-state";
import CanvasStage, { type Selection } from "./CanvasStage";
import BrandWatermark from "@/components/studio/shared/BrandWatermark";

export interface PreviewOverlayProps {
  state: CanvasState;
  /** Receives the parent shell's playback hook so timecode/state stays
   *  synced with the editor's inline scrubber — closing the overlay
   *  doesn't reset progress. */
  playback: ReturnType<typeof usePreviewPlayback>;
  onClose: () => void;
}

// Selection / drop / move don't apply in preview — CanvasStage's `mode`
// prop disables those handlers entirely. We still have to provide values
// to satisfy the prop signature, so these no-ops never actually fire.
const FROZEN_SELECTION: Selection = { kind: "scene", sceneId: "__preview__" };
const NO_OP_SELECT = () => {};
const NO_OP_DROP = () => {};
const NO_OP_MOVE = () => {};

export default function PreviewOverlay({
  state,
  playback,
  onClose,
}: PreviewOverlayProps) {
  // Auto-play on mount, pause on unmount. We deliberately omit
  // `playback` from deps — every effect re-run would re-trigger play()
  // and fight the user; mount/unmount semantics are what we want.
  useEffect(() => {
    playback.play();
    return () => playback.pause();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        playback.toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playback, onClose]);

  const viewport = useViewportSize();

  const activeScene: Scene =
    state.scenes.find((s) => s.id === playback.activeSceneIdAtPlayhead) ??
    state.scenes[0];
  if (!activeScene) return null;

  // Fit the canvas to the viewport while preserving aspect ratio.
  const fitZoom = Math.min(
    (viewport.w - 80) / state.width,
    (viewport.h - 140) / state.height,
  );

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-br from-[#1a0b2e] via-black to-[#0d0716]">
      {/* Decorative particle backdrop — same vibe v1's preview gives. */}
      <PreviewParticles />

      <header className="relative z-10 flex items-center justify-end px-4 py-3 text-white">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-9 w-9 rounded-full p-0 text-white hover:bg-white/10"
          aria-label="Close preview"
        >
          <X className="h-5 w-5" />
        </Button>
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center overflow-hidden p-6">
        <div className="relative">
          <CanvasStage
            scene={activeScene}
            canvasWidth={state.width}
            canvasHeight={state.height}
            zoom={Math.max(0.1, fitZoom)}
            selection={FROZEN_SELECTION}
            onSelect={NO_OP_SELECT}
            onWidgetDrop={NO_OP_DROP}
            onWidgetMove={NO_OP_MOVE}
            playheadInScene={
              playback.activeSceneIdAtPlayhead === activeScene.id
                ? playback.activeSceneElapsed
                : 0
            }
            defaultFontId={state.fontFamily}
            mode="preview"
            onCtaActivate={() => playback.pause()}
          />
          {/* hired.video brand watermark — self-gates via subscription
              + project-level "remove branding" flag (handled inside the
              shared BrandWatermark component). Positioned bottom-right
              of the stage, matching v1's render-time placement. */}
          <BrandWatermark
            size="md"
            className="absolute right-3 bottom-3 z-10"
          />
        </div>
      </div>

      <footer className="relative z-10 flex items-center justify-center gap-3 px-4 py-4 text-white">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => playback.seek(0)}
          aria-label="Back to start"
          className="h-10 w-10 rounded-full p-0 text-white hover:bg-white/10"
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={playback.toggle}
          aria-label={playback.isPlaying ? "Pause" : "Play"}
          className="h-12 w-12 rounded-full p-0"
        >
          {playback.isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5" />
          )}
        </Button>
        <input
          type="range"
          min={0}
          max={Math.max(0.1, playback.duration)}
          step={0.05}
          value={playback.playhead}
          onChange={(e) => playback.seek(Number(e.target.value))}
          className="h-1 w-80 cursor-pointer accent-brand-purple"
          aria-label="Playhead"
        />
        <span className="min-w-[6rem] text-center text-xs tabular-nums opacity-80">
          {fmt(playback.playhead)} / {fmt(playback.duration)}
        </span>
      </footer>
    </div>
  );
}

/**
 * Static-but-decorative particle field rendered behind the preview
 * stage. Self-gates: returns null on SSR / when window is unavailable.
 * Deliberately pseudo-random — generated once via useMemo + a seeded
 * RNG so the field stays stable across re-renders (jittering particles
 * would distract from the video).
 */
function PreviewParticles() {
  const dots = useMemo(() => {
    const arr: Array<{ x: number; y: number; size: number; opacity: number }> = [];
    let seed = 1337;
    const rand = () => {
      // Mulberry32 — deterministic so the field doesn't reshuffle on
      // every re-render.
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 60; i++) {
      arr.push({
        x: rand() * 100,
        y: rand() * 100,
        size: 1 + rand() * 2.5,
        opacity: 0.15 + rand() * 0.5,
      });
    }
    return arr;
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {dots.map((d, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-brand-purple"
          style={{
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: `${d.size}px`,
            height: `${d.size}px`,
            opacity: d.opacity,
            boxShadow: `0 0 ${d.size * 3}px rgba(167,139,250,${d.opacity})`,
          }}
        />
      ))}
    </div>
  );
}

function useViewportSize(): { w: number; h: number } {
  const [size, setSize] = useState(() =>
    typeof window === "undefined"
      ? { w: 1280, h: 720 }
      : { w: window.innerWidth, h: window.innerHeight },
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onResize() {
      setSize({ w: window.innerWidth, h: window.innerHeight });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}
