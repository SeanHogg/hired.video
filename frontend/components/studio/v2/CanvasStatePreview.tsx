/**
 * CanvasStatePreview — playback wrapper around `<CanvasStage/>`.
 *
 * Single source of truth for "how do we play a v2 canvas state on screen?"
 * Mounts the SAME `CanvasStage` the editor uses, just in `mode="playback"`
 * with the active scene + playhead-derived time wired in. Consumed by:
 *   - {@link PreviewOverlay} (the in-editor fullscreen preview the user
 *     hits with the play button)
 *   - {@link components/templates/TemplatePlayer} (the marketplace
 *     `/marketplace/templates/<slug>` press-play preview)
 *   - {@link StudioVideoSurface} → {@link PublicStudioCanvas} (the
 *     public `/v/<id>` watch page)
 *
 * Per the unification: there is ONE on-screen renderer — `CanvasStage` —
 * and editor edit + editor play + public watch all hit it through here.
 * The canvas-2D pipeline (`renderTimelineFrame`) is reserved for headless
 * export-to-WebM where there's no DOM available. No more DOM-vs-canvas
 * divergence on text wrapping, font metrics, or linked-content fidelity.
 *
 * Branding watermark is rendered self-gated inside `<BrandWatermark/>` —
 * no prop drilling of "show branding?".
 */
import { useEffect, useRef, useState } from "react";
import BrandWatermark from "@/components/studio/shared/BrandWatermark";
import { emptyScene, type CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import type { PreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import { cn } from "@/lib/utils";
import CanvasStage from "./CanvasStage";

export interface CanvasStatePreviewProps {
  state: CanvasState;
  /** Caller-owned playback hook so the surrounding chrome (scrubber,
   *  play/pause button) can read + control time. Both consumers use
   *  `usePreviewPlayback(state)` to produce this. */
  playback: PreviewPlayback;
  /** Outer container styling. The component fills the box and computes
   *  zoom from its measured size — caller controls aspect via the
   *  wrapping element. */
  className?: string;
}

export default function CanvasStatePreview({
  state,
  playback,
  className,
}: CanvasStatePreviewProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Observe the wrapping element so the preview re-fits when its parent
  // resizes (window resize, fullscreen toggle, sidebar collapse). Avoids
  // hard-coding viewport math — the component fits whatever box it lives in.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const rect = entry.contentRect;
      setBox({ w: rect.width, h: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (state.scenes.length === 0) {
    return (
      <div
        ref={wrapRef}
        className={cn(
          "flex h-full w-full items-center justify-center text-xs text-muted-foreground",
          className,
        )}
      >
        Empty canvas
      </div>
    );
  }

  // Active scene at the current playhead. `usePreviewPlayback` already
  // maps playhead → scene id, so consumers never recompute "what scene
  // are we in?" — single source of truth.
  const activeScene =
    state.scenes.find((s) => s.id === playback.activeSceneIdAtPlayhead) ??
    state.scenes[0] ??
    emptyScene("Scene 1");

  const zoom =
    box.w > 0 && box.h > 0
      ? Math.max(0.05, Math.min(box.w / state.width, box.h / state.height))
      : 0.05;

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden",
        className,
      )}
    >
      <div className="relative">
        <CanvasStage
          scene={activeScene}
          canvasWidth={state.width}
          canvasHeight={state.height}
          zoom={zoom}
          mode="playback"
          currentTimeSec={playback.activeSceneElapsed}
          selection={{ kind: "scene", sceneId: activeScene.id }}
          defaultFontId={state.fontFamily}
        />
        {/* BrandWatermark self-gates (returns null for Pro users who've
            opted out via project state). Positioned bottom-right of the
            stage to match the render pipeline's placement. */}
        <BrandWatermark size="md" className="absolute bottom-3 right-3 z-10" />
      </div>
    </div>
  );
}
