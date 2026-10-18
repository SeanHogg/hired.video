/** Per-kind capability predicates (audio / video / export / authoring). */

import type { MediaKind } from "./kinds.js";

/** Whether the kind produces audible output. Games are runtime-rendered
 *  and almost always have sound — counted as `true` so the editor
 *  surfaces the audio asset workflow alongside sprite / level work.
 *  Comics carry optional narration / motion-comic voiceover so the same
 *  voiceover dialog the editor already ships works on them. `image` is
 *  a still raster — never audible. */
export function mediaKindHasAudio(kind: MediaKind): boolean {
  return (
    kind === "video" ||
    kind === "podcast" ||
    kind === "voice" ||
    kind === "game" ||
    kind === "comic" ||
    kind === "interactive_comic"
  );
}

/** Whether the kind produces visible frames. Games render visually so
 *  this is `true`; only audio-only kinds (`podcast` without a video
 *  branch, `voice`) return `false`. Comics render visually (pages of
 *  panels) — the rasterized export is a sequence of frames. `image` is
 *  visible but static — a single frame, not a sequence — so it is NOT
 *  in this set; downstream code that gates on `hasVideo` is asking
 *  about time-based visual frames (video-track UI, scrubber, playhead),
 *  none of which apply to a single still raster. */
export function mediaKindHasVideo(kind: MediaKind): boolean {
  return (
    kind === "video" ||
    kind === "animation" ||
    kind === "game" ||
    kind === "comic" ||
    kind === "interactive_comic"
  );
}

/** Whether the kind's render facade emits a Timeline-shaped output
 *  (frames per second + audio track → MP4 / MP3 / GIF / WebM). Closes
 *  the export-pipeline half of the predicate split tracked in #936:
 *  game / comic / image / animation bundle their own export pipelines
 *  (HTML5 ZIP, PDF / CBZ / PNG strip, PNG / JPG / SVG, GIF89a / APNG /
 *  WebP) — they do NOT ride the ffmpeg.wasm / WebCodecs path the
 *  Timeline runtime uses. */
export function mediaKindUsesTimelineExport(kind: MediaKind): boolean {
  return (
    kind !== "game" &&
    kind !== "comic" &&
    kind !== "interactive_comic" &&
    kind !== "image" &&
    kind !== "animation" &&
    kind !== "cad" &&
    kind !== "cad_3d" &&
    // document exports PDF (browser print), not a Timeline-shaped media file.
    kind !== "document"
  );
}

/** Whether the kind authors via the v2 editor's `CanvasState` shape
 *  (scenes + widgets) and therefore needs the v2 editor's Timeline-
 *  shaped chrome: ScenesRail, WidgetPalette, TimelineDock, playback
 *  scrubber + Preview overlay, Properties panel. Closes the authoring-
 *  surface half of the predicate split tracked in #936.
 *
 *  Returns:
 *   - `true`  for video / podcast / voice / comic — comics author via
 *               CanvasState (pages = scenes, panels = widgets) even
 *               though their export pipeline is non-Timeline. This is
 *               the asymmetry that motivated #936.
 *   - `false` for game / image / animation — these kinds mount their
 *               own canvas runtimes (`<GameStage>` / `<DrawingStage>`
 *               / `<AnimationStage>`) which own their own state shape,
 *               inspectors, and toolbars. The Timeline shell is
 *               irrelevant chrome and was confusing users (Scene 1 /
 *               Duration / Widgets palette / Timeline scrubber all
 *               surfaced for a memory-match game).
 *  Future runtimes (cad / 3d_model) → false. */
export function mediaKindUsesCanvasStateAuthoring(kind: MediaKind): boolean {
  return (
    kind !== "game" &&
    kind !== "image" &&
    kind !== "animation" &&
    kind !== "cad" &&
    kind !== "cad_3d" &&
    // document mounts its own <DocumentStage> (paged WYSIWYG), not the
    // Timeline scenes/widgets chrome.
    kind !== "document"
  );
}
