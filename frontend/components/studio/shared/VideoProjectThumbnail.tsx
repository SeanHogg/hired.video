/**
 * Thumbnail for a StudioProject — single source of truth for "what
 * image / scene-render should I show for this project tile?".
 *
 * Preview cascade (single decision tree — no caller re-derives this):
 *   1. `thumbnailUrl` on the project → render as <img> (rendered video
 *      thumbnails take priority over computed scene previews).
 *   2. v2 project (`kind === 'nle'`) with a parseable `timelineSpec`
 *      → render the first scene via the shared SceneThumbnail.
 *   3. Otherwise (v1 scene-kind drafts, or anything we can't parse)
 *      → render the neutral gradient + sparkle placeholder so the
 *      tile still looks intentional.
 *
 * The chooser's "My videos" grid + any future "Recent projects"
 * widget should mount this directly.
 */
import { Sparkles } from "lucide-react";
import { timelineToCanvasState } from "@/lib/studio/editor-v2/timeline-emit";
import type { StudioProject } from "@/lib/services/studio-service";
import SceneThumbnail from "./SceneThumbnail";
import { cn } from "@/lib/utils";

export interface VideoProjectThumbnailProps {
  project: StudioProject;
  className?: string;
}

export default function VideoProjectThumbnail({
  project,
  className,
}: VideoProjectThumbnailProps) {
  // (1) explicit rendered-video thumbnail wins.
  if (project.thumbnailUrl) {
    return (
      <img
        src={project.thumbnailUrl}
        alt={project.title}
        className={cn("h-full w-full object-cover", className)}
        draggable={false}
      />
    );
  }

  // (2) v2 project with timelineSpec → render the first scene.
  const previewScene =
    project.kind === "nle" && project.timelineSpec
      ? timelineToCanvasState(project.timelineSpec).scenes[0] ?? null
      : null;
  if (previewScene) {
    return (
      <div className={cn("h-full w-full", className)}>
        <SceneThumbnail scene={previewScene} />
      </div>
    );
  }

  // (3) neutral placeholder.
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
