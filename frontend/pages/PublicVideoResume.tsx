import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiClient } from "@/lib/api-client";
import { z } from "zod";
import VideoPlayer from "@/components/VideoPlayer";
import CtaHotzonesOverlay from "@/components/video/CtaHotzonesOverlay";

// ─── Schema ───────────────────────────────────────────────────────────────────
// The endpoint returns one of two shapes discriminated by `pending`:
//   • pending: false — fully rendered + public, full payload below.
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
  // Playhead + ref for the URL-branch `<video>` element. Driven by the
  // CTA hot-zone overlay so a click can pause playback before the new
  // tab opens. Both stay `undefined` / null for YouTube + thumbnail
  // branches (no native video element to address).
  const videoElRef = useRef<HTMLVideoElement>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState<number | undefined>(undefined);

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

  // Resolve which player branch fits the data, then hand the result to
  // VideoPlayer — that component owns the actual embed JSX so this page
  // doesn't fork into 3 hardcoded branches anymore.
  const isRealYouTube = !!ready.youtubeVideoId && !ready.youtubeVideoId.startsWith("yt_");
  const directVideoUrl = ready.videoUrl && !ready.videoUrl.includes("youtube.com/watch?v=yt_")
    ? ready.videoUrl
    : null;
  const playerSource: import("@/components/VideoPlayer").VideoPlayerSource | null = isRealYouTube
    ? { kind: "youtube", videoId: ready.youtubeVideoId! }
    : directVideoUrl
      ? { kind: "url", url: directVideoUrl }
      : ready.thumbnailUrl
        ? { kind: "thumbnail", thumbnailUrl: ready.thumbnailUrl }
        : null;

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
          {video.ownerAvatar ? (
            <img
              src={video.ownerAvatar}
              alt={video.ownerName ?? ""}
              className="w-14 h-14 rounded-full object-cover border border-border"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold">
              {(video.ownerName ?? "?")[0].toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-foreground">{video.title}</h1>
            {video.ownerName && (
              <p className="text-muted-foreground text-sm mt-0.5">{video.ownerName}</p>
            )}
          </div>
        </div>

        {/* Video embed — VideoPlayer owns the source-kind branching and
            sizes the frame from the published aspect ratio so vertical /
            square / 4:3 renders aren't letterboxed into 16:9. The CTA
            hot-zones overlay renders as a child so it inherits the
            same AspectFrame and its fractional bboxes land on the
            correct pixels regardless of player size. */}
        {playerSource ? (
          <VideoPlayer
            source={playerSource}
            aspectRatio={ready.aspect ?? undefined}
            title={ready.title}
            poster={ready.thumbnailUrl ?? undefined}
            videoRef={videoElRef}
            onTimeUpdate={setCurrentTimeSec}
          >
            <CtaHotzonesOverlay
              hotzones={ready.ctaHotzones}
              currentTimeSec={currentTimeSec}
              onActivate={() => videoElRef.current?.pause()}
            />
          </VideoPlayer>
        ) : (
          <div className="aspect-video rounded-xl overflow-hidden bg-black/5 border border-border shadow-lg flex items-center justify-center">
            <p className="text-muted-foreground">Video is being processed. Check back soon.</p>
          </div>
        )}

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
