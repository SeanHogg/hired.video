/**
 * Audio-layer model helpers + mutators. Part of the canvas-state model;
 * re-exported by `../canvas-state`.
 */

import type { AudioLayer, AudioLayerKind, AudioLayerPatch, AudioLayerSource } from "./audio-types";
import type { CanvasState } from "./scene-types";
import { makeId } from "./ids";

// ─── Audio-layer model helpers ─────────────────────────────────────────────
// Single source of truth for constructing, classifying, and migrating
// audio layers. Every surface that adds music / voiceover / sfx, reads a
// layer's mixer lane, or loads a legacy draft routes through these so the
// shape can't drift.

/** Which mixer lane a layer's gain/mute is governed by. Music + sfx ride
 *  the music lane; voiceover its own. Ducking targets `music`-kind layers
 *  only (see the audio math) — sfx plays through the music lane gain but
 *  is not ducked under voiceover. */
export function audioLaneForKind(kind: AudioLayerKind): "music" | "voiceover" {
  return kind === "voiceover" ? "voiceover" : "music";
}

/** Build an audio layer, filling every timing field with its default so
 *  consumers never read `undefined`. Pass only what differs. */
export function makeAudioLayer(
  input: {
    kind: AudioLayerKind;
    source: AudioLayerSource;
    label: string;
    durationSeconds: number;
  } & Partial<Omit<AudioLayer, "kind" | "source" | "label" | "durationSeconds">>,
): AudioLayer {
  return {
    id: input.id ?? makeId("audio"),
    kind: input.kind,
    source: input.source,
    label: input.label,
    durationSeconds: input.durationSeconds,
    anchorSceneId: input.anchorSceneId ?? null,
    startOffsetSec: input.startOffsetSec ?? 0,
    trimStartSec: input.trimStartSec ?? 0,
    trimEndSec: input.trimEndSec ?? 0,
    fadeInSec: input.fadeInSec ?? 0,
    fadeOutSec: input.fadeOutSec ?? 0,
    gain: input.gain ?? 1,
    muted: input.muted ?? false,
    ...(input.text ? { text: input.text } : {}),
  };
}

/** Music layers in composition order (drag-add appends, so array order =
 *  stacking order top→bottom in the timeline). */
export function musicLayers(state: CanvasState): AudioLayer[] {
  return state.audioLayers.filter((l) => l.kind === "music");
}

/** Voiceover layers — narration recorded or TTS-synthesised. */
export function voiceoverLayers(state: CanvasState): AudioLayer[] {
  return state.audioLayers.filter((l) => l.kind === "voiceover");
}

/** Effective playable length of a layer after both-end trims, floored to
 *  50ms so a fully-trimmed clip can't crash interval math. */
export function layerPlayableSeconds(layer: AudioLayer): number {
  return Math.max(
    0.05,
    layer.durationSeconds - layer.trimStartSec - layer.trimEndSec,
  );
}

/** Deep-clone an audio layer with a fresh id, re-anchored to `anchorSceneId`.
 *  Used when scenes are cloned into another composition (project merge) so
 *  the layer follows its scene's new id. */
export function cloneAudioLayerWithNewId(
  layer: AudioLayer,
  anchorSceneId: string | null,
): AudioLayer {
  return { ...structuredClone(layer), id: makeId("audio"), anchorSceneId };
}

// ─── Audio-layer mutators ──────────────────────────────────────────────────
//
// Single seam for the multi-track audio timeline's edits. The AudioBar
// component fires `onChange` per drag tick with the next timing snapshot;
// the host translates that into `updateAudioLayer`. Add / remove / split
// power the drag-music-in, delete, and split-at-playhead ops. All are
// STRUCTURAL-SHARE pure functions matching the rest of the canvas-state
// mutators — undo/redo participates via the same `useCanvasHistory` wrapper.

/** Patch an audio layer's editable fields. `undefined` keeps the current
 *  value; `0` writes it. Unknown ids are no-ops. */
export function updateAudioLayer(
  state: CanvasState,
  layerId: string,
  patch: AudioLayerPatch,
): CanvasState {
  return {
    ...state,
    audioLayers: state.audioLayers.map((l) =>
      l.id === layerId ? { ...l, ...patch } : l,
    ),
  };
}

/** Append an audio layer (drag-in, picker, recorder, composer). */
export function addAudioLayer(state: CanvasState, layer: AudioLayer): CanvasState {
  return { ...state, audioLayers: [...state.audioLayers, layer] };
}

/** Remove an audio layer by id. */
export function removeAudioLayer(state: CanvasState, layerId: string): CanvasState {
  return {
    ...state,
    audioLayers: state.audioLayers.filter((l) => l.id !== layerId),
  };
}

/** Composition-time start (seconds) of a layer = its anchor scene's
 *  start (or 0) plus its manual offset. Shared so the timeline, the
 *  scheduler, and the splitter agree on where a layer begins. */
export function layerCompositionStart(
  state: CanvasState,
  layer: AudioLayer,
): number {
  let anchorStart = 0;
  if (layer.anchorSceneId) {
    let cursor = 0;
    for (const scene of state.scenes) {
      if (scene.id === layer.anchorSceneId) {
        anchorStart = cursor;
        break;
      }
      cursor += scene.durationSeconds;
    }
  }
  return anchorStart + layer.startOffsetSec;
}

/** Split a layer into two at the given composition-time second. The head
 *  keeps the start + fade-in and ends at the cut (via added trim-end);
 *  the tail is a new layer that starts at the cut (offset + trim-start
 *  advanced) and keeps the fade-out. No-op when the cut falls outside the
 *  layer's playable span. Returns the (possibly unchanged) state plus the
 *  new tail layer's id so the host can re-select it. */
export function splitAudioLayer(
  state: CanvasState,
  layerId: string,
  atCompositionSec: number,
): { state: CanvasState; newLayerId: string | null } {
  const layer = state.audioLayers.find((l) => l.id === layerId);
  if (!layer) return { state, newLayerId: null };
  const start = layerCompositionStart(state, layer);
  const playable = layerPlayableSeconds(layer);
  const local = atCompositionSec - start;
  // Need at least 50ms on each side of the cut.
  if (local <= 0.05 || local >= playable - 0.05) return { state, newLayerId: null };

  const head: AudioLayer = {
    ...layer,
    // End the head at the cut by trimming its tail.
    trimEndSec: layer.durationSeconds - layer.trimStartSec - local,
    // Head can't carry a fade-out (its tail is now the cut, not the
    // original end); the tail owns the fade-out.
    fadeOutSec: 0,
  };
  const tailId = makeId("audio");
  const tail: AudioLayer = {
    ...layer,
    id: tailId,
    // Tail starts where the head ended.
    startOffsetSec: layer.startOffsetSec + local,
    trimStartSec: layer.trimStartSec + local,
    // Tail owns the fade-out; the fade-in belonged to the head.
    fadeInSec: 0,
  };
  const audioLayers = state.audioLayers.flatMap((l) =>
    l.id === layerId ? [head, tail] : [l],
  );
  return { state: { ...state, audioLayers }, newLayerId: tailId };
}
