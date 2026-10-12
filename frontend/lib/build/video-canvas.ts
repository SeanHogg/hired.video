/**
 * Outline → v2 CanvasState — the ONE canvas behind the kit video.
 *
 * `outlineToVideoScript` → `scriptToCanvasState` yields the canvas that the
 * the kit workspace player plays (the studio's own renderer), the Advanced editor edits
 * (its timeline, palette and properties panel), and the Post dock renders and
 * posts. There is no studio hand-off: what the visitor watches here IS what
 * they edit and what gets posted. The scene overrides the v1 script has no
 * slot for (filters, director's notes, export size and codec) are laid on
 * the canvas last (scene-overrides.ts).
 */
import { scriptToCanvasState } from "@/lib/studio/editor-v2/script-to-canvas";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { outlineToVideoScript } from "./video-composition";
import type { Translate } from "./video-copy";
import type { VideoOutline } from "./video-outline";
import { canvasSceneId } from "./scene-voiceover";
import { withSceneCanvas } from "./scene-overrides";

export function outlineToCanvasState(outline: VideoOutline, t: Translate): CanvasState {
  const overrides = new Map(outline.scenes.map((s) => [canvasSceneId(s.id), s.overrides] as const));
  return withSceneCanvas(scriptToCanvasState(outlineToVideoScript(outline, t)), overrides, outline.export);
}
