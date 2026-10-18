import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { useTranslation } from "react-i18next";

import TimelineFramePreview from "@/components/studio/v2/TimelineFramePreview";
import PlaybackControls from "@/components/studio/v2/PlaybackControls";
import PreviewOverlay from "@/components/studio/v2/PreviewOverlay";
import { emptyCanvasState, type CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { usePreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import { EngagementAudienceProvider } from "@/lib/studio/engagement/engagement-audience";

import NotReadyMessage from "./NotReadyMessage";
import RawVideoPlayback from "./RawVideoPlayback";
import { useCanvasPlayheadTracker } from "./use-canvas-playhead-tracker";

// ─── Public studio canvas wrapper ────────────────────────────────────────────
// Owns the playback state for the public surface and mounts the same
// <TimelineFramePreview/> + <PlaybackControls/> the editor preview uses,
// wrapped in a rounded card.

export default function PublicStudioCanvas({
  canvasState,
  videoUrl,
  autoplay,
  analyticsProjectId,
  hotzones,
  className,
}: {
  canvasState: CanvasState | null;
  videoUrl: string | null;
  /** Auto-start the canvas playback on mount + loop on end (live-
   *  thumbnail feel). When false the surface hydrates to the first
   *  frame paused and the user clicks the Play overlay to start. */
  autoplay?: boolean;
  analyticsProjectId?: string;
  /** CTA hot-zones authored on the project's Timeline. Overlaid on
   *  top of the canvas/MP4 as clickable anchors when the playhead is
   *  inside each zone's [startSec, endSec) window. Click capture is
   *  self-fired by <CtaHotzonesOverlay> off `analyticsProjectId`. */
  hotzones?: { startSec: number; endSec: number; x: number; y: number; w: number; h: number; url: string }[];
  className?: string;
}) {
  const { t } = useTranslation();
  // Autoplay surfaces start muted — matches both the browser
  // muted-autoplay policy and the flat/baked branches (which default
  // `muted = autoplay`). The shared <PlaybackControls/> renders a
  // toggle so the viewer can unmute with a click.
  const playback = usePreviewPlayback(canvasState ?? emptyCanvasState(), {
    initialMuted: Boolean(autoplay),
  });
  const [started, setStarted] = useState(Boolean(autoplay));
  // Fullscreen handoff to the same <PreviewOverlay/> the studio editor
  // uses. Shared `playback` means progress is continuous across the
  // open/close transition — closing the overlay drops the viewer back
  // onto the inline canvas at the frame they were watching.
  const [expanded, setExpanded] = useState(false);

  // Auto-start once the canvas hydrates.
  useEffect(() => {
    if (!autoplay || !canvasState) return;
    playback.seek(0);
    playback.play();
    setStarted(true);
    // Only re-run when the project or autoplay flag changes — we don't
    // want a re-trigger on every playhead tick from the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, canvasState]);

  // Settle behaviour at natural end. With `autoplay` we loop (live-
  // thumbnail feel for the hero); without it we drop back to the
  // first-frame paused state with the Play overlay.
  useEffect(() => {
    if (!playback.duration || playback.isPlaying) return;
    if (playback.playhead < playback.duration) return;
    if (autoplay && canvasState) {
      playback.seek(0);
      playback.play();
    } else if (started) {
      setStarted(false);
    }
  }, [started, playback.isPlaying, playback.playhead, playback.duration, autoplay, canvasState]);

  // Per-second engagement tracking on the canvas branch. The tracker's
  // playhead-mode API matches what we drive the live preview with —
  // no <video> element required. Same telemetry shape as the baked-MP4
  // branch so analytics dashboards don't have to branch by source.
  useCanvasPlayheadTracker(analyticsProjectId, canvasState, playback);

  const aspectRatio = canvasState
    ? `${canvasState.width}/${canvasState.height}`
    : "16/9";

  // v2 canvas-state branch — mounts the SAME <TimelineFramePreview/> the
  // editor's preview overlay and the marketplace TemplatePlayer use.
  // Single source of truth: what you see here is what the editor shows.
  if (canvasState) {
    // Viewer surface: engagement widgets read the ONE public read (never
    // the owner listings), so signed-out and signed-in viewers alike get
    // forms / chapters / thumbnails and no review threads (#1586).
    return (
      <EngagementAudienceProvider value="public">
        <div
          className={`overflow-hidden rounded-xl bg-black shadow-lg ${className ?? ""}`}
        >
          <div className="relative w-full" style={{ aspectRatio }}>
            {/* CTA hot-zones now ride INSIDE <TimelineFramePreview/> (the
                single on-screen renderer) so they stay clickable + aligned
                to the stage in every layout — including the fullscreen
                <PreviewOverlay/> below, which previously baked the CTA
                pixels but never made them interactive. The overlay
                self-gates (null outside any zone window) and self-fires
                the cta-click analytics off `analyticsProjectId`. */}
            <TimelineFramePreview
              state={canvasState}
              playback={playback}
              ctaHotzones={hotzones ?? []}
              analyticsProjectId={analyticsProjectId}
              projectId={analyticsProjectId}
            />
            {!started && (
              <button
                type="button"
                onClick={() => {
                  playback.seek(0);
                  playback.play();
                  setStarted(true);
                }}
                aria-label={t("studio.videoSurface.play")}
                className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 transition hover:bg-black/30"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-foreground shadow-xl backdrop-blur">
                  <Play className="ml-1 h-7 w-7 fill-current" />
                </span>
              </button>
            )}
          </div>
          {/* Shared <PlaybackControls/> — identical chrome to the editor
              preview overlay. Play/pause + scrubber + timecode in one
              component so the surfaces can't drift. The expand button
              hands fullscreen off to <PreviewOverlay/>; setting
              `started` here keeps the cold-start Play overlay from
              flashing back in when the viewer closes the overlay
              mid-video. */}
          <PlaybackControls
            playback={playback}
            onExpand={() => {
              setStarted(true);
              setExpanded(true);
            }}
          />
        </div>
        {expanded && (
          <PreviewOverlay
            state={canvasState}
            playback={playback}
            onClose={() => setExpanded(false)}
            ctaHotzones={hotzones ?? []}
            analyticsProjectId={analyticsProjectId}
            projectId={analyticsProjectId}
          />
        )}
      </EngagementAudienceProvider>
    );
  }

  // No canvas-state but a baked MP4 exists (legacy direct upload — never
  // edited through the studio). Play it raw with native controls. The
  // <video> element gets the standard `attach()` analytics tracker so
  // every public-surface playback funnels to the same telemetry.
  if (videoUrl) {
    return (
      <RawVideoPlayback
        url={videoUrl}
        analyticsProjectId={analyticsProjectId}
        hotzones={hotzones ?? []}
        className={className}
      />
    );
  }

  // Same kind-aware "not ready" fallback as PublicVideoDispatch — see
  // notes there. Reaching this branch means the project has neither
  // a canvas state nor a baked MP4 yet; we honour the kind in the
  // copy so a podcast doesn't say "Video is being processed".
  return <NotReadyMessage mediaKind={undefined} className={className} />;
}
