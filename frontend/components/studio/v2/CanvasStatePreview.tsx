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
 * the same `CanvasState`. Preview mounts `<CanvasV2Preview/>` — a real
 * HTML `<canvas>` running the same `canvas-v2:*` effect registry the
 * export pipeline uses (`renderTimelineFrame`). Player and export
 * therefore can't drift on widget rendering. The DOM-based
 * `<CanvasStage/>` is retained for edit-mode only (drag / select /
 * resize handles), not for playback.
 *
 * Branding watermark is rendered self-gated inside `<BrandWatermark/>` —
 * no prop drilling of "show branding?".
 */
import { useEffect, useRef, useState } from "react";
import BrandWatermark from "@/components/studio/shared/BrandWatermark";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import type { PreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import { cn } from "@/lib/utils";
import CanvasV2Preview from "./CanvasV2Preview";

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

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden",
        className,
      )}
    >
      <div className="relative">
        <CanvasV2Preview
          state={state}
          playback={playback}
          zoom={
            box.w > 0 && box.h > 0
              ? Math.max(0.05, Math.min(box.w / state.width, box.h / state.height))
              : 0.05
          }
        />
        {/* BrandWatermark self-gates (returns null for Pro users who've
            opted out via project state). Positioned bottom-right of the
            stage to match the render pipeline's placement. */}
        <BrandWatermark size="md" className="absolute bottom-3 right-3 z-10" />
      </div>
    </div>
  );
}
