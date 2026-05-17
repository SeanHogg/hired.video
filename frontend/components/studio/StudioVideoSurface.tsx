// StudioVideoSurface — THE only video player in the app.
//
// Every surface that shows a video — studio-published, raw URL, YouTube
// embed, or static thumbnail — mounts this component. There is no
// secondary "VideoPlayer" wrapper: the source variants below replace it.
//
// Per the standing DRY rule the surface owns its own dispatch — given a
// payload it decides between:
//
//   • Real YouTube id           → privacy-friendly nocookie iframe.
//   • Baked MP4 (videoUrl)      → native <video> + CtaHotzonesOverlay.
//   • Saved script, no MP4      → <StudioPlayer/> live branch off the
//                                 compiled VideoScript (#666). This is
//                                 the "saved-but-unrendered" case that
//                                 used to fall through to a broken
//                                 <video src=""> on every entity page.
//   • Only thumbnail            → static poster placeholder.
//   • Nothing                   → friendly empty state.
//
// Three consumption modes pick the data path:
//
//   <StudioVideoSurface mode="eager" ready={payload} />
//   <StudioVideoSurface mode="lazy"  videoId="…" poster="…" />
//   <StudioVideoSurface mode="flat"  source={{ kind: "youtube", videoId }} />
//
// • `eager` — caller already fetched the `/api/studio/public/:id` payload.
// • `lazy`  — caller has only a studio video id; mounts a poster + Play
//             overlay, fetches on activation (or immediately when
//             `autoplay`), then dispatches like eager.
// • `flat`  — caller has a raw URL / YouTube id / thumbnail and no
//             studio project to lazy-fetch (marketing CTAs, hero
//             rotation thumbnails, in-frame element videos). Skips the
//             script branch.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { z } from "zod";

import StudioPlayer from "@/components/studio/StudioPlayer";
import AspectFrame from "@/components/AspectFrame";
import CtaHotzonesOverlay from "@/components/video/CtaHotzonesOverlay";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { compile } from "@/lib/compiler/video-compiler";
import { VideoTracker } from "@/lib/analytics/video-tracker";
import type { AspectRatioInput } from "@/lib/studio/aspect";
import {
  VideoScriptSchema,
  type VideoScript,
} from "@/lib/services/studio-service";

// ─── YouTube iframe params (shared by eager + flat) ──────────────────────────
// Single source of truth for the embed URL. Without `playlist=<videoId>`
// the `loop=1` flag is silently ignored by the YouTube player — fixing
// that latent bug here means every consumer (hero spotlight, public
// watch page) loops correctly when they ask for looping.

