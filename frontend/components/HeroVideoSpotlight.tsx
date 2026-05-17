import { useEffect, useRef, useState } from "react";
import { Play, Pause, Sparkles, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import VideoPlayer, { type VideoPlayerSource } from "@/components/VideoPlayer";
import StudioVideoSurface from "@/components/studio/StudioVideoSurface";
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

  // No manual restart effect needed — VideoPlayer is keyed on the slide
  // id below, so React fully remounts the embed when the rotation
  // advances. That naturally resets currentTime + retriggers autoplay.

  const goToResume = () => {
    if (!hasRealVideo) {
      navigate("/studio");
      return;
    }
    if (current.resumeId) {
      navigate(`/resumes/${current.resumeId}`);
    } else {
      navigate(`/v/${current.id}`);
    }
  };

  // Desktop autoplays the video as a "live thumbnail"; mobile/tablet shows
  // a poster+play overlay (saves cellular data, respects iOS Low Power
  // Mode, a tap still lands users on the detail page).
  //
  // Three desktop sources, picked in order:
  //   1. Baked CDN URL          → cheapest, native autoplay/loop/muted.
  //   2. Real YouTube id        → privacy-friendly iframe embed.
  //   3. Saved-but-unrendered   → fall through to <StudioVideoSurface/>
  //                               (the universal player). Lazy-fetches
  //                               the project, compiles the script
  //                               client-side, plays the live canvas —
  //                               same path the editor's Preview uses.
  //                               This is the gap #717 fix: a SA-pinned
  //                               featured video that hasn't been
  //                               rendered yet still plays on the hero,
  //                               instead of stranding the rotation on
  //                               a static thumbnail.
  const useStudioSurface = isDesktop && hasRealVideo && !current.videoUrl && !current.youtubeVideoId;
  const playerSource: VideoPlayerSource | null = !hasRealVideo || useStudioSurface
    ? null
    : isDesktop && current.videoUrl
      ? { kind: "url", url: current.videoUrl }
      : isDesktop && current.youtubeVideoId
        ? { kind: "youtube", videoId: current.youtubeVideoId }
        : { kind: "thumbnail", thumbnailUrl: current.thumbnailUrl };
  const isAutoplaying = useStudioSurface || playerSource?.kind === "url" || playerSource?.kind === "youtube";

  // Overlay chrome stacked on top of the embed inside VideoPlayer's
  // AspectFrame. Defined once so the same node renders for every branch.
  const overlay = (
    <>
      {/* Click-through capture — covers the whole tile so user taps land
          on the detail page rather than the iframe / video element. */}
      <button
        type="button"
        onClick={goToResume}
        aria-label={t("labels.openVideoResumeAria", { title: displayTitle })}
        className="absolute inset-0 z-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />

      {/* Tap-to-play affordance on mobile/tablet — never on desktop autoplay. */}
      {!isAutoplaying && hasRealVideo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
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
          {t("labels.featuredVideoResume")}
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
          aria-label={paused ? t("actions.resumeRotation") : t("actions.pauseRotation")}
          className="absolute top-2 right-2 z-20 h-11 w-11 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
        >
          {paused ? <Play className="h-4 w-4 ml-0.5" /> : <Pause className="h-4 w-4" />}
        </button>
      )}

      {/* Bottom gradient + metadata */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 pt-12 pointer-events-none">
        <p className="text-xs text-white/70 mb-1">
          {isAutoplaying ? t("labels.nowPlaying") : t("labels.featured")}
        </p>
        <h3 className="text-white font-semibold text-base leading-snug line-clamp-2">
          {displayTitle}
        </h3>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-white/80">{t("labels.byCreator", { name: current.ownerName })}</p>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-white group-hover:text-primary transition-colors">
            {hasRealVideo ? t("actions.watch") : t("actions.createYours")}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </>
  );

  return (
    <div ref={containerRef} className="relative">
      <div className="group relative w-full max-w-md lg:max-w-none mx-auto">
        {useStudioSurface && current.id !== "__skeleton__" ? (
          // Universal-player branch — saved-but-unrendered videos play
          // here off their saved script. StudioVideoSurface owns the
          // fetch + compile + StudioPlayer mount; overlay floats above
          // via the wrapper below.
          <div className="rounded-2xl shadow-2xl ring-1 ring-border overflow-hidden relative">
            <StudioVideoSurface
              key={current.id}
              mode="lazy"
              videoId={current.id}
              poster={current.thumbnailUrl}
              title={displayTitle}
              autoplay
            />
            {overlay}
          </div>
        ) : playerSource ? (
          <VideoPlayer
            key={current.id}
            source={playerSource}
            title={displayTitle}
            poster={current.thumbnailUrl ?? undefined}
            controls={false}
            autoPlay={isAutoplaying}
            loop={isAutoplaying}
            muted
            className="rounded-2xl shadow-2xl ring-1 ring-border"
          >
            {overlay}
          </VideoPlayer>
        ) : (
          // Empty-state placeholder — no real video yet. Uses AspectFrame
          // implicitly through the same wrapper styling so the box stays
          // the same size as a real player.
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

      {/* Secondary CTA under video */}
      <div className="mt-4 flex flex-col sm:flex-row gap-2 lg:justify-start justify-center">
        <Button
          size="sm"
          className="gap-2"
          onClick={() => navigate("/studio")}
        >
          <Sparkles className="h-4 w-4" />
          {t("actions.createYourVideoResume")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => navigate("/resumes")}
        >
          {videos.length > 0
            ? t("actions.browseNumberVideoResumes", { count: videos.length })
            : t("actions.browseVideoResumes")}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
