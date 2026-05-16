/**
 * CanvasStatePreview — fit-to-container live preview of a `CanvasState`.
 *
 * Single source of truth for "how do we play a v2 canvas state on screen?"
 * Consumed by:
 *   - {@link PreviewOverlay} (the in-editor fullscreen preview the user
 *     hits with the play button)
 *   - {@link components/templates/TemplatePlayer} (the marketplace
 *     `/marketplace/templates/<slug>` press-play preview)
 *
 * Per the DRY rule: both surfaces render the IDENTICAL pixel output for
 * the same `CanvasState`. Previously the marketplace player went through
 * the legacy v1 `compile()` + scene-graph renderer while the editor used
 * `CanvasStage`, so visitors saw a different composition from what they
 * landed on after clicking Use — this component closes that gap.
 *
 * The component owns layout (centered + fit-zoom via ResizeObserver) and
 * mounts `<CanvasStage mode="preview">` with the active scene supplied by
 * the caller's `usePreviewPlayback` hook. Selection / drop / move are
 * frozen no-ops (the stage is non-interactive in preview mode anyway).
 *
 * Branding watermark is rendered self-gated inside `<BrandWatermark/>` —
 * no prop drilling of "show branding?".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import BrandWatermark from "@/components/studio/shared/BrandWatermark";
import type { CanvasState, Scene } from "@/lib/studio/editor-v2/canvas-state";
import type { PreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import { cn } from "@/lib/utils";
import CanvasStage, { type Selection } from "./CanvasStage";

const FROZEN_SELECTION: Selection = { kind: "scene", sceneId: "__preview__" };
const NO_OP_SELECT = () => {};
const NO_OP_DROP = () => {};
const NO_OP_MOVE = () => {};

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
  /** Called when a CTA widget in the preview is activated. */
  onCtaActivate?: (url: string) => void;
}

export default function CanvasStatePreview({
  state,
  playback,
  className,
  onCtaActivate,
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

  const activeScene: Scene | undefined = useMemo(
    () =>
      state.scenes.find((s) => s.id === playback.activeSceneIdAtPlayhead) ??
      state.scenes[0],
    [state.scenes, playback.activeSceneIdAtPlayhead],
  );

  if (!activeScene) {
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
          onCtaActivate={onCtaActivate}
        />
        {/* BrandWatermark self-gates (returns null for Pro users who've
            opted out via project state). Positioned bottom-right of the
            stage to match the render pipeline's placement. */}
        <BrandWatermark size="md" className="absolute bottom-3 right-3 z-10" />
      </div>
    </div>
  );
}
