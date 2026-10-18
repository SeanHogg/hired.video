import { useTranslation } from "react-i18next";
import AspectFrame from "@/components/AspectFrame";

import BakedVideo from "./BakedVideo";
import type { FlatProps } from "./types";
import { youtubeEmbedUrl } from "./youtube-embed";

// ─── Flat dispatch ──────────────────────────────────────────────────────────
// Used when there's no studio project behind the asset — raw URL,
// YouTube id, or static thumbnail. No fetch, no script branch, no CTA
// hotzones. Folded in from the now-deleted `components/VideoPlayer.tsx`.

export default function FlatSurface({
  source,
  aspectRatio,
  title,
  className,
  controls = true,
  autoPlay = false,
  loop = false,
  muted = false,
  children,
  analyticsProjectId,
}: FlatProps) {
  const { t } = useTranslation();
  const wrapperClass = `rounded-xl overflow-hidden bg-black shadow-lg ${className ?? ""}`;

  if (source.kind === "youtube") {
    return (
      <AspectFrame ratio={aspectRatio} className={wrapperClass}>
        <iframe
          src={youtubeEmbedUrl(source.videoId, { autoplay: autoPlay, muted, controls, loop })}
          title={title ?? t("studio.videoSurface.defaultTitle")}
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
        <BakedVideo
          url={source.url}
          title={title ?? t("studio.videoSurface.defaultTitle")}
          poster={source.poster ?? undefined}
          hotzones={[]}
          controls={controls}
          autoplay={autoPlay}
          loop={loop}
          muted={muted}
          analyticsProjectId={analyticsProjectId}
        />
        {children}
      </AspectFrame>
    );
  }

  // Thumbnail — static still with hover Play affordance. Click-through
  // is handled by the caller's overlay (e.g. HeroVideoSpotlight wraps
  // a transparent <button> in `children`).
  return (
    <AspectFrame ratio={aspectRatio} className={wrapperClass}>
      {source.thumbnailUrl ? (
        <img
          src={source.thumbnailUrl}
          alt={title ?? ""}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-accent/50" />
      )}
      {children}
    </AspectFrame>
  );
}
