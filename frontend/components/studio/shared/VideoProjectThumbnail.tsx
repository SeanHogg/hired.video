/**
 * Thumbnail for a StudioProject — single source of truth for "what
 * thumbnail should I show for this project tile?".
 *
 * Per the canvas-runtime extensibility model (#931 / PRD §1.2), every
 * kind has its own preview path; this component dispatches:
 *
 *   1. **Timeline-runtime kinds with visible frames** (video, comic —
 *      which authors via CanvasState) render the first scene of the
 *      project's `timelineSpec` via the shared `<SceneThumbnail/>`
 *      (the same v2 widget renderer the editor canvas uses), so what
 *      consumers see ALWAYS matches the project's current canvas — no
 *      stale baked PNG/JPG drift after an edit.
 *   2. **Audio-only Timeline kinds** (podcast, voice) render the
 *      synthetic-peaks `<WaveformThumbnail/>` so the chooser's "My
 *      videos" grid distinguishes a podcast row from a video one at a
 *      glance (#914).
 *   3. **Game kind** renders `<GameStateThumbnail/>` — a state-driven
 *      preview of the start level's backdrop + sprite positions. Per
 *      DRY: the kind owns its preview shape, not a generic
 *      audio-waveform placeholder.
 *   4. **Image kind** renders either the project's first drawn layer
 *      pixels (when present) OR the shared
 *      `<DrawingPlaceholderThumbnail/>` (the same Photoshop-shaped
 *      visual the catalog card uses, so a fresh drawing project tile
 *      reads identically to its source template).
 *   5. **Animation kind** (#1003) renders the first painted frame's
 *      pixels when present (mirrors image-kind), else a kind-tagged
 *      gradient placeholder so the tile is still distinguishable
 *      before the user has drawn anything.
 *
 * Baked artifact URLs (`project.thumbnailUrl`) are intentionally NOT
 * consulted — they freeze the moment of last render and can't reflect
 * subsequent edits.
 *
 * Consumers: the chooser's "My videos" grid, the resume page's
 * EntityMedia rail, any future "Recent projects" widget — all mount
 * this directly. Never reach for `<img src={project.thumbnailUrl}>`
 * inline; that's how the stale-thumbnail bug class returns.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Sparkles } from "lucide-react";
import { timelineToCanvasState } from "@/lib/studio/editor-v2/timeline-emit";
import type { StudioProject } from "@/lib/services/studio-service";
import SceneThumbnail from "./SceneThumbnail";
import WaveformThumbnail from "./WaveformThumbnail";
import { mediaKindHasAudio, mediaKindHasVideo, type MediaKind } from "@shared/media-kinds";
import { firstLayerPixels, type ImageState } from "@shared/image-state";
import type { GameState } from "@shared/game-state";
import { firstFramePixels, type AnimationState } from "@shared/animation-state";
import type { CadState } from "@shared/cad-state";
import type { DocumentState } from "@/lib/studio/editor-v2/document-state";
import GameStateThumbnail from "@/components/studio/game/GameStateThumbnail";
import DrawingPlaceholderThumbnail from "@/components/studio/drawing/DrawingPlaceholderThumbnail";
import DocumentPlaceholderThumbnail from "@/components/studio/document/DocumentPlaceholderThumbnail";
import CadPlaceholderThumbnail from "@/components/studio/cad/CadPlaceholderThumbnail";
import { cn } from "@/lib/utils";

export interface VideoProjectThumbnailProps {
  project: StudioProject;
  className?: string;
}

interface KindThumbnailArgs {
  project: StudioProject;
  className?: string;
  t: TFunction;
}

/** i18n keys for the tile labels the kind map renders (never literals). */
const KIND_THUMBNAIL_LABEL_KEYS = {
  animation: "studio.projectThumbnail.animationLabel",
} as const satisfies Partial<Record<MediaKind, string>>;

type KindThumbnail = (args: KindThumbnailArgs) => ReactNode;

// CAD projects (#930) render a drafting-grid preview. 2D drawings read off
// `cadState` sheet dims; 3D models show an isometric cube. Also previously
// mis-rendered as an audio waveform.
function cadThumbnail(variant: "2d" | "3d"): KindThumbnail {
  return function CadKindThumbnail({ project, className }) {
    const cadState = (project.cadState as CadState | null | undefined) ?? null;
    return (
      <div className={cn("h-full w-full", className)}>
        <CadPlaceholderThumbnail
          variant={variant}
          widthMm={cadState?.widthMm ?? null}
          heightMm={cadState?.heightMm ?? null}
        />
      </div>
    );
  };
}

/** Kinds that own a dedicated preview shape. Kinds absent here fall through
 *  to the audio-waveform / first-scene / sparkle fallbacks below. */
