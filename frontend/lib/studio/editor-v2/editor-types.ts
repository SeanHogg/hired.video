/**
 * Plain editor types shared by the studio editor's lib hooks and its UI:
 * the Timeline canvas selection, the Actions panel's action ids and the
 * audio-clip timing patch. Kept UI-free so lib/ never imports components/.
 */

/** What the Timeline canvas has selected: a scene, or one of its widgets. */
export type Selection =
  | { kind: "scene"; sceneId: string }
  | { kind: "widget"; sceneId: string; widgetId: string };

/** The Actions panel's sheets (recorder / voiceover / captions / …). */
export type ActionId =
  | "webcam"
  | "screen"
  | "screen-pip"
  | "voiceover"
  | "ai-headshot"
  | "original-music"
  | "captions"
  | "accessibility"
  | "dubbing"
  | "ai-rewrite"
  | "ai-hook";

/** Audio-clip timing patch — what an AudioBar drag emits, mapped to the
 *  `updateAudioLayer` mutator fields by the host. */
export interface AudioPatch {
  startOffsetSec?: number;
  trimStartSec?: number;
  trimEndSec?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
}
