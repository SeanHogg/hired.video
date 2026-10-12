// TemplatePlayer.tsx — press-play preview for marketplace templates.
//
// Studio-builtin templates pull their canvas straight from the v2
// `seedCanvasFromTemplate(id)` source and play through `<TimelineFramePreview/>`
// — the same component the editor's PreviewOverlay mounts. Single
// source of truth for "what does template X look like playing", so the
// marketplace preview and the editor preview can never drift.
//
// Studio-creator templates resolve in priority order:
//   1. `previewVideoUrl` — a pre-rendered MP4 the creator uploaded. Plays
//      through a bare `<video>` (exact pixels, not an editable canvas).
//   2. `videoScript` — the published v1 storyboard. Converted to a v2
//      CanvasState via `scriptToCanvasState` (the SAME conversion the
//      editor draft path runs on "Use") and played through the shared
//      `<TimelineFramePreview/>`. This is what keeps script-only creator
//      templates — e.g. the sector video-resume catalog — from showing a
//      bare "No preview available" even though the studio plays them fine.
//   3. neither — the creator's poster image, or a generic empty state.
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

import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import TimelineFramePreview from "@/components/studio/v2/TimelineFramePreview";
import TemplateThumb from "@/components/studio/templates/TemplateThumb";
import type { TemplateDef } from "@/lib/studio/templates/catalog";
import { seedCanvasFromTemplate } from "@/lib/studio/editor-v2/template-seeds";
import { scriptToCanvasState } from "@/lib/studio/editor-v2/script-to-canvas";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { usePreviewPlayback, type PreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import type { VideoScript } from "@/types/video-script";
import type { TemplateMeta } from "@/lib/templates/types";

interface Props {
  meta: TemplateMeta;
}

export default function TemplatePlayer({ meta }: Props) {
  // Resume templates aren't time-based — surface nothing so the parent
  // page keeps its non-playable DeclarativeResumeRenderer surface.
  if (meta.resumeDescriptor || meta.origin.kind === "resume") return null;

  if (meta.origin.kind === "studio-builtin") {
    return <BuiltinPlayer def={meta.origin.def} name={meta.name} />;
  }

  // studio-creator. CreatorPlayer picks MP4 → canvas script → poster in
  // priority order — see the file header for why.
  return (
    <CreatorPlayer
      videoScript={meta.origin.template.videoScript}
      previewVideoUrl={meta.previewVideoUrl}
      thumbnailUrl={meta.thumbnailUrl}
      name={meta.name}
    />
  );
}

// ─── Shared canvas player ────────────────────────────────────────────────────

// Press-play player for any v2 CanvasState. Built-ins seed theirs from the
// catalog; creator templates derive theirs from the published `videoScript`.
// Both render through `<TimelineFramePreview/>` — the SAME component the editor's
// PreviewOverlay mounts — so marketplace preview and editor preview can't
// drift. `poster` is the static still shown before playback; when omitted the
// canvas itself (paused at frame 0) is the still.
function CanvasPreviewPlayer({
  canvasState,
  name,
  poster,
}: {
  canvasState: CanvasState;
  name: string;
  poster?: ReactNode;
}) {
  const { t } = useTranslation();
  const playback = usePreviewPlayback(canvasState);
  const [started, setStarted] = useState(false);

  // The poster is shown only until the first play — once started we keep the
  // canvas mounted (paused at the last frame when playback ends) and let the
  // transport bar drive replay / scrub. This gives the marketplace preview a
  // standard player (play/pause + progress + mute) instead of a press-play-
  // then-static surface, and removes the old auto-snap-back-to-poster jump.
  const showPoster = !started && poster != null;
  const atEnd = playback.playhead >= playback.duration && !playback.isPlaying;

  return (
    <div className="group relative h-full w-full bg-black">
      {showPoster ? (
        poster
      ) : (
        <TimelineFramePreview state={canvasState} playback={playback} />
      )}

      {/* Initial press-play overlay — only before the first play. */}
      {!started && (
        <PosterStartOverlay
          onPlay={() => {
            playback.seek(0);
            playback.play();
            setStarted(true);
          }}
          label={t("templatePlayer.playPreview", { name })}
        />
      )}

      {/* Centered play/replay affordance whenever the canvas is mounted but
          paused — the familiar big-button you click to resume. */}
      {started && !playback.isPlaying && (
        <PosterStartOverlay
          onPlay={() => playback.play()}
          label={t(atEnd ? "templatePlayer.replayPreview" : "templatePlayer.playPreview", { name })}
        />
      )}

      {/* Transport bar — appears once playback has started. */}
      {started && (
        <PlayerTransportBar playback={playback} />
      )}
    </div>
  );
}

// ─── Transport bar ───────────────────────────────────────────────────────────

// Standard player chrome for the canvas branch: play/pause, a seekable
// progress bar, elapsed / total time, and a mute toggle — all driven by the
// shared `usePreviewPlayback` hook (the SAME hook the editor preview uses),
// so there's no bespoke playback state here. Fades in on hover so it doesn't
// obscure the frame.
function PlayerTransportBar({ playback }: { playback: PreviewPlayback }) {
  const { t } = useTranslation();
  const { isPlaying, playhead, duration, toggle, seek, muted, toggleMute } = playback;

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <button
        type="button"
        onClick={toggle}
        aria-label={t(isPlaying ? "templatePlayer.pause" : "templatePlayer.play")}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/95 text-foreground transition hover:scale-105"
      >
        {isPlaying ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="ml-0.5 h-4 w-4 fill-current" />
        )}
      </button>

      <input
        type="range"
        min={0}
        max={Math.max(0.01, duration)}
        step={0.05}
        value={playhead}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label={t("templatePlayer.seek")}
        className="h-1 flex-1 cursor-pointer accent-white"
      />

      <span className="shrink-0 font-mono text-[11px] tabular-nums text-white/90">
        {fmtTime(playhead)} / {fmtTime(duration)}
      </span>

      <button
        type="button"
        onClick={toggleMute}
        aria-label={t(muted ? "templatePlayer.unmute" : "templatePlayer.mute")}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
    </div>
  );
}

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// ─── Built-in branch ─────────────────────────────────────────────────────────

