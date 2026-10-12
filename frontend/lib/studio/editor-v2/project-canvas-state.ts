/**
 * The canvas a saved Studio project opens to — the ONE mapping the editor's
 * load path (use-studio-project-lifecycle) and the Distribution Hub's
 * fitted cuts (#2045 / #2047) share, so a cut rendered outside the editor
 * comes from exactly the canvas the editor would show.
 *
 * Two saved shapes: (a) v2 projects with a `timelineSpec` of canvas-v2:*
 * clips, and (b) v1 projects with a `script` (kind='scene' storyboard) and
 * no v2 timeline — the round-trip of a non-v2 timeline yields an empty
 * canvas, so (b) hydrates from the script instead.
 */
import type { VideoScript } from "@/types/video-script";
import type { CanvasState } from "./canvas-state";
import { timelineToCanvasState } from "./timeline-emit";
import { scriptToCanvasState } from "./script-to-canvas";

export interface SavedCanvasSource {
  timelineSpec?: unknown;
  script?: VideoScript | null;
}

/** The canvas to load, or null when the project has neither shape. */
export function projectCanvasState(project: SavedCanvasSource): CanvasState | null {
  const fromTimeline = project.timelineSpec ? timelineToCanvasState(project.timelineSpec) : null;
  const timelineHasContent = fromTimeline?.scenes.some((s) => s.widgets.length > 0) ?? false;
  if (timelineHasContent) return fromTimeline;
  return project.script ? scriptToCanvasState(project.script) : fromTimeline;
}

/** True when the canvas has something to render. */
export function hasRenderableCanvas(state: CanvasState | null): state is CanvasState {
  return !!state && state.scenes.some((s) => s.widgets.length > 0);
}
