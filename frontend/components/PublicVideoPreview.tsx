import type { ReactNode } from "react";
import StudioVideoSurface, {
  type FlatVideoSource,
} from "@/components/studio/StudioVideoSurface";
import type { AspectRatioInput } from "@/lib/studio/aspect";
import type { PublicVideo } from "@/lib/services/studio-service";
import { cn } from "@/lib/utils";

interface PublicVideoPreviewProps {
  video: PublicVideo;
  className?: string;
  aspectRatio?: AspectRatioInput;
  title?: string;
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  /** Absolutely-positioned chrome (badges, hover affordances) layered on
   *  top of the embed but inside the same frame. Mirrors the hero
   *  spotlight pattern. */
  children?: ReactNode;
}

/**
 * Renders the right `<StudioVideoSurface>` variant for a `PublicVideo`:
 *
 *  • baked CDN URL          → flat `url` source.
 *  • real YouTube id        → flat `youtube` source.
 *  • saved-but-unrendered   → lazy mode (universal player; fetches the
 *                             project and renders the live canvas).
 *
 * Single owner of that selector — homepage hero spotlight, the
 * Video-Resumes card grid, and any future "live thumbnail" surface
 * call this instead of branching themselves.
 */
export default function PublicVideoPreview({
  video,
  className,
  aspectRatio,
  title,
  controls,
  autoPlay,
  loop,
  muted,
  children,
}: PublicVideoPreviewProps) {
  const resolvedTitle = title ?? video.title;
  const useStudioSurface =
    !video.videoUrl && !video.youtubeVideoId;

  if (useStudioSurface) {
    return (
      <div className={cn("relative overflow-hidden", className)}>
        <StudioVideoSurface
          mode="lazy"
          videoId={video.id}
          poster={video.thumbnailUrl}
          title={resolvedTitle}
          aspectRatio={aspectRatio}
          autoplay={Boolean(autoPlay)}
        />
        {children}
      </div>
    );
  }

  const source: FlatVideoSource = video.videoUrl
    ? { kind: "url", url: video.videoUrl, poster: video.thumbnailUrl }
    : video.youtubeVideoId
      ? { kind: "youtube", videoId: video.youtubeVideoId }
      : { kind: "thumbnail", thumbnailUrl: video.thumbnailUrl ?? null };

  return (
    <StudioVideoSurface
      mode="flat"
      source={source}
      title={resolvedTitle}
      aspectRatio={aspectRatio}
      controls={controls}
      autoPlay={autoPlay}
      loop={loop}
      muted={muted}
      className={className}
    >
      {children}
    </StudioVideoSurface>
  );
}