function youtubeEmbedUrl(
  videoId: string,
  opts: { autoplay?: boolean; muted?: boolean; controls?: boolean; loop?: boolean },
): string {
  const params = new URLSearchParams({
    autoplay: opts.autoplay ? "1" : "0",
    mute: opts.muted ? "1" : "0",
    controls: opts.controls === false ? "0" : "1",
    modestbranding: "1",
    playsinline: "1",
    rel: "0",
    ...(opts.loop ? { loop: "1", playlist: videoId } : {}),
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

// ─── API payload schema ─────────────────────────────────────────────────────
// Shape returned by `GET /api/studio/public/:videoId`. Two variants
// discriminated by `pending`: ready (full payload) and pending
// (project exists but not yet public).

const CtaHotzoneSchema = z.object({
  startSec: z.number(),
  endSec: z.number(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  url: z.string(),
});

export const PublicVideoReadySchema = z.object({
  pending: z.literal(false),
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  videoUrl: z.string().nullable().optional(),
  youtubeUrl: z.string().nullable().optional(),
  youtubeVideoId: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  ownerAvatar: z.string().nullable().optional(),
  resumeId: z.string().nullable().optional(),
  script: z.unknown().optional().nullable(),
  aspect: z.string().nullable().optional(),
  resolution: z.string().nullable().optional(),
  ctaHotzones: z.array(CtaHotzoneSchema).optional().default([]),
  createdAt: z.string(),
});

const PublicVideoPendingSchema = z.object({
  pending: z.literal(true),
  title: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  ownerAvatar: z.string().nullable().optional(),
});

export const PublicVideoSchema = z.discriminatedUnion("pending", [
  PublicVideoReadySchema,
  PublicVideoPendingSchema,
]);

export type PublicVideoReady = z.infer<typeof PublicVideoReadySchema>;
export type PublicVideoPayload = z.infer<typeof PublicVideoSchema>;

export function isReady(v: PublicVideoPayload): v is PublicVideoReady {
  return v.pending === false;
}

// Lenient guard for the API's `script` blob. Server passes
// `studio_projects.storyboard` verbatim, which mostly conforms to the
// VideoScript shape but can carry extra metadata fields (`_name`,
// `_slug`) or pre-schema legacy rows. Parse leniently — failing rows
// fall through to videoUrl / thumbnail branches rather than blanking
// the whole surface.
function parsePlayableScript(raw: unknown): VideoScript | null {
  if (!raw || typeof raw !== "object") return null;
  const result = VideoScriptSchema.safeParse(raw);
  return result.success ? result.data : null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

type CommonProps = {
  /** Container class for the outer wrapper. */
  className?: string;
  /** Override the AspectFrame ratio; otherwise read from payload. */
  aspectRatio?: AspectRatioInput;
  /** Optional override for the title (defaults to payload). */
  title?: string;
  /** When set, attaches a VideoTracker (per-second engagement
   *  analytics) to the baked-MP4 branch's `<video>` element. Events
   *  land on the supplied studio project id — keyed there per
   *  migration 0085. The live-canvas branch is currently unsupported
   *  for tracking (no native <video> element to listen on); that
   *  trade-off is documented at the ATS callsite. */
  analyticsProjectId?: string;
};

type EagerProps = CommonProps & {
  mode: "eager";
  ready: PublicVideoReady;
};

type LazyProps = CommonProps & {
  mode: "lazy";
  videoId: string;
  /** Poster shown before the user clicks Play (or while the payload
   *  loads in autoplay mode). */
  poster?: string | null;
  /** When true, fetch + mount the player immediately on mount instead
   *  of waiting for a Play click. Used by the homepage hero. */
  autoplay?: boolean;
  /** Optional fallback URL for the YouTube/baked branch when the lazy
   *  fetch fails — keeps legacy direct-upload videos playable even when
   *  the project lookup 404s. */
  fallbackVideoUrl?: string | null;
  fallbackYoutubeVideoId?: string | null;
};

/** Flat sources — caller has the embed primitive directly, no studio
 *  project to fetch. The three variants match the three primitives the
 *  underlying dispatcher already knows how to render. */
export type FlatVideoSource =
  | { kind: "youtube"; videoId: string }
  | { kind: "url"; url: string; poster?: string | null }
  | { kind: "thumbnail"; thumbnailUrl: string | null };

type FlatProps = CommonProps & {
  mode: "flat";
  source: FlatVideoSource;
  /** Show native playback controls. Default true. Hero spotlight sets
   *  false for muted-autoplay "live thumbnail" loops. */
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  /** Absolutely-positioned overlay rendered ON TOP of the embed but
   *  INSIDE the same AspectFrame — used by the hero spotlight chrome. */
  children?: ReactNode;
};

type Props = EagerProps | LazyProps | FlatProps;

export default function StudioVideoSurface(props: Props) {
  if (props.mode === "eager") {
    return (
      <PublicVideoDispatch
        ready={props.ready}
        title={props.title ?? props.ready.title}
        aspectRatio={props.aspectRatio ?? props.ready.aspect ?? undefined}
        className={props.className}
        analyticsProjectId={props.analyticsProjectId}
      />
    );
  }
  if (props.mode === "lazy") {
    return <LazySurface {...props} />;
  }
  return <FlatSurface {...props} />;
}

// ─── Flat dispatch ──────────────────────────────────────────────────────────
// Used when there's no studio project behind the asset — raw URL,
// YouTube id, or static thumbnail. No fetch, no script branch, no CTA
// hotzones. Folded in from the now-deleted `components/VideoPlayer.tsx`.

function FlatSurface({
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
  const wrapperClass = `rounded-xl overflow-hidden bg-black shadow-lg ${className ?? ""}`;

  if (source.kind === "youtube") {
    return (
      <AspectFrame ratio={aspectRatio} className={wrapperClass}>
        <iframe
          src={youtubeEmbedUrl(source.videoId, { autoplay: autoPlay, muted, controls, loop })}
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
        <BakedVideo
          url={source.url}
          title={title ?? "Video"}
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
        <div className="absolute inset-0 bg-gradient-to-br from-brand-purple/20 to-brand-blue/20" />
      )}
      {children}
    </AspectFrame>
  );
}

// ─── Lazy wrapper ───────────────────────────────────────────────────────────
// Owns its own fetch + loading state so consumers can drop a `<StudioVideoSurface
// videoId={...} />` anywhere a thumbnail used to live and get full universal-
// player playback without threading data fetches through their own state.

function LazySurface({
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
  const [ready, setReady] = useState<PublicVideoReady | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activated, setActivated] = useState(Boolean(autoplay));

  useEffect(() => {
    if (!activated || ready || loading) return;
    setLoading(true);
    apiClient
      .get(`/api/studio/public/${videoId}`)
      .then((res: any) => {
        const raw = res?.data ?? res;
        const parsed = PublicVideoSchema.safeParse(raw);
        if (parsed.success && isReady(parsed.data)) {
          setReady(parsed.data);
          setError(false);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [activated, ready, loading, videoId]);

  // Resolved state → dispatch. Pass through title/aspect overrides.
  if (ready) {
    return (
      <PublicVideoDispatch
        ready={ready}
        title={title ?? ready.title}
        aspectRatio={aspectRatio ?? ready.aspect ?? undefined}
        className={className}
        autoplayBaked={Boolean(autoplay)}
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
      title: title ?? "Video",
      description: null,
      videoUrl: fallbackVideoUrl ?? null,
      youtubeUrl: null,
      youtubeVideoId: fallbackYoutubeVideoId ?? null,
      thumbnailUrl: poster ?? null,
      ownerName: null,
      ownerAvatar: null,
      resumeId: null,
      script: null,
      // The outer aspectRatio prop is forwarded to PublicVideoDispatch
      // directly below, so the synthetic payload doesn't need to repeat
      // it in the PublicVideoReady-shaped string field.
      aspect: null,
      resolution: null,
      ctaHotzones: [],
      createdAt: new Date().toISOString(),
    };
    return (
      <PublicVideoDispatch
        ready={synthetic}
        title={synthetic.title}
        aspectRatio={aspectRatio}
        className={className}
        autoplayBaked={Boolean(autoplay)}
      />
    );
  }

  // Pre-activation poster — preserves the click-to-play UX so we don't
  // burn a network request until the user actually wants to watch.
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
        <div className="absolute inset-0 bg-gradient-to-br from-brand-purple/20 to-brand-blue/20" />
      )}
      <button
        type="button"
        onClick={() => setActivated(true)}
        disabled={loading}
        aria-label={loading ? "Loading video…" : `Play ${title ?? "video"}`}
        className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/50 transition-colors group"
      >
        <div className="h-16 w-16 rounded-full bg-black/60 group-hover:bg-black/80 flex items-center justify-center backdrop-blur-sm shadow-xl">
          {loading ? (
            <span className="h-6 w-6 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <Play className="h-7 w-7 text-white fill-white ml-1" />
          )}
        </div>
      </button>
      {error && (
        <div className="absolute bottom-2 left-2 right-2 text-center text-xs text-white/80 bg-black/60 rounded px-2 py-1">
          Video unavailable
        </div>
      )}
    </AspectFrame>
  );
}

// ─── Inner dispatch (extracted verbatim from PublicVideoResume) ─────────────
// Picks the right embed for the project's payload. Per the DRY rule the
// caller passes the raw ready payload, NOT a "useStudioPlayer" boolean
// it could compute itself.
//
// `autoplayBaked` is plumbed through so the homepage hero can mount the
// baked-MP4 branch with autoplay/loop/muted (live-thumbnail feel) while
// the public watch page mounts it with default controls.

function PublicVideoDispatch({
  ready,
  title,
  aspectRatio,
  className,
  autoplayBaked,
  analyticsProjectId,
}: {
  ready: PublicVideoReady;
  title: string;
  aspectRatio?: AspectRatioInput;
  className?: string;
  autoplayBaked?: boolean;
  analyticsProjectId?: string;
}) {
  const isRealYouTube =
    !!ready.youtubeVideoId && !ready.youtubeVideoId.startsWith("yt_");
  const directVideoUrl =
    ready.videoUrl && !ready.videoUrl.includes("youtube.com/watch?v=yt_")
      ? ready.videoUrl
      : null;
  const playableScript = parsePlayableScript(ready.script);

  if (isRealYouTube) {
    return (
      <AspectFrame
        ratio={aspectRatio}
        className={`rounded-xl overflow-hidden bg-black shadow-lg ${className ?? ""}`}
      >
        <iframe
          src={youtubeEmbedUrl(ready.youtubeVideoId!, {
            autoplay: autoplayBaked,
            muted: autoplayBaked,
            controls: true,
            loop: autoplayBaked,
          })}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      </AspectFrame>
    );
  }

  if (directVideoUrl) {
    return (
      <AspectFrame
        ratio={aspectRatio}
        className={`rounded-xl overflow-hidden bg-black shadow-lg ${className ?? ""}`}
      >
        <BakedVideo
          url={directVideoUrl}
          title={title}
          poster={ready.thumbnailUrl ?? undefined}
          hotzones={ready.ctaHotzones}
          autoplay={autoplayBaked}
          analyticsProjectId={analyticsProjectId}
        />
      </AspectFrame>
    );
  }

  if (playableScript) {
    return (
      <UnifiedPlayer
        script={playableScript}
        aspectRatio={aspectRatio}
        title={title}
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

  return (
    <div className={`aspect-video rounded-xl overflow-hidden bg-black/5 border border-border shadow-lg flex items-center justify-center ${className ?? ""}`}>
      <p className="text-muted-foreground text-sm">
        Video is being processed. Check back soon.
      </p>
    </div>
  );
}

// ─── Live branch ─────────────────────────────────────────────────────────────
// Saved-public-unrendered project (#666). Mount <StudioPlayer/> against
// the VideoScript and drive playback off the compiled timeline. Public
// surface draws its own play/scrub chrome because StudioPlayer is
// designed for editor-driven playback (no built-in controls).

function UnifiedPlayer({
  script,
  aspectRatio,
  title,
  hotzones,
  className,
}: {
  script: VideoScript;
  aspectRatio?: AspectRatioInput;
  title: string;
  hotzones: { startSec: number; endSec: number; x: number; y: number; w: number; h: number; url: string }[];
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const compiledVideo = useMemo(() => compile(script), [script]);
  const totalDuration = compiledVideo.totalDuration;

  const seekFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!totalDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setCurrentTime(ratio * totalDuration);
  };

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <AspectFrame ratio={aspectRatio} className="rounded-xl overflow-hidden bg-black shadow-lg">
        <StudioPlayer
          state={{
            script,
            videoUrl: null,
            voiceover: null,
            captions: null,
          }}
          compiledVideo={compiledVideo}
          playing={playing}
          currentTime={currentTime}
          onTimeUpdate={setCurrentTime}
          onEnded={() => setPlaying(false)}
          className="absolute inset-0 w-full h-full"
        />
        <CtaHotzonesOverlay
          hotzones={hotzones}
          currentTimeSec={currentTime}
          onActivate={() => setPlaying(false)}
        />
      </AspectFrame>
      <div className="flex items-center gap-3 px-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? `Pause ${title}` : `Play ${title}`}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>
        <div
          className="flex-1 relative h-2 bg-muted rounded-full overflow-hidden cursor-pointer touch-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            seekFromPointer(e);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromPointer(e);
          }}
          onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
          role="slider"
          aria-label="Seek video"
          aria-valuemin={0}
          aria-valuemax={totalDuration}
          aria-valuenow={currentTime}
        >
          <div
            className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all"
            style={{ width: totalDuration ? `${Math.min(100, (currentTime / totalDuration) * 100)}%` : "0%" }}
          />
        </div>
        <span className="text-xs text-muted-foreground font-mono tabular-nums">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>
      </div>
    </div>
  );
}

// ─── Baked branch ────────────────────────────────────────────────────────────
// Native <video controls> + CTA-hotzones overlay. Used when a published
// render exists; the URL is the canonical artifact so we don't try to
// recompile the script for it.

function BakedVideo({
  url,
  title,
  poster,
  hotzones,
  autoplay,
  controls,
  loop,
  muted,
  analyticsProjectId,
}: {
  url: string;
  title: string;
  poster: string | undefined;
  hotzones: { startSec: number; endSec: number; x: number; y: number; w: number; h: number; url: string }[];
  autoplay?: boolean;
  /** Explicit overrides. When omitted the autoplay flag drives all
   *  three (hero-spotlight "live thumbnail" feel: muted-autoplay-loop,
   *  no controls). Flat callers pass these directly. */
  controls?: boolean;
  loop?: boolean;
  muted?: boolean;
  analyticsProjectId?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState<number | undefined>(undefined);

  // Self-attach the per-second engagement tracker when a project id is
  // supplied. Owned by the surface so consumers can't accidentally
  // attach to the wrong element (or forget to detach on unmount).
  useEffect(() => {
    if (!analyticsProjectId || !videoRef.current) return;
    const tracker = new VideoTracker(analyticsProjectId);
    return tracker.attach(videoRef.current);
  }, [analyticsProjectId]);

  return (
    <>
      <video
        ref={videoRef}
        src={url}
        poster={poster}
        controls={controls ?? !autoplay}
        autoPlay={autoplay}
        muted={muted ?? autoplay}
        loop={loop ?? autoplay}
        playsInline
        preload="metadata"
        title={title}
        className="absolute inset-0 w-full h-full object-contain"
        onTimeUpdate={(e) => setCurrentTimeSec(e.currentTarget.currentTime)}
      />
      <CtaHotzonesOverlay
        hotzones={hotzones}
        currentTimeSec={currentTimeSec}
        onActivate={() => videoRef.current?.pause()}
      />
    </>
  );
}

function formatTime(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
