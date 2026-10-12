/**
 * Fullscreen preview overlay for the v2 canvas editor.
 *
 * Owns only the fullscreen CHROME (close button, decorative backdrop,
 * play/pause/scrubber footer). Frames are painted by
 * `<TimelineFramePreview/>` through the export's own compositor
 * (`renderTimelineFrame` over `canvasStateToTimeline(state)`), so scene
 * filters, effects, scene transitions and the watermark play here exactly
 * as the exported MP4 carries them (#742, #570, #583).
 *
 * The component still receives `playback` from the parent so the
 * editor's inline scrubber stays in sync — closing the overlay doesn't
 * reset progress. TimelineFramePreview just consumes it.
 */
import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import type { CtaHotzone } from "@shared/cta-hotzones";
import TimelineFramePreview from "./TimelineFramePreview";
import PlaybackControls from "./PlaybackControls";

export interface PreviewOverlayProps {
  state: CanvasState;
  /** Receives the parent shell's playback hook so timecode/state stays
   *  synced with the editor's inline scrubber — closing the overlay
   *  doesn't reset progress. */
  playback: ReturnType<typeof usePreviewPlayback>;
  onClose: () => void;
  /** The public payload's UTM-baked CTA hot-zones, forwarded to
   *  <TimelineFramePreview/>. Omit on the editor preview: the CTA zones
   *  are then derived from `state` through the widget plugins. */
  ctaHotzones?: CtaHotzone[];
  /** Forwarded to the CTA overlay for cta-click analytics. Omit on
   *  editor previews. */
  analyticsProjectId?: string;
  /** The editor's saved project id — engagement-asset cards read their
   *  titles from it, exactly as the export does. Omit elsewhere. */
  projectId?: string | null;
}

export default function PreviewOverlay({
  state,
  playback,
  onClose,
  ctaHotzones,
  analyticsProjectId,
  projectId,
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
      // Keys typed into a field (an engagement form opened over the
      // preview, #1586) or handled by an open dialog aren't player keys.
      const target = e.target as HTMLElement | null;
      if (e.defaultPrevented || target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      if (e.key === "Escape") onClose();
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        playback.toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playback, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink">
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
        <TimelineFramePreview
          state={state}
          playback={playback}
          ctaHotzones={ctaHotzones}
          analyticsProjectId={analyticsProjectId}
          projectId={projectId}
        />
      </div>

      {/* Shared <PlaybackControls/> — same component the public watch
          page mounts. Editor and public surface can't drift. */}
      <PlaybackControls playback={playback} className="relative z-10 bg-transparent" />
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
          className="absolute rounded-full bg-brand-primary"
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

