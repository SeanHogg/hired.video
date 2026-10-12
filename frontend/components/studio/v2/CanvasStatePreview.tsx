/**
 * CanvasStatePreview — playback wrapper around `<CanvasStage/>`.
 *
 * Single source of truth for "how do we play a v2 canvas state on screen?"
 * Mounts the SAME `CanvasStage` the editor uses, just in `mode="playback"`
 * with the active scene + playhead-derived time wired in. Consumed by:
 *   - {@link components/templates/TemplatePlayer} (the marketplace
 *     `/marketplace/templates/<slug>` press-play preview)
 *   - {@link StudioVideoSurface} → {@link PublicStudioCanvas} (the
 *     public `/v/<id>` watch page)
 *
 * The fullscreen {@link PreviewOverlay} no longer mounts this: it paints
 * frames through the export compositor (`TimelineFramePreview`) so scene
 * filters and transitions play exactly as exported (#742, #570). The
 * inline players above still use the DOM stage.
 *
 * Branding watermark is rendered self-gated inside `<BrandWatermark/>` —
 * no prop drilling of "show branding?".
 */
import { useEffect, useRef, useState } from "react";
import BrandWatermark from "@/components/studio/shared/BrandWatermark";
import InteractionZonesOverlay from "@/components/video/InteractionZonesOverlay";
import type { CtaHotzone } from "@shared/cta-hotzones";
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
  /** The public payload's UTM-baked CTA hot-zones. Every clickable zone
   *  (CTAs included) is otherwise derived from `state` through the widget
   *  plugins' `interactions` and rendered INSIDE the stage-sized box, so
   *  no consumer can mount the canvas without its clickable widgets.
   *  Supply this only where the API payload exists (public watch page). */
  ctaHotzones?: CtaHotzone[];
  /** Studio project id forwarded to the CTA overlay so it self-fires the
   *  cta-click analytics call. Omit on editor previews (shouldn't count
   *  toward the owner's CTR). */
  analyticsProjectId?: string;
  /** Studio project the canvas belongs to — its engagement widgets (forms,
   *  chapters, thumbnails, review pins) become interactive during playback
   *  (#1586). Omit when there is no saved project. */
  projectId?: string | null;
}

export default function CanvasStatePreview({
  state,
  playback,
  className,
  ctaHotzones,
  analyticsProjectId,
  projectId,
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
        {/* Every clickable widget (CTA links, forms, chapter jumps,
            thumbnail click-through, review threads), derived from the
            Timeline through the widget registry. Mounted INSIDE this
            stage-sized box (not the outer fitting container) so the
            fractional zones line up with the rendered frame even when it's
            letterboxed. Self-gates to null when nothing is active. */}
        <InteractionZonesOverlay
          state={state}
          playback={playback}
          ctaHotzones={ctaHotzones}
          analyticsProjectId={analyticsProjectId}
          projectId={projectId}
        />
        {/* BrandWatermark self-gates (returns null for Pro users who've
            opted out via project state). Positioned bottom-right of the
            stage to match the render pipeline's placement. */}
        <BrandWatermark size="md" className="absolute bottom-3 right-3 z-10" />
      </div>
    </div>
  );
}
