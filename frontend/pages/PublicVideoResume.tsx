import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Pause, Play } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { z } from "zod";
import StudioPlayer from "@/components/studio/StudioPlayer";
import AspectFrame from "@/components/AspectFrame";
import CtaHotzonesOverlay from "@/components/video/CtaHotzonesOverlay";
import { Button } from "@/components/ui/button";
import { compile } from "@/lib/compiler/video-compiler";
import {
  VideoScriptSchema,
  type VideoScript,
} from "@/lib/services/studio-service";

// Lenient guard for the API's `script` blob. The server reads
// `studio_projects.storyboard` verbatim, which mostly conforms to the
// VideoScript shape but also carries `_name` / `_slug` metadata, plus
// legacy rows that pre-date the current schema. Parse leniently and
// fall through to the videoUrl branch when the shape doesn't match,
// rather than failing the entire public response.
function parsePlayableScript(raw: unknown): VideoScript | null {
  if (!raw || typeof raw !== "object") return null;
  const result = VideoScriptSchema.safeParse(raw);
  return result.success ? result.data : null;
}

// ─── Schema ───────────────────────────────────────────────────────────────────
// The endpoint returns one of two shapes discriminated by `pending`:
//   • pending: false — project is public, full payload below. `videoUrl` is
//                      optional (saved-public-unrendered projects play live
//                      via the StudioPlayer canvas branch off `script`).
//   • pending: true  — project exists but isn't public yet (Draft, mid-render,
//                      or owner toggled it private). Just the title + owner so
//                      the recipient sees "Owner is preparing this video."
const CtaHotzoneSchema = z.object({
  startSec: z.number(),
  endSec: z.number(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  url: z.string(),
});

const PublicVideoReadySchema = z.object({
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
  // Saved VideoScript — the unified <StudioPlayer/> picks baked-vs-live
  // off (script, videoUrl). For saved-public-unrendered projects only
  // `script` is set; for rendered ones the baked URL takes over. We
  // accept `unknown` here (and re-parse via `parsePlayableScript` at
  // render time) so a project whose storyboard JSON doesn't strictly
  // match VideoScriptSchema still produces a usable response — the
  // baked-URL branch keeps working even when the script is unplayable.
  script: z.unknown().optional().nullable(),
  // Aspect / resolution surfaced from the saved storyboard so the player
  // sizes itself correctly for vertical / square / 4:3 renders.
  aspect: z.string().nullable().optional(),
  resolution: z.string().nullable().optional(),
  /** Clickable CTA regions overlaid on the baked MP4. The CTA was
   *  rendered into pixels at export time; this gives it back its
   *  interactivity. Default to an empty array so older API responses
   *  without the field still validate. */
  ctaHotzones: z.array(CtaHotzoneSchema).optional().default([]),
  createdAt: z.string(),
});
const PublicVideoPendingSchema = z.object({
  pending: z.literal(true),
  title: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  ownerAvatar: z.string().nullable().optional(),
});
const PublicVideoSchema = z.discriminatedUnion("pending", [
  PublicVideoReadySchema,
  PublicVideoPendingSchema,
]);
type PublicVideoReady = z.infer<typeof PublicVideoReadySchema>;
type PublicVideo = z.infer<typeof PublicVideoSchema>;

/** Type guard — TS narrowing on `pending: literal` through zod's
 *  discriminatedUnion isn't reliable across our TS version, so we use an
 *  explicit predicate everywhere we need to access the ready-only fields. */
function isReady(v: PublicVideo): v is PublicVideoReady {
  return v.pending === false;
}

// ─── Meta helpers ─────────────────────────────────────────────────────────────
function setMeta(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${name}"],meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(name.startsWith("og:") || name.startsWith("twitter:") ? "property" : "name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function applyOgTags(video: PublicVideoReady) {
  const title = video.title;
  const desc = video.description || "Watch this video resume on hired.video";
  const thumb = video.thumbnailUrl || "https://hired.video/og-default.png";
  const url = `https://hired.video/v/${video.id}`;

  document.title = title;
  setMeta("og:title", title);
  setMeta("og:description", desc);
  setMeta("og:image", thumb);
  setMeta("og:url", url);
  setMeta("og:type", "video.other");
  setMeta("twitter:card", "summary_large_image");
  setMeta("twitter:title", title);
  setMeta("twitter:description", desc);
  setMeta("twitter:image", thumb);
  if (video.youtubeUrl) {
    setMeta("og:video", video.youtubeUrl);
    setMeta("og:video:type", "text/html");
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PublicVideoResume() {
  const { videoId } = useParams<{ videoId: string }>();
  const [video, setVideo] = useState<PublicVideo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
          if (isReady(result.data)) applyOgTags(result.data);
        } else {
          setError("Could not load this video resume.");
        }
      })
      .catch(() => setError("Video not found or is not public."))
      .finally(() => setLoading(false));
  }, [videoId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4">
        <h1 className="text-2xl font-semibold text-foreground">Video Not Found</h1>
        <p className="text-muted-foreground">{error || "This video resume is not available."}</p>
        <Link to="/" className="text-primary hover:underline text-sm">
          Back to hired.video
        </Link>
      </div>
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
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4">
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
    );
  }

  // After the pending early-return above, `video` is the ready variant —
  // narrow via the predicate so the rest of the JSX can use the full payload.
  if (!isReady(video)) return null;
  const ready = video;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-lg font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
          hired.video
        </Link>
        <Link to="/resume-roast" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Roast your resume →
        </Link>
      </header>

      {/* Main content */}
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

        {/* Player — picks the right surface based on what the project carries. */}
        <PublicVideoSurface ready={ready} />

        {/* Description */}
        {ready.description && (
          <p className="text-muted-foreground leading-relaxed">{ready.description}</p>
        )}

        {/* CTA */}
        <div className="border border-border rounded-xl p-6 bg-card flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-foreground">Create your own video resume</p>
            <p className="text-sm text-muted-foreground mt-0.5">AI-powered in minutes. Free to start.</p>
          </div>
          <Link
            to="/signup"
            className="shrink-0 px-5 py-2.5 rounded-lg bg-gradient-to-r from-brand-purple to-brand-blue text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Get Started Free
          </Link>
        </div>

        {/* Footer attribution */}
        <p className="text-center text-xs text-muted-foreground">
          Powered by{" "}
          <Link to="/" className="text-primary hover:underline">
            hired.video
          </Link>
        </p>
      </main>
    </div>
  );
}

