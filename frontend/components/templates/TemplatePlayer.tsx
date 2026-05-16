// TemplatePlayer.tsx — press-play preview for marketplace templates.
//
// Studio-builtin templates render through the SAME v2 canvas pipeline
// the editor uses (`scriptToCanvasState` + `usePreviewPlayback` +
// `<CanvasStatePreview/>`), so the composition visitors watch on
// `/marketplace/templates/<slug>` is pixel-identical to what they get
// when they click Use and land in the editor. Previously this surface
// went through the legacy v1 `compile()` + scene-graph renderer, which
// produced visibly different frames.
//
// Studio-creator templates with a `previewVideoUrl` play through a bare
// `<video>` element — those are pre-rendered MP4s, not editable canvas
// states, so the v2 player isn't applicable.
//
// Resume templates have no time dimension; this component returns null
// for them and the parent page (MarketplaceTemplatePreview) keeps its
// existing TemplatePreview render.
//
// Press-play UX: until the user clicks Play we show the static
// TemplateThumb / thumbnailUrl with a centered Play button. Avoids
// autoplay friction (sound + bandwidth) and keeps the SEO-friendly still
// thumb visible for crawlers, while the click-to-play interaction is
// what every comparable marketplace (Canva / Envato / VEED) ships.

import { Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import CanvasStatePreview from "@/components/studio/v2/CanvasStatePreview";
import TemplateThumb from "@/components/studio/templates/TemplateThumb";
import type { TemplateDef } from "@/components/studio/templates/catalog";
import { scriptToCanvasState } from "@/lib/studio/editor-v2/script-to-canvas";
import { usePreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import type { TemplateMeta } from "@/lib/templates/types";

interface Props {
  meta: TemplateMeta;
}

export default function TemplatePlayer({ meta }: Props) {
  // Resume templates aren't time-based — surface nothing so the parent
  // page keeps its non-playable DeclarativeResumeRenderer surface.
  if (meta.origin.kind === "resume") return null;

  if (meta.origin.kind === "studio-builtin") {
    return (
      <BuiltinPlayer def={meta.origin.def} name={meta.name} />
    );
  }

  // studio-creator. We render whatever media the creator uploaded —
  // video when present, image fallback otherwise. Shared press-play
  // overlay so both branches look identical before playback begins.
  return (
    <CreatorPlayer
      videoUrl={meta.previewVideoUrl}
      thumbnailUrl={meta.thumbnailUrl}
      name={meta.name}
    />
  );
}

// ─── Built-in branch ─────────────────────────────────────────────────────────

function BuiltinPlayer({ def, name }: { def: TemplateDef; name: string }) {
  // Convert the demoScript to the v2 CanvasState the editor uses, so this
  // surface and the editor's PreviewOverlay render through identical
  // primitives. Memoised on the script reference — the catalog is static
  // so the conversion is effectively a build-time computation.
  const canvasState = useMemo(
    () => scriptToCanvasState(def.demoScript),
    [def.demoScript],
  );
  const playback = usePreviewPlayback(canvasState);
  const [started, setStarted] = useState(false);

  // When playback ends, drop back to the static thumb so the surface
  // settles in a recognisable state and the user can press Play again.
  // usePreviewPlayback auto-pauses at duration; we observe the flip.
  useEffect(() => {
    if (started && !playback.isPlaying && playback.playhead >= playback.duration) {
      setStarted(false);
    }
  }, [started, playback.isPlaying, playback.playhead, playback.duration]);

  return (
    <div className="relative h-full w-full bg-black">
      {started ? (
        <CanvasStatePreview state={canvasState} playback={playback} />
      ) : (
        <>
          <TemplateThumb template={def} className="h-full w-full rounded-none" />
          <PosterStartOverlay
            onPlay={() => {
              playback.seek(0);
              playback.play();
              setStarted(true);
            }}
            label={`Play ${name} preview`}
          />
        </>
      )}
    </div>
  );
}

// ─── Creator branch ──────────────────────────────────────────────────────────

function CreatorPlayer({
  videoUrl,
  thumbnailUrl,
  name,
}: {
  videoUrl: string | undefined;
  thumbnailUrl: string | undefined;
  name: string;
}) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  if (!videoUrl) {
    // No video uploaded — show whatever poster the creator provided, or
    // a generic empty state. Either way no Play button (nothing to play).
    return (
      <div className="relative h-full w-full bg-muted/30">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={name}
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
        poster={thumbnailUrl}
        controls={playing}
        playsInline
        preload="metadata"
        onEnded={() => setPlaying(false)}
        className="h-full w-full object-contain"
      />
      {!playing && (
        <PosterStartOverlay
          onPlay={() => {
            setPlaying(true);
            void videoRef.current?.play().catch(() => setPlaying(false));
          }}
          label={`Play ${name} preview`}
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
