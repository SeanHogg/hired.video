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

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Play } from "lucide-react";
import { z } from "zod";

import CanvasStatePreview from "@/components/studio/v2/CanvasStatePreview";
import PlaybackControls from "@/components/studio/v2/PlaybackControls";
import PreviewOverlay from "@/components/studio/v2/PreviewOverlay";
import AspectFrame from "@/components/AspectFrame";
import CtaHotzonesOverlay from "@/components/video/CtaHotzonesOverlay";
import { apiClient } from "@/lib/api-client";
import { VideoTracker } from "@/lib/analytics/video-tracker";
import { timelineToCanvasState } from "@/lib/studio/editor-v2/timeline-emit";
import { emptyCanvasState, type CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { usePreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import type { AspectRatioInput } from "@/lib/studio/aspect";

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
  // v2 (kind='nle') projects author into a Timeline JSON; the frontend
  // converts it to a VideoScript so the same live branch renders both.
  timelineSpec: z.unknown().optional().nullable(),
  kind: z.string().nullable().optional(),
  // Output-axis discriminator (#894). Set on every payload from
  // `/api/studio/public/:videoId` since the mediaKind extension —
  // older payloads (legacy direct uploads / cached intermediaries)
  // surface as undefined and default to 'video' downstream. Drives
  // the public watch page's ProjectPlayer dispatch so non-video
  // kinds (image, game, animation, cad) render their own surface
  // instead of the legacy "Video is being processed" fallback.
  mediaKind: z.string().nullable().optional(),
  // Parallel-column canvas-runtime state. Each kind owns its own
  // JSONB column per the canvas-runtime extensibility model in
  // PRD §1.2 — non-video watch surfaces read these to mount the
  // right runtime (GameStage / first-layer image / first-frame
  // animation) on the /v/<id> page.
  gameState: z.unknown().optional().nullable(),
  imageState: z.unknown().optional().nullable(),
  animationState: z.unknown().optional().nullable(),
  cadState: z.unknown().optional().nullable(),
  // Comic state column carried for parity (#1217). Dormant today
  // because comic authoring rides the CanvasState path; surfaced
  // here so the public payload round-trips it for the day a comic
  // adds runtime-only fields outside the canvas state.
  comicState: z.unknown().optional().nullable(),
  aspect: z.string().nullable().optional(),
  resolution: z.string().nullable().optional(),
  ctaHotzones: z.array(CtaHotzoneSchema).optional().default([]),
  // SEO meta authored in the project Details drawer (Meta tab). The
  // public watch page overlays these onto the og: / twitter: / keywords
  // tags; null/empty means "fall back to the video's title/description/
  // thumbnail". Schema accepts undefined for backwards compatibility
  // with older payloads that haven't been redeployed.
  metaDescription: z.string().nullable().optional(),
  keywords: z.array(z.string()).optional().default([]),
  socialCardImage: z.string().nullable().optional(),
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
  /** Poster shown during the brief fetch window. After the payload
   *  resolves the canvas takes over and renders its own first-frame
   *  paused state, so this is only visible for the network roundtrip. */
  poster?: string | null;
  /** When true, auto-start playback once the canvas hydrates —
   *  "live thumbnail" feel for the homepage hero / channel header.
   *  When false (default) the surface hydrates to the first frame
   *  paused and the user clicks to play. Eager fetch is always on
   *  regardless — never the gated press-play. */
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

// ─── ProjectPlayer dynamic import ──────────────────────────────────────────
// `<ProjectPlayer/>` itself imports this module (the eager-Timeline
// branch delegates back here), so we can't have a static import or
// a circular module evaluation lands one of us with `undefined`. The
// React.lazy split-point breaks the cycle at module-load — the
// dynamic import only resolves the first time the lazy branch
// renders, by which point both modules are fully evaluated. Single
// SSoT (ProjectPlayer) for kind dispatch, no duplicated branches.

const ProjectPlayerLazy = lazy(() =>
  import("@/components/studio/shared/ProjectPlayer"),
);

function LazyProjectPlayer({
  ready,
  analyticsProjectId,
}: {
  ready: PublicVideoReady;
  analyticsProjectId?: string;
}) {
  // Inline dynamic import of the adapter too — keeps the
  // public-payload-to-StudioProject mapping in one place
  // (`lib/studio/public-payload.ts`) without forcing a static import
  // chain that would pull StudioProject typings into every consumer.
  const [project, setProject] = useState<
    import("@/lib/services/studio-service").StudioProject | null
  >(null);
  useEffect(() => {
    let cancelled = false;
    void import("@/lib/studio/public-payload").then((m) => {
      if (cancelled) return;
      setProject(m.publicReadyToProject(ready));
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);
  if (!project) return null;
  return (
    <Suspense fallback={null}>
      <ProjectPlayerLazy
        project={project}
        eagerReady={ready}
        videoSurfaceProps={{ analyticsProjectId }}
      />
    </Suspense>
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
  const [error, setError] = useState(false);

  // Eager fetch on mount. No press-play gate — every consumer wants
  // the canvas first frame visible the moment the surface mounts, and
  // the editor's preview overlay + the /v/:id watch page + the
  // homepage carousel all behave that way. A separate gated mode just
  // diverged the UX (#755 user report: "the video on /resume is black
  // because it never fetched").
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get(`/api/studio/public/${videoId}`)
      .then((res: any) => {
        if (cancelled) return;
        const raw = res?.data ?? res;
        const parsed = PublicVideoSchema.safeParse(raw);
        if (parsed.success && isReady(parsed.data)) {
          setReady(parsed.data);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

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
      timelineSpec: null,
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
        <div className="absolute inset-0 bg-gradient-to-br from-brand-purple/20 to-brand-blue/20" />
      )}
      {error && (
        <div className="absolute bottom-2 left-2 right-2 text-center text-xs text-white/80 bg-black/60 rounded px-2 py-1">
          Video unavailable
        </div>
      )}
    </AspectFrame>
  );
}

// ─── Inner dispatch ─────────────────────────────────────────────────────────
// Picks the right embed for the project's payload. Per the DRY rule the
// caller passes the raw ready payload, NOT a "useStudioPlayer" boolean
// it could compute itself. All surfaces — eager (public watch page),
// lazy (cards, resume header, profile header), and the editor's
// preview overlay — converge here, then mount <CanvasStatePreview/>
// off `timelineSpec` so the canvas first frame is what every consumer
// sees on mount.

function PublicVideoDispatch({
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
  // The authoritative project state is `timelineSpec` (the v2 canvas
  // timeline). Convert it to a CanvasState — the same shape the editor
  // edits and the same shape <CanvasStatePreview/> renders. No
  // VideoScript / compile / scene-graph path: this is the one renderer
  // the studio uses, mounted here verbatim.
  const canvasState = useMemo<CanvasState | null>(() => {
    if (!ready.timelineSpec) return null;
    try {
      const state = timelineToCanvasState(ready.timelineSpec);
      if (!state.scenes.some((s) => s.widgets.length > 0)) return null;
      return state;
    } catch (err) {
      console.warn("StudioVideoSurface: timelineSpec → CanvasState failed", err);
      return null;
    }
  }, [ready.timelineSpec]);

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
  // same <CanvasStatePreview/> that the editor's preview overlay uses,
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

// ─── Public studio canvas wrapper ────────────────────────────────────────────
// Owns the playing/currentTime state for the public surface and mounts
// the same <StudioPlayerCanvas/> the editor uses. Wraps it in a rounded
// card so the public watch page keeps its existing visual.

function PublicStudioCanvas({
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
  const playback = usePreviewPlayback(canvasState ?? emptyCanvasState());
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
  const trackerRef = useRef<{ tick: (t: number) => void; end: () => void; detach: () => void } | null>(null);
  useEffect(() => {
    if (!analyticsProjectId || !canvasState || playback.duration <= 0) return;
    const tracker = new VideoTracker(analyticsProjectId);
    const handle = tracker.attachPlayhead(playback.duration);
    trackerRef.current = handle;
    return () => {
      handle.detach();
      trackerRef.current = null;
    };
  }, [analyticsProjectId, canvasState, playback.duration]);
  useEffect(() => {
    trackerRef.current?.tick(playback.playhead);
  }, [playback.playhead]);
  useEffect(() => {
    if (
      trackerRef.current &&
      !playback.isPlaying &&
      playback.duration > 0 &&
      playback.playhead >= playback.duration
    ) {
      trackerRef.current.end();
    }
  }, [playback.isPlaying, playback.playhead, playback.duration]);

  const aspectRatio = canvasState
    ? `${canvasState.width}/${canvasState.height}`
    : "16/9";

  // v2 canvas-state branch — mounts the SAME <CanvasStatePreview/> the
  // editor's preview overlay and the marketplace TemplatePlayer use.
  // Single source of truth: what you see here is what the editor shows.
  if (canvasState) {
    return (
      <>
        <div
          className={`overflow-hidden rounded-xl bg-black shadow-lg ${className ?? ""}`}
        >
          <div className="relative w-full" style={{ aspectRatio }}>
            <CanvasStatePreview state={canvasState} playback={playback} />
            {/* CTA-hotzones overlay — visible when the playhead enters
                any zone's [startSec, endSec). Self-fires the cta-click
                analytics call off `analyticsProjectId`. Pauses playback
                on click so the user isn't bounced mid-frame. */}
            <CtaHotzonesOverlay
              hotzones={hotzones ?? []}
              currentTimeSec={playback.playhead}
              onActivate={() => playback.pause()}
              analyticsProjectId={analyticsProjectId}
            />
            {!started && (
              <button
                type="button"
                onClick={() => {
                  playback.seek(0);
                  playback.play();
                  setStarted(true);
                }}
                aria-label="Play video"
                className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 transition hover:bg-black/30"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-xl backdrop-blur">
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
          />
        )}
      </>
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

/** Shared empty-state used by the public-dispatch surfaces. Picks
 *  kind-aware copy when the payload carries a mediaKind ("This podcast
 *  isn't ready yet"); falls back to the generic "media" noun when not.
 *  Kept here (next to the surfaces that mount it) so a kind rename in
 *  `shared/media-kinds.ts` doesn't desync with the message. */
function NotReadyMessage({
  mediaKind,
  className,
}: {
  mediaKind?: string | null;
  className?: string;
}) {
  // The badge label set on `media-kinds.ts` is the user-facing noun
  // for every kind ("Podcast" / "Image" / "Animation" / "Game" /
  // "Comic" / "CAD" / "Voice"). Unknown / missing strings fall through
  // to "media" so a stale-payload viewer never sees video-language on
  // a non-video project.
  const noun = !mediaKind
    ? "media"
    : mediaKind === "video"
      ? "video"
      : (mediaKindNoun(mediaKind) ?? "media");
  return (
    <div
      className={`aspect-video rounded-xl overflow-hidden bg-black/5 border border-border shadow-lg flex items-center justify-center ${className ?? ""}`}
    >
      <p className="text-muted-foreground text-sm px-4 text-center">
        This {noun} isn't ready yet. Check back soon.
      </p>
    </div>
  );
}

/** Lazy-loaded MEDIA_KIND_UI lookup — avoids the circular concern of
 *  pulling `@shared/media-kinds` at the top of this module while still
 *  letting the surface speak the right noun. Returns null for unknown
 *  kinds so the caller can fall back to "media". */
function mediaKindNoun(kind: string): string | null {
  const map: Record<string, string> = {
    podcast: "podcast",
    voice: "voiceover",
    animation: "animation",
    game: "game",
    comic: "comic",
    image: "drawing",
    cad: "drawing",
  };
  return map[kind] ?? null;
}

// ─── Raw <video> branch with analytics ───────────────────────────────────────
// Legacy direct uploads that never went through the studio editor — no
// canvas-state, no script. Use a native <video controls> and attach the
// same VideoTracker the canvas branch drives via attachPlayhead().

function RawVideoPlayback({
  url,
  analyticsProjectId,
  hotzones,
  className,
}: {
  url: string;
  analyticsProjectId?: string;
  hotzones?: { startSec: number; endSec: number; x: number; y: number; w: number; h: number; url: string }[];
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!analyticsProjectId || !videoRef.current) return;
    const tracker = new VideoTracker(analyticsProjectId);
    return tracker.attach(videoRef.current);
  }, [analyticsProjectId]);
  return (
    <div
      className={`relative w-full aspect-video overflow-hidden rounded-xl bg-black shadow-lg ${className ?? ""}`}
    >
      <video
        ref={videoRef}
        src={url}
        controls
        playsInline
        preload="metadata"
        className="absolute inset-0 h-full w-full object-contain"
        onTimeUpdate={(e) => setCurrentTimeSec(e.currentTarget.currentTime)}
      />
      <CtaHotzonesOverlay
        hotzones={hotzones ?? []}
        currentTimeSec={currentTimeSec}
        onActivate={() => videoRef.current?.pause()}
        analyticsProjectId={analyticsProjectId}
      />
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
        analyticsProjectId={analyticsProjectId}
      />
    </>
  );
}

