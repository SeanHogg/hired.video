/**
 * Thumbnail for a StudioProject — single source of truth for "what
 * thumbnail should I show for this project tile?".
 *
 * Three paths, dispatched by canvas-runtime (#931 / PRD §1.2):
 *   1. **Timeline-runtime kinds with visible frames** (video, animation)
 *      render the first scene of the project's `timelineSpec` via the
 *      shared `<SceneThumbnail/>` (the same v2 widget renderer the
 *      editor canvas uses), so what consumers see ALWAYS matches the
 *      project's current canvas — no stale baked PNG/JPG drift after
 *      an edit.
 *   2. **Audio-only Timeline kinds** (podcast, voice) render the
 *      synthetic-peaks `<WaveformThumbnail/>` so the chooser's "My
 *      videos" grid distinguishes a podcast row from a video one at a
 *      glance (#914).
 *   3. **Non-Timeline canvas runtimes** (game, comic, future image /
 *      cad / animated_film) ALSO render `<WaveformThumbnail/>` today
 *      as a kind-palette placeholder. Each runtime can grow its own
 *      thumbnail (game sprite-grid, comic panel-grid, etc.) — tracked
 *      as part of #931's follow-on; for now the kind-tinted placeholder
 *      is enough for the chooser grid to read correctly.
 *
 * Baked artifact URLs (`project.thumbnailUrl`) are intentionally NOT
 * consulted — they freeze the moment of last render and can't reflect
 * subsequent edits.
 *
 * Consumers: the chooser's "My videos" grid, the resume page's
 * EntityVideos rail, any future "Recent projects" widget — all mount
 * this directly. Never reach for `<img src={project.thumbnailUrl}>`
 * inline; that's how the stale-thumbnail bug class returns.
 */
import { Sparkles } from "lucide-react";
import { timelineToCanvasState } from "@/lib/studio/editor-v2/timeline-emit";
import type { StudioProject } from "@/lib/services/studio-service";
import SceneThumbnail from "./SceneThumbnail";
import WaveformThumbnail from "./WaveformThumbnail";
import { mediaKindUsesTimelineRuntime, mediaKindHasVideo } from "@shared/media-kinds";
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

  // Non-Timeline canvas runtimes (game, comic) don't store their state
  // in `timelineSpec`, so the canvas-thumb path can't render them.
  // Fall through to the kind-palette placeholder — same path audio-only
  // Timeline kinds use. Each runtime grows its own dedicated thumbnail
  // (game sprite-grid, comic panel-grid) as part of #931's follow-on.
  if (!mediaKindUsesTimelineRuntime(mediaKind)) {
    return (
      <div className={cn("h-full w-full", className)}>
        <WaveformThumbnail seed={project.id} mediaKind={mediaKind} />
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
