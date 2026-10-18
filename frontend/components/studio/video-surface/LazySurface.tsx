import { useTranslation } from "react-i18next";
import AspectFrame from "@/components/AspectFrame";
import type { PublicVideoReady } from "@/lib/studio/public-video-schema";

import LazyProjectPlayer from "./LazyProjectPlayer";
import PublicVideoDispatch from "./PublicVideoDispatch";
import type { LazyProps } from "./types";
import { usePublicVideoFetch } from "./use-public-video-fetch";

// ─── Lazy wrapper ───────────────────────────────────────────────────────────
// Owns its own fetch + loading state so consumers can drop a `<StudioVideoSurface
// videoId={...} />` anywhere a thumbnail used to live and get full universal-
// player playback without threading data fetches through their own state.

export default function LazySurface({
  videoId,
  poster,
  autoplay,
  fallbackVideoUrl,
  fallbackYoutubeVideoId,
  className,
  aspectRatio,
  title,
  analyticsProjectId,
}: LazyProps) {
  const { t } = useTranslation();
  const { ready, error } = usePublicVideoFetch(videoId);

  // Resolved state → dispatch. Pass through title/aspect overrides.
  if (ready) {
    // Non-video kinds bounce through the kind-aware <ProjectPlayer/>
    // dispatcher so the lazy callers (resume header rail, profile
    // panel, homepage hero spotlight) render image / game /
    // animation / cad projects with their own runtime instead of
    // falling through to the legacy video-only "not ready" branch.
    // Video kinds (and legacy payloads with mediaKind undefined)
    // stay on the existing PublicVideoDispatch path so YouTube /
    // baked MP4 / live-canvas dispatch is unchanged. Done here
    // rather than in every consumer per the DRY rule — single
    // dispatcher covers all 5+ lazy callers.
    const kind = ready.mediaKind ?? "video";
    if (kind !== "video") {
      return (
        <LazyProjectPlayer
          ready={ready}
          analyticsProjectId={analyticsProjectId}
        />
      );
    }
    return (
      <PublicVideoDispatch
        ready={ready}
        title={title ?? ready.title}
        aspectRatio={aspectRatio ?? ready.aspect ?? undefined}
        className={className}
        autoplay={Boolean(autoplay)}
        analyticsProjectId={analyticsProjectId}
      />
    );
  }

  // Fetch failed but the caller gave us a flat URL/YouTube id to fall
  // back to. Synthesize a minimal `ready` payload so the dispatcher's
  // baked / YouTube branches still light up — keeps legacy embeds
  // working when the project row was deleted but the video file lives.
  if (error && (fallbackVideoUrl || fallbackYoutubeVideoId)) {
    const synthetic: PublicVideoReady = {
      pending: false,
      id: videoId,
      title: title ?? t("studio.videoSurface.defaultTitle"),
      description: null,
      videoUrl: fallbackVideoUrl ?? null,
      youtubeUrl: null,
      youtubeVideoId: fallbackYoutubeVideoId ?? null,
      thumbnailUrl: poster ?? null,
      ownerName: null,
      ownerAvatar: null,
      resumeId: null,
      timelineSpec: null,
      legacyScript: null,
      kind: null,
      aspect: null,
      resolution: null,
      ctaHotzones: [],
      metaDescription: null,
      keywords: [],
      socialCardImage: null,
      createdAt: new Date().toISOString(),
    };
    return (
      <PublicVideoDispatch
        ready={synthetic}
        title={synthetic.title}
        aspectRatio={aspectRatio}
        className={className}
        autoplay={Boolean(autoplay)}
      />
    );
  }

  // Fetch in flight — minimal in-place skeleton. AspectFrame keeps the
  // layout reservation stable so the canvas slot doesn't reflow.
  return (
    <AspectFrame
      ratio={aspectRatio}
      className={`relative rounded-xl overflow-hidden bg-black shadow-lg ${className ?? ""}`}
    >
      {poster ? (
        <img
          src={poster}
          alt={title ?? ""}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-accent/50" />
      )}
      {error && (
        <div className="absolute bottom-2 left-2 right-2 text-center text-xs text-white/80 bg-black/60 rounded px-2 py-1">
          {t("studio.videoSurface.unavailable")}
        </div>
      )}
    </AspectFrame>
  );
}
