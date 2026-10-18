import { useMemo } from "react";

import AspectFrame from "@/components/AspectFrame";
import { resolvePublicCanvasState } from "@/lib/studio/public-canvas-state";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import type { AspectRatioInput } from "@/lib/studio/aspect";
import type { PublicVideoReady } from "@/lib/studio/public-video-schema";

import NotReadyMessage from "./NotReadyMessage";
import PublicStudioCanvas from "./PublicStudioCanvas";
import { youtubeEmbedUrl } from "./youtube-embed";

// ─── Inner dispatch ─────────────────────────────────────────────────────────
// Picks the right embed for the project's payload. Per the DRY rule the
// caller passes the raw ready payload, NOT a "useStudioPlayer" boolean
// it could compute itself. All surfaces — eager (public watch page),
// lazy (cards, resume header, profile header), and the editor's
// preview overlay — converge here, then mount <TimelineFramePreview/>
// off `timelineSpec` so the canvas first frame is what every consumer
// sees on mount.

export default function PublicVideoDispatch({
  ready,
  title,
  aspectRatio,
  className,
  autoplay,
  analyticsProjectId,
}: {
  ready: PublicVideoReady;
  title: string;
  aspectRatio?: AspectRatioInput;
  className?: string;
  /** Auto-start playback after the canvas hydrates ("live thumbnail"
   *  feel for hero/channel surfaces). YouTube branch maps this to
   *  autoplay-muted-loop iframe params. */
  autoplay?: boolean;
  analyticsProjectId?: string;
}) {
  const isRealYouTube =
    !!ready.youtubeVideoId && !ready.youtubeVideoId.startsWith("yt_");
  const directVideoUrl =
    ready.videoUrl && !ready.videoUrl.includes("youtube.com/watch?v=yt_")
      ? ready.videoUrl
      : null;
  // The playback state is V2 CanvasState — the same shape the editor
  // edits and <TimelineFramePreview/> renders. `timelineSpec` is
  // authoritative; a project saved by the deleted V1 editor arrives as
  // `legacyScript` and is converted at read time (#721).
  const canvasState = useMemo<CanvasState | null>(
    () => resolvePublicCanvasState(ready),
    [ready],
  );

  if (isRealYouTube) {
    return (
      <AspectFrame
        ratio={aspectRatio}
        className={`rounded-xl overflow-hidden bg-black shadow-lg ${className ?? ""}`}
      >
        <iframe
          src={youtubeEmbedUrl(ready.youtubeVideoId!, {
            autoplay,
            muted: autoplay,
            controls: true,
            loop: autoplay,
          })}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      </AspectFrame>
    );
  }

  // Studio-backed playback — canvas-state OR baked MP4. Mounts the
  // same <TimelineFramePreview/> that the editor's preview overlay uses,
  // so the public watch page renders the IDENTICAL pixels the user
  // saw in the editor.
  if (canvasState || directVideoUrl) {
    return (
      <PublicStudioCanvas
        canvasState={canvasState}
        videoUrl={directVideoUrl}
        autoplay={autoplay}
        analyticsProjectId={analyticsProjectId}
        hotzones={ready.ctaHotzones}
        className={className}
      />
    );
  }

  if (ready.thumbnailUrl) {
    return (
      <AspectFrame
        ratio={aspectRatio}
        className={`rounded-xl overflow-hidden bg-black shadow-lg ${className ?? ""}`}
      >
        <img
          src={ready.thumbnailUrl}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      </AspectFrame>
    );
  }

  // Final-fallback "not playable yet" — non-video mediaKinds should
  // have been dispatched to their own runtime via <ProjectPlayer/>
  // before reaching this branch (image / game / animation / cad). If
  // we're here for a non-Timeline kind it means a caller mounted us
  // directly with an incomplete payload; the kind-aware copy below
  // is honest about that instead of telling a user looking at a
  // Photoshop drawing that their "video" is processing.
  return (
    <NotReadyMessage mediaKind={ready.mediaKind} className={className} />
  );
}
