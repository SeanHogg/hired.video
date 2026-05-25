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
import { Sparkles } from "lucide-react";
import { timelineToCanvasState } from "@/lib/studio/editor-v2/timeline-emit";
import type { StudioProject } from "@/lib/services/studio-service";
import SceneThumbnail from "./SceneThumbnail";
import WaveformThumbnail from "./WaveformThumbnail";
import { mediaKindHasVideo } from "@shared/media-kinds";
import { firstLayerPixels, type ImageState } from "@shared/image-state";
import type { GameState } from "@shared/game-state";
import { firstFramePixels, type AnimationState } from "@shared/animation-state";
import GameStateThumbnail from "@/components/studio/game/GameStateThumbnail";
import DrawingPlaceholderThumbnail from "@/components/studio/drawing/DrawingPlaceholderThumbnail";
import { cn } from "@/lib/utils";

export interface VideoProjectThumbnailProps {
  project: StudioProject;
  className?: string;
}

export default function VideoProjectThumbnail({
  project,
  className,
}: VideoProjectThumbnailProps) {
  const mediaKind = project.mediaKind ?? "video";

  // Game projects render a state-driven preview — the start level's
  // background colour + sprite positions, faithfully matching what the
  // user sees inside the editor's `<GameStage>`. Replaces the prior
  // audio-waveform placeholder that visually mismatched the template
  // card the user clicked to create the project.
  if (mediaKind === "game") {
    const gameState = (project.gameState ?? null) as GameState | null;
    return (
      <div className={cn("relative h-full w-full overflow-hidden", className)}>
        <GameStateThumbnail gameState={gameState} />
      </div>
    );
  }

  // Image projects (#932) render the FIRST non-empty layer's
  // pixelsDataUrl as a flat `<img>` preview when the user has drawn
  // something; otherwise fall through to the shared Photoshop-shaped
  // placeholder so a fresh drawing tile reads the same as the template
  // card that created it (DRY anchor with `DRAWING_TEMPLATE_PRESETS`).
  if (mediaKind === "image") {
    const imageState = (project.imageState as ImageState | null | undefined) ?? null;
    const pixels = firstLayerPixels(imageState);
    if (pixels) {
      return (
        <div className={cn("h-full w-full bg-slate-100", className)}>
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
  }

  // Animation projects (#1003) render the first painted frame as the
  // tile preview — mirrors the image-kind path so the "My videos" grid
  // visually distinguishes an animation row from a video one even
  // before the user has painted on it. Fresh projects with no painted
  // frame yet fall through to the kind-aware gradient placeholder
  // below (the chip on top + the kind badge cue the user to keep
  // drawing).
  if (mediaKind === "animation") {
    const animationState = (project.animationState as AnimationState | null | undefined) ?? null;
    const pixels = firstFramePixels(animationState);
    if (pixels) {
      return (
        <div className={cn("h-full w-full bg-slate-100", className)}>
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
          "flex h-full w-full items-center justify-center bg-gradient-to-br from-fuchsia-500/30 to-violet-700/40 text-white",
          className,
        )}
      >
        <div className="text-center text-[10px] font-semibold uppercase tracking-widest opacity-80">
          <Sparkles className="mx-auto mb-1 h-4 w-4" />
          Animation
        </div>
      </div>
    );
  }

  // Audio-only Timeline kinds (podcast, voice) — kind is the canonical
  // signal, regardless of whether the project has v-track clips yet.
  if (!mediaKindHasVideo(mediaKind)) {
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
        "flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-purple/20 to-brand-blue/20 text-muted-foreground",
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
