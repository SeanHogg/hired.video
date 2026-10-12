/**
 * Public watch-payload state (#721). `GET /api/studio/public/:videoId` serves
 * the V2 Timeline JSON (`timelineSpec`) as the authoritative playback state.
 * A project saved by the deleted V1 storyboard editor has no timeline; its
 * scenes still live in the `storyboard` JSONB. For those rows (only) the
 * payload carries `legacyScript`, which the client converts to the same
 * CanvasState at read time (`resolvePublicCanvasState` in
 * frontend/lib/studio/public-canvas-state.ts), so old projects keep playing
 * through `<CanvasStatePreview/>`.
 *
 * The conversion runs client-side on purpose: the converter is the editor's
 * own V1 → V2 importer, and running it inside the Worker would spend the
 * 10 ms CPU budget on every public view.
 *
 * Pure and cheap — one object walk — so it is safe on the hot path.
 */
import { storyboardScriptKeys } from "./storyboard-meta.js";

/** The storyboard JSONB as a V1 VideoScript fit for the public payload, or
 *  null when the row is not a V1 script (a V2 project's storyboard holds only
 *  save-draft meta). Save-draft meta keys (`_name`, `_prompt`,
 *  `_jobDescription`, `_rev`, `_meta`, …) are stripped: the owner's prompt
 *  and target job description must never reach an anonymous viewer. */
export function legacyScriptForPublic(storyboard: unknown): Record<string, unknown> | null {
  if (!storyboard || typeof storyboard !== "object" || Array.isArray(storyboard)) return null;
  const sb = storyboard as Record<string, unknown>;
  const video = sb.video;
  const scenes = sb.scenes;
  if (!video || typeof video !== "object" || Array.isArray(video)) return null;
  if (!Array.isArray(scenes) || scenes.length === 0) return null;
  return storyboardScriptKeys(sb);
}