/** Press-play preview of a built-in catalog template — also the
 *  /templates/:slug hero (#922). */
export function BuiltinPlayer({ def, name }: { def: TemplateDef; name: string }) {
  // Pull the v2 canvas seed straight from the single source of truth
  // (template-seeds.ts). The same seed feeds useCreateStudioDraft when
  // the user clicks Use, so this surface and the editor's PreviewOverlay
  // render through identical primitives — what visitors watch on the
  // marketplace IS what they land on in the editor.
  const canvasState = useMemo(() => seedCanvasFromTemplate(def.id), [def.id]);
  return (
    <CanvasPreviewPlayer
      canvasState={canvasState}
      name={name}
      poster={<TemplateThumb template={def} className="h-full w-full rounded-none" />}
    />
  );
}

// ─── Creator branch ──────────────────────────────────────────────────────────

function CreatorPlayer({
  videoScript,
  previewVideoUrl,
  thumbnailUrl,
  name,
}: {
  videoScript: unknown;
  previewVideoUrl: string | undefined;
  thumbnailUrl: string | undefined;
  name: string;
}) {
  // A pre-rendered MP4 the creator uploaded wins — those are exact pixels,
  // not an editable canvas, so the v2 player isn't applicable.
  if (previewVideoUrl) {
    return (
      <CreatorVideoPlayer
        videoUrl={previewVideoUrl}
        thumbnailUrl={thumbnailUrl}
        name={name}
      />
    );
  }
  // No MP4 — play the published canvas script through the shared v2 player
  // (the same path useCreateStudioDraft takes on "Use"). This is what
  // fixes the bare "No preview available" for script-only creator templates.
  if (isRenderableScript(videoScript)) {
    return (
      <CreatorCanvasPlayer
        script={videoScript}
        thumbnailUrl={thumbnailUrl}
        name={name}
      />
    );
  }
  // Neither media nor a renderable script — show whatever poster the
  // creator provided, or a generic empty state.
  return <EmptyPreview thumbnailUrl={thumbnailUrl} name={name} />;
}

function CreatorCanvasPlayer({
  script,
  thumbnailUrl,
  name,
}: {
  script: VideoScript;
  thumbnailUrl: string | undefined;
  name: string;
}) {
  // Convert the v1 VideoScript column → v2 CanvasState exactly as the
  // editor draft path does (useCreateStudioDraft → scriptToCanvasState),
  // so preview and editor render identical content. Guard against a
  // malformed row so a bad script degrades to the poster, not a crash.
  const canvasState = useMemo<CanvasState | null>(() => {
    try {
      return scriptToCanvasState(script);
    } catch {
      return null;
    }
  }, [script]);

  if (!canvasState) {
    return <EmptyPreview thumbnailUrl={thumbnailUrl} name={name} />;
  }

  return (
    <CanvasPreviewPlayer
      canvasState={canvasState}
      name={name}
      // Prefer the creator's still when present; otherwise CanvasPreviewPlayer
      // falls back to the canvas's own frame 0 as the press-play still.
      poster={
        thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={name}
            className="h-full w-full object-cover"
            crossOrigin="anonymous"
          />
        ) : undefined
      }
    />
  );
}

function CreatorVideoPlayer({
  videoUrl,
  thumbnailUrl,
  name,
}: {
  videoUrl: string;
  thumbnailUrl: string | undefined;
  name: string;
}) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
          label={t("templatePlayer.playPreview", { name })}
        />
      )}
    </div>
  );
}

function EmptyPreview({
  thumbnailUrl,
  name,
}: {
  thumbnailUrl: string | undefined;
  name: string;
}) {
  const { t } = useTranslation();
  // No video uploaded — show whatever poster the creator provided, or a
  // generic empty state. Either way no Play button (nothing to play).
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
          {t("templatePlayer.noPreview")}
        </div>
      )}
    </div>
  );
}

/** A `videoScript` column is renderable when it carries the shape
 *  `scriptToCanvasState` reads: a `video` settings object and at least one
 *  scene. Anything else (null, legacy junk, empty draft) degrades to the
 *  poster / empty state rather than rendering a blank canvas. */
function isRenderableScript(value: unknown): value is VideoScript {
  if (!value || typeof value !== "object") return false;
  const v = value as { video?: unknown; scenes?: unknown };
  return (
    !!v.video &&
    typeof v.video === "object" &&
    Array.isArray(v.scenes) &&
    v.scenes.length > 0
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
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-foreground shadow-xl backdrop-blur transition group-hover:scale-105">
        <Play className="ml-1 h-7 w-7 fill-current" />
      </span>
    </button>
  );
}
