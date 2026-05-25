import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiClient } from "@/lib/api-client";
import { AppShell } from "@/components/AppShell";
import {
  PublicVideoSchema,
  isReady,
  type PublicVideoPayload as PublicVideo,
  type PublicVideoReady,
} from "@/components/studio/StudioVideoSurface";
import ProjectPlayer from "@/components/studio/shared/ProjectPlayer";
import type { StudioProject } from "@/lib/services/studio-service";
import { StudioProjectStatus } from "@/lib/services/studio-service";
import { recordProjectView } from "@/lib/services/studio-features-service";
import { useUgcSeo } from "@/lib/seo-ugc";
import { MEDIA_KIND_UI, type MediaKind } from "@shared/media-kinds";

// ─── Component ────────────────────────────────────────────────────────────────
export default function PublicVideoResume() {
  const { videoId } = useParams<{ videoId: string }>();
  const [video, setVideo] = useState<PublicVideo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // SEO — single adapter call. Builder lives in lib/seo-ugc.ts
  // ("videoResume" kind) and emits owner-authored Meta-tab fields
  // (metaDescription / socialCardImage / keywords) with fallbacks to
  // the video's default title/description/thumbnail. Replaces the
  // hand-rolled applyOgTags() / setMeta() helpers that previously
  // bypassed the platform SEO defaults merge.
  useUgcSeo("videoResume", video && isReady(video) ? video : null);

  useEffect(() => {
    if (!videoId) return;
    apiClient
      .get(`/api/studio/public/${videoId}`)
      .then((res: any) => {
        // apiClient wraps response — data may be nested under res.data or be res directly
        const raw = res?.data ?? res;
        const result = PublicVideoSchema.safeParse(raw);
        if (result.success) {
          setVideo(result.data);
          if (isReady(result.data)) {
            // Authoritative view counter for the Total Views / CTR
            // denominator on the owner's analytics dashboard. The
            // per-second heatmap tracker (mounted by StudioVideoSurface
            // below) under-counts short visits because it only flushes
            // on 30s tick / beforeunload / ended.
            void recordProjectView(result.data.id, document.referrer || undefined);
          }
        } else {
          setError("Could not load this video resume.");
        }
      })
      .catch(() => setError("Video not found or is not public."))
      .finally(() => setLoading(false));
  }, [videoId]);

  if (loading) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </AppShell>
    );
  }

  if (error || !video) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
          <h1 className="text-2xl font-semibold text-foreground">Video Not Found</h1>
          <p className="text-muted-foreground">{error || "This video resume is not available."}</p>
          <Link to="/" className="text-primary hover:underline text-sm">
            Back to hired.video
          </Link>
        </div>
      </AppShell>
    );
  }

  // Pending: project exists but the video isn't ready or isn't public yet.
  // Common scenario — the owner shared the link from "Copy public URL" before
  // the render finished or before flipping the visibility toggle. Show a
  // friendly placeholder instead of the generic "Video Not Found" so the
  // recipient knows to check back rather than giving up.
  if (video.pending) {
    const ownerLabel = video.ownerName || "The creator";
    return (
      <AppShell bgClassName="bg-background">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
          {video.ownerAvatar && (
            <img
              src={video.ownerAvatar}
              alt={ownerLabel}
              className="w-14 h-14 rounded-full"
            />
          )}
          <h1 className="text-2xl font-semibold text-foreground">
            {video.title || "Video in progress"}
          </h1>
          <p className="text-muted-foreground max-w-md">
            {ownerLabel} is still preparing this video. Check back in a few minutes — the link will work
            once it's published.
          </p>
          <Link to="/" className="text-primary hover:underline text-sm">
            Back to hired.video
          </Link>
        </div>
      </AppShell>
    );
  }

  // After the pending early-return above, `video` is the ready variant —
  // narrow via the predicate so the rest of the JSX can use the full payload.
  if (!isReady(video)) return null;
  const ready = video;
  const mediaKind = (ready.mediaKind ?? "video") as MediaKind;

  return (
    <AppShell bgClassName="bg-background">
      <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        {/* Owner info */}
        <div className="flex items-center gap-4">
          {ready.ownerAvatar ? (
            <img
              src={ready.ownerAvatar}
              alt={ready.ownerName ?? ""}
              className="w-14 h-14 rounded-full object-cover border border-border"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold">
              {(ready.ownerName ?? "?")[0].toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-foreground">{ready.title}</h1>
            {ready.ownerName && (
              <p className="text-muted-foreground text-sm mt-0.5">{ready.ownerName}</p>
            )}
          </div>
        </div>

        {/* Universal media surface — routes through ProjectPlayer so the
            right runtime mounts per mediaKind (game / image / animation /
            cad / Timeline kinds). Replaces the prior video-only dispatch
            which fell through to "Video is being processed" for every
            non-video kind. ProjectPlayer covers the eager-payload path
            so we don't double-fetch — the public payload above already
            carries the parallel state columns ProjectPlayer needs. */}
        <div
          className={
            mediaKind === "image" || mediaKind === "animation" || mediaKind === "cad"
              ? "rounded-xl overflow-hidden bg-black shadow-lg aspect-video flex items-center justify-center"
              : "rounded-xl overflow-hidden bg-black shadow-lg"
          }
        >
          <ProjectPlayer
            project={publicReadyToProject(ready)}
            eagerReady={ready}
            videoSurfaceProps={{ analyticsProjectId: ready.id }}
          />
        </div>

        {/* Description */}
        {ready.description && (
          <p className="text-muted-foreground leading-relaxed">{ready.description}</p>
        )}

        {/* CTA — kind-aware so the prompt matches what the viewer just
            watched (a "Create your own video resume" pitch on top of a
            Photoshop drawing is incoherent). */}
        <div className="border border-border rounded-xl p-6 bg-card flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-foreground">
              Create your own {MEDIA_KIND_UI[mediaKind].badgeLabel.toLowerCase()}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">AI-powered in minutes. Free to start.</p>
          </div>
          <Link
            to="/signup"
            className="shrink-0 px-5 py-2.5 rounded-lg bg-gradient-to-r from-brand-purple to-brand-blue text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Get Started Free
          </Link>
        </div>
      </main>
    </AppShell>
  );
}

/** Adapter from the public payload to a `StudioProject`-shaped object
 *  so `<ProjectPlayer>` (which is the SSoT dispatcher and expects a
 *  project) can read the parallel-column state. Only the fields the
 *  dispatcher reads are populated — fields like `userId`, `status`,
 *  `creationDateTime` are stubbed because the public surface has no
 *  use for them. */
function publicReadyToProject(ready: PublicVideoReady): StudioProject {
  return {
    id: ready.id,
    userId: "",
    title: ready.title,
    status: StudioProjectStatus.Published,
    youtubeVideoId: ready.youtubeVideoId ?? null,
    videoUrl: ready.videoUrl ?? null,
    thumbnailUrl: ready.thumbnailUrl ?? null,
    storyboard: null,
    script: null,
    kind: (ready.kind as "scene" | "nle" | null | undefined) ?? "scene",
    mediaKind: (ready.mediaKind as StudioProject["mediaKind"]) ?? "video",
    timelineSpec: ready.timelineSpec ?? null,
    gameState: ready.gameState ?? null,
    imageState: ready.imageState ?? null,
    animationState: ready.animationState ?? null,
    cadState: ready.cadState ?? null,
    prompt: null,
    jobDescription: null,
    resumeText: null,
    purpose: null,
    viewCount: 0,
    ctaClickCount: 0,
    isPublic: true,
    metaDescription: ready.metaDescription ?? null,
    slug: null,
    keywords: ready.keywords ?? [],
    socialCardImage: ready.socialCardImage ?? null,
    subjects: [],
    creationDateTime: ready.createdAt,
    updateDateTime: ready.createdAt,
  };
}

