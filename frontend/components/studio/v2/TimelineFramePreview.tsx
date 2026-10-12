/**
 * TimelineFramePreview — the fullscreen playback preview, painted frame by
 * frame through the export's compositor (`renderTimelineFrame` over
 * `canvasStateToTimeline(state)`), so what plays here is what the MP4
 * carries: scene filters, effects, scene transitions and the watermark
 * (#742, #570, #583).
 *
 * The interactive DOM stage (`CanvasStage`) stays the EDITING surface; this
 * component replaces it only for full-screen playback. CTA hot-zones and
 * engagement widgets stay clickable over the painted frame, aligned to the
 * stage box.
 */
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import InteractionZonesOverlay from "@/components/video/InteractionZonesOverlay";
import { useElementSize } from "@/hooks/use-element-size";
import type { CtaHotzone } from "@shared/cta-hotzones";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import type { PreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import { useTimelineFramePlayer } from "@/lib/studio/editor-v2/use-timeline-frame-player";

export interface TimelineFramePreviewProps {
  state: CanvasState;
  playback: PreviewPlayback;
  /** The public payload's UTM-baked CTA hot-zones (see
   *  InteractionZonesOverlay); omit to derive them from `state`. */
  ctaHotzones?: CtaHotzone[];
  /** Forwarded to the CTA overlay for cta-click analytics. */
  analyticsProjectId?: string;
  /** Saved project whose engagement-asset titles the cards read (the
   *  export preloads the same titles). */
  projectId?: string | null;
}

export default function TimelineFramePreview({
  state,
  playback,
  ctaHotzones,
  analyticsProjectId,
  projectId,
}: TimelineFramePreviewProps) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const box = useElementSize(wrapRef);
  const { ready } = useTimelineFramePlayer({
    canvasRef,
    state,
    playhead: playback.playhead,
    projectId,
  });

  const fit =
    box && box.width > 0 && box.height > 0
      ? Math.min(box.width / state.width, box.height / state.height)
      : 0;
  const empty = state.scenes.length === 0;

  return (
    <div ref={wrapRef} className="relative flex h-full w-full items-center justify-center overflow-hidden">
      {empty && <span className="text-xs text-muted-foreground">{t("studio.preview.emptyCanvas")}</span>}
      {/* The canvas stays mounted (hidden when empty) so the frame player
          binds to it once for the life of the overlay. */}
      <div
        className={empty ? "hidden" : "relative"}
        style={{ width: state.width * fit, height: state.height * fit }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={t("studio.preview.frameLabel")}
          className="block h-full w-full bg-black"
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            <span className="sr-only">{t("studio.preview.loadingFrames")}</span>
          </div>
        )}
        {/* CTAs and engagement widgets are painted into the frame; this
            makes them interactive (#1586, #2312). Self-gates to null. */}
        <InteractionZonesOverlay
          state={state}
          playback={playback}
          ctaHotzones={ctaHotzones}
          analyticsProjectId={analyticsProjectId}
          projectId={projectId}
        />
      </div>
    </div>
  );
}
