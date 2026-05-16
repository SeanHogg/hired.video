/**
 * VideoPlayer — single canonical embed for any "play a video" surface
 * (public video page, homepage hero spotlight, EntityVideos thumbnail
 * tiles, future surfaces).
 *
 * The player is source-aware via a discriminated `source` prop:
 *   • `{ kind: "youtube", videoId }`        → privacy-friendly iframe embed
 *   • `{ kind: "url", url }`                → native `<video>` element
 *   • `{ kind: "thumbnail", thumbnailUrl }` → still image with optional play
 *                                              affordance, used as a
 *                                              click-through tile
 *
 * Aspect ratio flows through `<AspectFrame>` so a 9:16 vertical render
 * lands in a 9:16 box, a 1:1 square in a square box, etc. Default 16:9
 * keeps existing call sites visually identical when `aspectRatio` is
 * unspecified.
 *
 * Per the DRY rule: the gates (autoplay vs controls, hover overlay,
 * fallback when no source resolves) live INSIDE this component. Callers
 * pass raw data + intent flags, never derived booleans.
 */

import { Play } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import AspectFrame from "@/components/AspectFrame";
import type { AspectRatioInput } from "@/lib/studio/aspect";

export type VideoPlayerSource =
  | { kind: "youtube"; videoId: string }
  | { kind: "url"; url: string }
  | { kind: "thumbnail"; thumbnailUrl: string | null };

interface VideoPlayerProps {
  /** What to play. The component branches internally on `kind`. */
  source: VideoPlayerSource;
  /** Numeric ratio (1.777) or "W:H" string ("16:9"). Defaults to 16:9. */
  aspectRatio?: AspectRatioInput;
  /** Title used for accessibility + iframe `title` attribute. */
  title?: string;
  /** Poster image for the native <video> branch. */
  poster?: string | null;
  /** Show native playback controls (default true). The hero-spotlight
   *  use-case sets this false for muted-autoplay loops. */
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  /** When the source is `thumbnail`, clicking the player navigates here.
   *  Omit to render a static still. */
  thumbnailHref?: string;
  className?: string;
  /** Absolutely-positioned overlay rendered ON TOP of the embed but
   *  INSIDE the same AspectFrame — used by the hero spotlight for its
   *  badge / pause / dots chrome without forcing it to wrap the player
   *  in another aspect-ratio container. */
  children?: React.ReactNode;
  /** URL-branch only: forwarded to the native <video> element. Lets
   *  consumers wire time-anchored overlays (CTA hot-zones, captions)
   *  or call `.pause()` directly. YouTube + thumbnail branches ignore
   *  it (the iframe / image has no equivalent handle). */
  videoRef?: React.Ref<HTMLVideoElement>;
  /** URL-branch only: fires on every `timeupdate`. Same branch gate
   *  as `videoRef` — YouTube embeds would need the IFrame API to
   *  emit this, which is out of scope for the basic player. */
  onTimeUpdate?: (currentTimeSec: number) => void;
}

export default function VideoPlayer({
  source,
  aspectRatio,
  title,
  poster,
  controls = true,
  autoPlay = false,
  loop = false,
  muted = false,
  thumbnailHref,
  className,
  children,
  videoRef,
  onTimeUpdate,
}: VideoPlayerProps) {
  const wrapperClass = cn("rounded-xl overflow-hidden bg-black shadow-lg", className);

  if (source.kind === "youtube") {
    // YouTube iframe — the only embed YouTube allows. Query params are
    // assembled here so call sites never have to remember which flags
    // mean what (autoplay vs controls vs rel etc.).
    const params = new URLSearchParams({
      autoplay: autoPlay ? "1" : "0",
      mute: muted ? "1" : "0",
      controls: controls ? "1" : "0",
      modestbranding: "1",
      playsinline: "1",
      rel: "0",
      ...(loop ? { loop: "1", playlist: source.videoId } : {}),
    });
    return (
      <AspectFrame ratio={aspectRatio} className={wrapperClass}>
        <iframe
          src={`https://www.youtube.com/embed/${source.videoId}?${params.toString()}`}
          title={title ?? "Video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
        {children}
      </AspectFrame>
    );
  }

  if (source.kind === "url") {
    return (
      <AspectFrame ratio={aspectRatio} className={wrapperClass}>
        <video
          ref={videoRef}
          src={source.url}
          poster={poster ?? undefined}
          controls={controls}
          autoPlay={autoPlay}
          loop={loop}
          muted={muted}
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-contain"
          onTimeUpdate={
            onTimeUpdate
              ? (e) => onTimeUpdate(e.currentTarget.currentTime)
              : undefined
          }
        />
        {children}
      </AspectFrame>
    );
  }

  // Thumbnail-only branch — still image with an optional play affordance.
  // Wrapping it in <Link> when `thumbnailHref` is present keeps the
  // tile-as-clickable-card pattern (EntityVideos uses this).
  const thumb = source.thumbnailUrl ? (
    <img
      src={source.thumbnailUrl}
      alt={title ?? ""}
      className="absolute inset-0 w-full h-full object-cover"
      loading="lazy"
    />
  ) : (
    <div className="absolute inset-0 bg-gradient-to-br from-brand-purple/30 to-brand-blue/30" />
  );

  const overlay = (
    <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors group">
      <div className="rounded-full bg-black/60 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Play className="w-5 h-5 text-white fill-white" />
      </div>
    </div>
  );

  if (thumbnailHref) {
    return (
      <AspectFrame ratio={aspectRatio} className={wrapperClass}>
        <Link to={thumbnailHref} className="block w-full h-full" aria-label={title ?? "Watch video"}>
          {thumb}
          {overlay}
        </Link>
        {children}
      </AspectFrame>
    );
  }

  return (
    <AspectFrame ratio={aspectRatio} className={wrapperClass}>
      {thumb}
      {children}
    </AspectFrame>
  );
}