const KIND_THUMBNAILS: Partial<Record<MediaKind, KindThumbnail>> = {
  // Game projects render a state-driven preview — the start level's
  // background colour + sprite positions, faithfully matching what the
  // user sees inside the editor's `<GameStage>`. Replaces the prior
  // audio-waveform placeholder that visually mismatched the template
  // card the user clicked to create the project.
  game: ({ project, className }) => {
    const gameState = (project.gameState ?? null) as GameState | null;
    return (
      <div className={cn("relative h-full w-full overflow-hidden", className)}>
        <GameStateThumbnail gameState={gameState} />
      </div>
    );
  },

  // Image projects (#932) render the FIRST non-empty layer's
  // pixelsDataUrl as a flat `<img>` preview when the user has drawn
  // something; otherwise fall through to the shared Photoshop-shaped
  // placeholder so a fresh drawing tile reads the same as the template
  // card that created it (DRY anchor with `DRAWING_TEMPLATE_PRESETS`).
  image: ({ project, className }) => {
    const imageState = (project.imageState as ImageState | null | undefined) ?? null;
    const pixels = firstLayerPixels(imageState);
    if (pixels) {
      return (
        <div className={cn("h-full w-full bg-muted", className)}>
          <img
            src={pixels}
            alt=""
            className="h-full w-full object-contain"
            draggable={false}
          />
        </div>
      );
    }
    const width = imageState?.width ?? 1024;
    const height = imageState?.height ?? 1024;
    return (
      <div className={cn("relative h-full w-full", className)}>
        <DrawingPlaceholderThumbnail width={width} height={height} />
      </div>
    );
  },

  // Animation projects (#1003) render the first painted frame as the
  // tile preview — mirrors the image-kind path so the "My videos" grid
  // visually distinguishes an animation row from a video one even
  // before the user has painted on it. Fresh projects with no painted
  // frame yet fall through to the kind-aware gradient placeholder
  // below (the chip on top + the kind badge cue the user to keep
  // drawing).
  animation: ({ project, className, t }) => {
    const animationState = (project.animationState as AnimationState | null | undefined) ?? null;
    const pixels = firstFramePixels(animationState);
    if (pixels) {
      return (
        <div className={cn("h-full w-full bg-muted", className)}>
          <img
            src={pixels}
            alt=""
            className="h-full w-full object-contain"
            draggable={false}
          />
        </div>
      );
    }
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center text-primary-foreground bg-primary",
          className,
        )}
      >
        <div className="text-center text-[10px] font-semibold uppercase tracking-widest opacity-80">
          <Sparkles className="mx-auto mb-1 h-4 w-4" />
          {t(KIND_THUMBNAIL_LABEL_KEYS.animation)}
        </div>
      </div>
    );
  },

  // Document projects (#1912) render a paper-sheet preview keyed off the
  // live DocumentState's section blocks — never the audio waveform the kind
  // used to fall through to (the bug this entry fixes).
  document: ({ project, className }) => {
    const documentState = (project.documentState as DocumentState | null | undefined) ?? null;
    return (
      <div className={cn("h-full w-full", className)}>
        <DocumentPlaceholderThumbnail documentState={documentState} />
      </div>
    );
  },

  cad: cadThumbnail("2d"),
  cad_3d: cadThumbnail("3d"),
};

export default function VideoProjectThumbnail({
  project,
  className,
}: VideoProjectThumbnailProps) {
  const { t } = useTranslation();
  const mediaKind = project.mediaKind ?? "video";

  const renderKind = KIND_THUMBNAILS[mediaKind];
  if (renderKind) return renderKind({ project, className, t });

  // Audio-only kinds (podcast, voice) — the waveform is the right cue ONLY
  // for kinds that produce audio but no visible frames. Static visual kinds
  // (document / cad) are handled by `KIND_THUMBNAILS`; gating on `hasAudio && !hasVideo`
  // (not just `!hasVideo`) keeps them out of this branch.
  if (mediaKindHasAudio(mediaKind) && !mediaKindHasVideo(mediaKind)) {
    return (
      <div className={cn("h-full w-full", className)}>
        <WaveformThumbnail seed={project.id} mediaKind={mediaKind} />
      </div>
    );
  }

  const previewScene = project.timelineSpec
    ? safeFirstScene(project.timelineSpec)
    : null;

  if (previewScene) {
    return (
      <div className={cn("h-full w-full", className)}>
        <SceneThumbnail scene={previewScene} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center text-muted-foreground bg-accent/50",
        className,
      )}
    >
      <Sparkles className="h-8 w-8" />
    </div>
  );
}

function safeFirstScene(spec: unknown) {
  try {
    return timelineToCanvasState(spec).scenes[0] ?? null;
  } catch {
    return null;
  }
}
