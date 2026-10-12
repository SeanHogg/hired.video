/**
 * TimelineFramePreview — playback painted frame-by-frame through the export
 * compositor (`renderTimelineFrame` over `canvasStateToTimeline(state)` via
 * `useTimelineFramePlayer`), so what plays here is what the MP4 carries:
 * scene filters, effects, scene transitions and the watermark
 * (#742, #570, #583, #2392).
 *
 * This is the playback surface for BOTH the fullscreen editor overlay
 * (`PreviewOverlay`) and inline players (watch-page `StudioVideoSurface`,
 * marketplace `TemplatePlayer`, `CanvasStatePreview`). Prop-compatible with
 * `CanvasStatePreview`, including `className`.
 *
 * The interactive DOM stage (`CanvasStage`) stays the EDITING surface —
 * CSS filters and hard cuts do not belong here. CTA hot-zones and
 * engagement widgets stay clickable over the painted frame, aligned to the
 * stage box (#1586, #2312). Branding is painted by the compositor (not a
 * DOM overlay) so it matches export.
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
import { cn } from "@/lib/utils";

export interface TimelineFramePreviewProps {
  state: CanvasState;
  playback: PreviewPlayback;
  /** Outer container styling. The component fills the box and fits the
   *  painted frame inside it — same contract as `CanvasStatePreview`. */
  className?: string;
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
  className,
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
    <div
      ref={wrapRef}
      data-preview="export-frames"
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden",
        className,
      )}
    >
      {empty && <span className="text-xs text-muted-foreground">{t("studio.preview.emptyCanvas")}</span>}
      {/* The canvas stays mounted (hidden when empty) so the frame player
          binds to it once for the life of the overlay. Bitmap size is the
          composition so inline 9:16 / 1:1 / 16:9 hosts never stretch a
          default 300×150 canvas before `player.load`. */}
      <div
        className={empty ? "hidden" : "relative"}
        style={{ width: state.width * fit, height: state.height * fit }}
      >
        <canvas
          ref={canvasRef}
          width={state.width}
          height={state.height}
          role="img"
          aria-label={t("studio.preview.frameLabel")}
          aria-busy={!ready}
          data-frame-source="export"
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
