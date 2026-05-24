import { useEffect, useRef, useState } from "react";
import { Play, Pause, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PublicVideoPreview from "@/components/PublicVideoPreview";
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const slides = videos.length > 0 ? videos : [SKELETON_FALLBACK];
  const current = slides[index % slides.length];
  const hasRealVideo = current.id !== "__skeleton__";
  const displayTitle = hasRealVideo ? current.title : t("messages.heroSpotlightFallbackTitle");

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

  // No manual restart effect needed — PublicVideoPreview is keyed on
  // the slide id below, so React fully remounts the embed when the
  // rotation advances. That naturally resets currentTime + retriggers
  // autoplay.

  // Overlay chrome stacked on top of the embed inside the preview's
  // AspectFrame. The previous click-through capture + bottom metadata
  // gradient + "Watch →" CTA were removed: the click-through blocked
  // every native player control (you couldn't pause), and the bottom
  // gradient occluded the shared <PlaybackControls/> bar the canvas
  // surface now renders. The pause/play rotation control + top-left
  // featured badge remain because they're rotation chrome, not video
  // chrome — they don't fight the player.
  const overlay = (
    <>
      {/* Top-left badge */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none">
        <Badge className="bg-black/60 text-white border-0 backdrop-blur-sm gap-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          {t("labels.featuredVideoResume")}
        </Badge>
      </div>

      {/* Rotation pause/play — controls the slide carousel, not the
          underlying video. Top-right so it doesn't collide with the
          player's own controls bar below. */}
      {slides.length > 1 && (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? t("actions.resumeRotation") : t("actions.pauseRotation")}
          className="absolute top-2 right-2 z-20 h-11 w-11 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
        >
          {paused ? <Play className="h-4 w-4 ml-0.5" /> : <Pause className="h-4 w-4" />}
        </button>
      )}
    </>
  );

  return (
    <div ref={containerRef} className="relative">
      <div className="group relative w-full max-w-md lg:max-w-none mx-auto">
        {hasRealVideo ? (
          <PublicVideoPreview
            key={current.id}
            video={current}
            title={displayTitle}
            controls={false}
            autoPlay
            loop
            muted
            className="rounded-2xl shadow-2xl ring-1 ring-border"
          >
            {overlay}
          </PublicVideoPreview>
        ) : (
          // Empty-state placeholder — no real video yet. Uses the same
          // wrapper styling as the player so the box stays the same size.
          <div className="aspect-video rounded-2xl overflow-hidden shadow-2xl ring-1 ring-border bg-gradient-to-br from-brand-purple/20 to-brand-blue/20 relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center px-6">
                <div className="mx-auto h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                  <Sparkles className="h-7 w-7 text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {t("messages.videoResumesLandHere")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("messages.beOneOfFirstCreators")}
                </p>
              </div>
            </div>
            {overlay}
          </div>
        )}
      </div>

      {/* Dots indicator */}
      {slides.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {slides.slice(0, Math.min(slides.length, 6)).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={t("labels.showFeaturedVideoAria", { index: i + 1 })}
              className={`h-1.5 rounded-full transition-all ${
                i === index % Math.min(slides.length, 6)
                  ? "bg-primary w-6"
                  : "bg-border w-1.5 hover:bg-muted-foreground/60"
              }`}
            />
          ))}
        </div>
      )}

      {/* Primary CTA under the video. */}
      <div className="mt-4 flex flex-col sm:flex-row gap-2 lg:justify-start justify-center">
        <Button
          size="sm"
          className="gap-2"
          onClick={() => navigate("/studio")}
        >
          <Sparkles className="h-4 w-4" />
          {t("actions.createYourVideoResume")}
        </Button>
      </div>
    </div>
  );
}
