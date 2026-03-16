import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiClient } from "@/lib/api-client";
import { z } from "zod";

// ─── Schema ───────────────────────────────────────────────────────────────────
const PublicVideoSchema = z.object({
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
  createdAt: z.string(),
});
type PublicVideo = z.infer<typeof PublicVideoSchema>;

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

function applyOgTags(video: PublicVideo) {
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
      .then((res) => {
        const result = PublicVideoSchema.safeParse(res);
        if (result.success) {
          setVideo(result.data);
          applyOgTags(result.data);
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

  const embedSrc = video.youtubeVideoId
    ? `https://www.youtube.com/embed/${video.youtubeVideoId}?autoplay=0&rel=0`
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

        {/* Video embed */}
        {embedSrc ? (
          <div className="aspect-video rounded-xl overflow-hidden bg-black shadow-lg">
            <iframe
              src={embedSrc}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        ) : video.videoUrl ? (
          <div className="aspect-video rounded-xl overflow-hidden bg-black shadow-lg">
            <video src={video.videoUrl} controls className="w-full h-full" />
          </div>
        ) : video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full rounded-xl shadow-lg"
          />
        ) : null}

        {/* Description */}
        {video.description && (
          <p className="text-muted-foreground leading-relaxed">{video.description}</p>
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
