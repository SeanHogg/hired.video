import { useEffect, useRef, useState } from "react";
import { Play, Pause, Sparkles, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PublicVideo } from "@/lib/services/studio-service";

interface HeroVideoSpotlightProps {
  videos: PublicVideo[];
  desktopRotationMs?: number;
  mobileRotationMs?: number;
}

const SKELETON_FALLBACK: PublicVideo = {
  id: "__skeleton__",
  title: "Your video resume, powered by AI",
  videoUrl: null,
  youtubeUrl: null,
  youtubeVideoId: null,
  thumbnailUrl: null,
  description: null,
  ownerName: "hired.video",
  resumeId: null,
  createdAt: new Date().toISOString(),
};

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

export default function HeroVideoSpotlight({
  videos,
  desktopRotationMs = 10000,
  mobileRotationMs = 6000,
}: HeroVideoSpotlightProps) {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const slides = videos.length > 0 ? videos : [SKELETON_FALLBACK];
  const current = slides[index % slides.length];
  const hasRealVideo = current.id !== "__skeleton__";

  // Pause rotation when the card scrolls out of view (battery + data saver)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Rotation timer — disabled when paused, off-screen, or only one slide
  useEffect(() => {
    if (paused || !isVisible || slides.length < 2) return;
    const ms = isDesktop ? desktopRotationMs : mobileRotationMs;
    const id = window.setTimeout(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, ms);
    return () => window.clearTimeout(id);
  }, [index, paused, isVisible, isDesktop, slides.length, desktopRotationMs, mobileRotationMs]);

  // Restart autoplay when slide changes (desktop only)
  useEffect(() => {
    if (!isDesktop) return;
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = 0;
    const play = el.play();
    if (play && typeof play.catch === "function") play.catch(() => {});
  }, [current.videoUrl, isDesktop]);

  const goToResume = () => {
    if (!hasRealVideo) {
      navigate("/resumes/upload/video");
      return;
    }
    if (current.resumeId) {
      navigate(`/resumes/${current.resumeId}`);
    } else {
      navigate(`/v/${current.id}`);
    }
  };

  // Desktop autoplays video; mobile/tablet shows thumbnail + large play button
  // (saves cellular data, respects iOS Low Power Mode, and a tap still lands
  // users on the detail page where they can watch deliberately).
  const showAutoplayVideo = isDesktop && hasRealVideo && !!current.videoUrl;
  const showAutoplayYouTube =
    isDesktop && hasRealVideo && !current.videoUrl && !!current.youtubeVideoId;

  return (
    <div ref={containerRef} className="relative">
      <div
        className="group relative aspect-video w-full max-w-md lg:max-w-none mx-auto rounded-2xl overflow-hidden shadow-2xl ring-1 ring-border bg-gradient-to-br from-brand-purple/20 to-brand-blue/20 cursor-pointer"
        onClick={goToResume}
        role="button"
        aria-label={`Open video resume: ${current.title}`}
      >
        {showAutoplayVideo ? (
          <video
            ref={videoRef}
            key={current.id}
            src={current.videoUrl ?? undefined}
            poster={current.thumbnailUrl ?? undefined}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : showAutoplayYouTube ? (
          <iframe
            key={current.id}
            src={`https://www.youtube.com/embed/${current.youtubeVideoId}?autoplay=1&mute=1&loop=1&controls=0&playlist=${current.youtubeVideoId}&modestbranding=1&playsinline=1&rel=0`}
            title={current.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
        ) : current.thumbnailUrl ? (
          <img
            src={current.thumbnailUrl}
            alt={current.title}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center px-6">
              <div className="mx-auto h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">
                Video resumes land here
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Be one of the first creators featured on the home screen.
              </p>
            </div>
          </div>
        )}

        {/* Tap-to-play affordance on mobile/tablet (hidden on desktop autoplay) */}
        {!showAutoplayVideo && !showAutoplayYouTube && hasRealVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="h-16 w-16 rounded-full bg-black/60 group-hover:bg-black/75 group-active:scale-95 transition-all flex items-center justify-center backdrop-blur-sm shadow-xl">
              <Play className="h-7 w-7 text-white fill-white ml-1" />
            </div>
          </div>
        )}

        {/* Top-left badge */}
        <div className="absolute top-3 left-3 z-10">
          <Badge className="bg-black/60 text-white border-0 backdrop-blur-sm gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            Featured video resume
          </Badge>
        </div>

        {/* Pause/play control — 44×44 touch target */}
        {slides.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPaused((p) => !p);
            }}
            aria-label={paused ? "Resume rotation" : "Pause rotation"}
            className="absolute top-2 right-2 z-10 h-11 w-11 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
          >
            {paused ? <Play className="h-4 w-4 ml-0.5" /> : <Pause className="h-4 w-4" />}
          </button>
        )}

        {/* Bottom gradient + metadata */}
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 pt-12">
          <p className="text-xs text-white/70 mb-1">
            {showAutoplayVideo || showAutoplayYouTube ? "Now playing" : "Featured"}
          </p>
          <h3 className="text-white font-semibold text-base leading-snug line-clamp-2">
            {current.title}
          </h3>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-white/80">by {current.ownerName}</p>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-white group-hover:text-primary transition-colors">
              {hasRealVideo ? "Watch" : "Create yours"}
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>

      {/* Dots indicator */}
      {slides.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {slides.slice(0, Math.min(slides.length, 6)).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show featured video ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === index % Math.min(slides.length, 6)
                  ? "bg-primary w-6"
                  : "bg-border w-1.5 hover:bg-muted-foreground/60"
              }`}
            />
          ))}
        </div>
      )}

      {/* Secondary CTA under video */}
      <div className="mt-4 flex flex-col sm:flex-row gap-2 lg:justify-start justify-center">
        <Button
          size="sm"
          className="gap-2"
          onClick={() => navigate("/resumes/upload/video")}
        >
          <Sparkles className="h-4 w-4" />
          Create your video resume
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => navigate("/resumes")}
        >
          Browse {videos.length > 0 ? `${videos.length}+ ` : ""}video resumes
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
