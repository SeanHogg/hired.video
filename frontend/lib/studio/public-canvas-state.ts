/**
 * The CanvasState a public watch surface plays (#721). Every playback path
 * renders V2 state through <CanvasStatePreview/>; this is the one place the
 * public payload becomes that state:
 *
 *   1. `timelineSpec` (the V2 Timeline JSON the editor saved) — authoritative.
 *   2. `legacyScript` — a project saved by the deleted V1 storyboard editor,
 *      converted at read time with the editor's own V1 importer
 *      (`scriptToCanvasState`), so old saved projects still play.
 *
 * Mirrors the editor's load order (use-studio-project-lifecycle): the
 * timeline wins unless it carries no widgets, then the stored script is used.
 */
import { timelineToCanvasState } from "@/lib/studio/editor-v2/timeline-emit";
import { scriptToCanvasState } from "@/lib/studio/editor-v2/script-to-canvas";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import type { VideoScript } from "@/types/video-script";

export interface PublicPlaybackPayload {
  timelineSpec?: unknown;
  legacyScript?: unknown;
}

function hasWidgets(state: CanvasState): boolean {
  return state.scenes.some((s) => s.widgets.length > 0);
}

/** Structural guard for a stored V1 script — the minimum the importer reads. */
export function isStoredVideoScript(value: unknown): value is VideoScript {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as { video?: unknown; scenes?: unknown };
  return (
    !!v.video &&
    typeof v.video === "object" &&
    !Array.isArray(v.video) &&
    Array.isArray(v.scenes) &&
    v.scenes.length > 0 &&
    v.scenes.every((s) => !!s && typeof s === "object" && typeof (s as { id?: unknown }).id === "string")
  );
}

/** CanvasState to play, or null when the payload has nothing playable. */
export function resolvePublicCanvasState(payload: PublicPlaybackPayload): CanvasState | null {
  if (payload.timelineSpec) {
    try {
      const state = timelineToCanvasState(payload.timelineSpec);
      if (hasWidgets(state)) return state;
    } catch (err) {
      console.warn("resolvePublicCanvasState: timelineSpec → CanvasState failed", err);
    }
  }
  if (isStoredVideoScript(payload.legacyScript)) {
    try {
      const state = scriptToCanvasState(payload.legacyScript);
      if (hasWidgets(state)) return state;
    } catch (err) {
      console.warn("resolvePublicCanvasState: legacy script → CanvasState failed", err);
    }
  }
  return null;
}
