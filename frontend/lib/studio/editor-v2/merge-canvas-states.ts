/**
 * Merge several CanvasStates into one composition — the pure core of the
 * /studio "Merge" bulk action. Sources are concatenated in the given order:
 *
 *  - scenes are deep-cloned with fresh ids (so the merged project never
 *    shares widget/scene ids with its sources);
 *  - audio layers keep their timing by re-anchoring to the cloned scene —
 *    a layer anchored to composition 0 in its source is anchored to that
 *    source's first scene, so it still starts where that source starts;
 *  - caption cues are shifted by the source's start offset.
 *
 * Global settings (frame size, fps, theme, motion, mix, palette) come from
 * the FIRST source — the merged video takes the lead project's look.
 */
import {
  cloneAudioLayerWithNewId,
  cloneSceneWithNewIds,
  totalDurationSeconds,
  type AudioLayer,
  type CanvasCaptionCue,
  type CanvasState,
  type Scene,
} from "./canvas-state";

export function mergeCanvasStates(states: readonly CanvasState[]): CanvasState {
  if (states.length === 0) throw new Error("mergeCanvasStates needs at least one state");
  const [lead] = states;

  const scenes: Scene[] = [];
  const audioLayers: AudioLayer[] = [];
  const cues: CanvasCaptionCue[] = [];
  let offsetSec = 0;

  for (const state of states) {
    const idMap = new Map<string, string>();
    const cloned = state.scenes.map((scene) => {
      const copy = cloneSceneWithNewIds(scene);
      idMap.set(scene.id, copy.id);
      return copy;
    });
    scenes.push(...cloned);

    const firstSceneId = cloned[0]?.id ?? null;
    for (const layer of state.audioLayers) {
      const anchor = layer.anchorSceneId ? idMap.get(layer.anchorSceneId) : undefined;
      audioLayers.push(cloneAudioLayerWithNewId(layer, anchor ?? firstSceneId));
    }

    for (const cue of state.captions?.cues ?? []) {
      cues.push({ ...cue, start: cue.start + offsetSec, end: cue.end + offsetSec });
    }
    offsetSec += totalDurationSeconds(state);
  }

  const captionSource = states.find((s) => s.captions !== null)?.captions ?? null;
  return {
    ...structuredClone(lead),
    scenes,
    audioLayers,
    captions: captionSource
      ? {
          style: captionSource.style,
          enabled: states.some((s) => s.captions?.enabled === true),
          cues,
        }
      : null,
  };
}
