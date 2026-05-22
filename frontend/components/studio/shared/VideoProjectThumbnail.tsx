/**
 * Thumbnail for a StudioProject — single source of truth for "what
 * thumbnail should I show for this project tile?".
 *
 * Two paths:
 *   1. Video projects (or any project with at least one v-track clip)
 *      render the first scene of the project's `timelineSpec` via the
 *      shared `<SceneThumbnail/>` (the same v2 widget renderer the editor
 *      canvas uses), so what consumers see ALWAYS matches the project's
 *      current canvas — no stale baked PNG/JPG drift after an edit.
 *   2. Audio-only projects (podcast, voice) render `<WaveformThumbnail/>`
 *      so the chooser's "My videos" grid distinguishes a podcast row
 *      from a video one at a glance (#914).
 *
 * Falls back to a neutral gradient placeholder when there's nothing to
 * render (brand-new draft with an empty timeline, or a malformed spec).
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
import { mediaKindHasVideo } from "@shared/media-kinds";
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
  // Audio-only kinds (podcast, voice) render the waveform regardless of
  // whether the project has v-track clips — the kind is the canonical
  // signal. Video + animation try the canvas thumbnail first.
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