// ─── Player surface ──────────────────────────────────────────────────────────
// Self-gated dispatch — picks the right embed for the project's payload and
// owns its own playback chrome. Per the DRY rule the caller passes the raw
// ready payload, NOT a "useStudioPlayer" boolean it could compute itself.
//
//   • Real YouTube id        → privacy-friendly iframe (StudioPlayer can't
//                              drive a YouTube embed; iframe stays here).
//   • script (optionally with videoUrl) → unified <StudioPlayer/>. The
//                                          player itself picks baked-vs-live
//                                          via pickPlayerSource — saved-
//                                          public-unrendered projects play
//                                          off the script canvas (#666).
//   • only videoUrl (no script) → unified <StudioPlayer/> with an empty
//                                  script so the baked branch always wins.
//                                  Legacy direct uploads land here.
//   • only thumbnail / nothing → static thumb placeholder.
function PublicVideoSurface({ ready }: { ready: PublicVideoReady }) {
  const isRealYouTube = !!ready.youtubeVideoId && !ready.youtubeVideoId.startsWith("yt_");
  const directVideoUrl =
    ready.videoUrl && !ready.videoUrl.includes("youtube.com/watch?v=yt_")
      ? ready.videoUrl
      : null;
  // Parse leniently — the server passes `studio_projects.storyboard`
  // verbatim, which usually conforms to VideoScript but can carry extra
  // metadata fields (`_name`, `_slug`) and pre-schema legacy rows. When
  // it doesn't parse cleanly we fall through to the videoUrl-only or
  // thumbnail branch rather than failing the whole page.
  const playableScript = parsePlayableScript(ready.script);

  if (isRealYouTube) {
    return (
      <AspectFrame
        ratio={ready.aspect ?? undefined}
        className="rounded-xl overflow-hidden bg-black shadow-lg"
      >
        <iframe
          src={`https://www.youtube.com/embed/${ready.youtubeVideoId}?modestbranding=1&playsinline=1&rel=0&controls=1`}
          title={ready.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      </AspectFrame>
    );
  }

  // Prefer the baked URL when available — it's authoritative (the
  // published render) and native <video controls> gives the cleanest
  // cross-platform watch UX. StudioPlayer's source-picker requires a
  // freshly-stamped `_meta.bakedHash` to choose the baked branch, which
  // legacy + unstamped projects don't carry, so we route around it here
  // rather than risk falling into the live branch with no compiled
  // video. The script-only branch below handles the #666 case (saved-
  // public-unrendered) where there's no baked URL to play.
  if (directVideoUrl) {
    return (
      <AspectFrame
        ratio={ready.aspect ?? undefined}
        className="rounded-xl overflow-hidden bg-black shadow-lg"
      >
        <BakedVideo url={directVideoUrl} title={ready.title} poster={ready.thumbnailUrl ?? undefined} hotzones={ready.ctaHotzones} />
      </AspectFrame>
    );
  }

  if (playableScript) {
    return (
      <UnifiedPlayer
        script={playableScript}
        aspectRatio={ready.aspect ?? undefined}
        title={ready.title}
        hotzones={ready.ctaHotzones}
      />
    );
  }

  if (ready.thumbnailUrl) {
    return (
      <AspectFrame
        ratio={ready.aspect ?? undefined}
        className="rounded-xl overflow-hidden bg-black shadow-lg"
      >
        <img
          src={ready.thumbnailUrl}
          alt={ready.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      </AspectFrame>
    );
  }

  return (
    <div className="aspect-video rounded-xl overflow-hidden bg-black/5 border border-border shadow-lg flex items-center justify-center">
      <p className="text-muted-foreground">Video is being processed. Check back soon.</p>
    </div>
  );
}

// UnifiedPlayer — script-only branch. The project is saved + public but
// has no baked render yet (#666), so mount the unified <StudioPlayer/>
// against the saved VideoScript and drive playback off the compiled
// timeline. Public page draws its own play/scrub chrome because
// StudioPlayer is designed for editor-driven playback (no built-in
// controls) — single source of truth lives in StudioPreview.tsx but the
// shape's small enough to inline here without dragging in editor chrome.
function UnifiedPlayer({
  script,
  aspectRatio,
  title,
  hotzones,
}: {
  script: VideoScript;
  aspectRatio: string | undefined;
  title: string;
  hotzones: { startSec: number; endSec: number; x: number; y: number; w: number; h: number; url: string }[];
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
    <div className="space-y-2">
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

// BakedVideo — native <video controls> with the CTA-hotzones overlay
// stacked on top. Used when a published render exists; the URL is the
// canonical artifact so we don't try to recompile the script for it.
function BakedVideo({
  url,
  title,
  poster,
  hotzones,
}: {
  url: string;
  title: string;
  poster: string | undefined;
  hotzones: { startSec: number; endSec: number; x: number; y: number; w: number; h: number; url: string }[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState<number | undefined>(undefined);
  return (
    <>
      <video
        ref={videoRef}
        src={url}
        poster={poster}
        controls
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
