// TemplatePlayer.tsx — press-play preview for marketplace templates.
//
// Wraps the unified <StudioPlayer/> so any template kind plays through one
// surface: studio-builtins compile their hand-curated `demoScript` and
// route through StudioPlayer's live (canvas) branch; studio-creator
// templates with a `previewVideoUrl` route through a bare `<video>` (no
// hash + no script means the baked-freshness check can't pass — so this
// component owns the simple HTML5 path explicitly rather than pretending
// to be baked-fresh just to reach the same code path).
//
// Resume templates have no time dimension, so this component returns
// null for them — callers (MarketplaceTemplatePreview) keep their
// existing TemplatePreview render for that kind.
//
// Press-play UX: until the user clicks Play we show the static
// TemplateThumb / thumbnailUrl with a centered Play button. Avoids
// autoplay friction (sound + bandwidth) and keeps the SEO-friendly still
// thumb visible for crawlers, while the click-to-play interaction is
// what every comparable marketplace (Canva / Envato / VEED) ships.

import { Play } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import StudioPlayer from "@/components/studio/StudioPlayer";
import TemplateThumb from "@/components/studio/templates/TemplateThumb";
import { compile } from "@/lib/compiler/video-compiler";
import type { TemplateMeta } from "@/lib/templates/types";

interface Props {
  meta: TemplateMeta;
}

export default function TemplatePlayer({ meta }: Props) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Resume templates aren't time-based — surface nothing so the parent
  // page keeps its non-playable DeclarativeResumeRenderer surface.
  if (meta.origin.kind === "resume") return null;

  if (meta.origin.kind === "studio-builtin") {
    return (
      <BuiltinPlayer
        meta={meta}
        playing={playing}
        currentTime={currentTime}
        onSetPlaying={setPlaying}
        onSetCurrentTime={setCurrentTime}
      />
    );
  }

  // studio-creator. We render whatever media the creator uploaded —
  // video when present, image fallback otherwise. The press-play overlay
  // is shared via <PosterStartOverlay/> so both branches look identical
  // before playback begins.
  return (
    <CreatorPlayer meta={meta} playing={playing} onSetPlaying={setPlaying} />
  );
}

// ─── Built-in branch ─────────────────────────────────────────────────────────

function BuiltinPlayer({
  meta,
  playing,
  currentTime,
  onSetPlaying,
  onSetCurrentTime,
}: {
  meta: Extract<TemplateMeta, { origin: { kind: "studio-builtin" } }>;
  playing: boolean;
  currentTime: number;
  onSetPlaying: (v: boolean) => void;
  onSetCurrentTime: (t: number) => void;
}) {
  const script = meta.origin.def.demoScript;

  // Compile once per script reference. The catalog is static so this is
  // effectively a build-time computation — no perf hazard.
  const compiledVideo = useMemo(
    () => compile(script, { includeBranding: false }),
    [script],
  );

  // Build the StudioPlayer state slice the player expects. videoUrl is
  // intentionally null so pickPlayerSource picks the live branch every
  // time — no baked MP4 exists for a hand-curated demo.
  const playerState = useMemo(
    () => ({
      script,
      videoUrl: null,
      voiceover: undefined,
      captions: undefined,
    }),
    [script],
  );

  return (
    <div className="relative h-full w-full bg-black">
      {playing ? (
        <StudioPlayer
          state={playerState}
          compiledVideo={compiledVideo}
          playing={playing}
          currentTime={currentTime}
          onTimeUpdate={onSetCurrentTime}
          onEnded={() => onSetPlaying(false)}
          removeBrandingFlag
          className="h-full w-full"
        />
      ) : (
        <>
          <TemplateThumb
            template={meta.origin.def}
            className="h-full w-full rounded-none"
          />
          <PosterStartOverlay
            onPlay={() => {
              onSetCurrentTime(0);
              onSetPlaying(true);
            }}
            label={`Play ${meta.name} preview`}
          />
        </>
      )}
    </div>
  );
}

// ─── Creator branch ──────────────────────────────────────────────────────────

function CreatorPlayer({
  meta,
  playing,
  onSetPlaying,
}: {
  meta: Extract<TemplateMeta, { origin: { kind: "studio-creator" } }>;
  playing: boolean;
  onSetPlaying: (v: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const videoUrl = meta.previewVideoUrl;
  if (!videoUrl) {
    // No video uploaded — show whatever poster the creator provided, or
    // a generic empty state. Either way no Play button (nothing to play).
    return (
      <div className="relative h-full w-full bg-muted/30">
        {meta.thumbnailUrl ? (
          <img
            src={meta.thumbnailUrl}
            alt={meta.name}
            className="h-full w-full object-cover"
            crossOrigin="anonymous"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            No preview available
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-black">
      <video
        ref={videoRef}
        src={videoUrl}
        poster={meta.thumbnailUrl}
        controls={playing}
        playsInline
        preload="metadata"
        onEnded={() => onSetPlaying(false)}
        className="h-full w-full object-contain"
      />
      {!playing && (
        <PosterStartOverlay
          onPlay={() => {
            onSetPlaying(true);
            void videoRef.current?.play().catch(() => onSetPlaying(false));
          }}
          label={`Play ${meta.name} preview`}
        />
      )}
    </div>
  );
}

// ─── Shared press-play overlay ───────────────────────────────────────────────

function PosterStartOverlay({
  onPlay,
  label,
}: {
  onPlay: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={label}
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 transition hover:bg-black/30 focus-visible:bg-black/30"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-xl backdrop-blur transition group-hover:scale-105">
        <Play className="ml-1 h-7 w-7 fill-current" />
      </span>
    </button>
  );
}
