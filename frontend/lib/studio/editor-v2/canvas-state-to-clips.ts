// canvas-state-to-clips.ts — single source of truth for "what does this
// v2 canvas state sound like?".
//
// `buildCanvasAudioSegments` is the ONE lane builder (#476 / #742): it turns
// `state.audioLayers[]` + `state.audioMix` into timed, gained, faded
// segments. Both audio surfaces project from it, so they can't drift:
//
//   - live preview  `canvasStateToAudioClips` → the flat AudioClip[] that
//                   `useMusicScheduler` / `clip-scheduler.ts` play
//   - export        `canvasStateToTimeline` (timeline-emit.ts) → the a1/a2
//                   Timeline clips the offline audio mixer renders
//
// Music layers are auto-ducked under (audible) voiceovers when the mixer is
// configured for it; voiceover/sfx play at their lane gain. Gains compose
// layer × lane × master; muted layers / lanes are dropped.

import {
  audioLaneForKind,
  layerCompositionStart,
  layerPlayableSeconds,
  totalDurationSeconds,
} from "@/lib/studio/editor-v2/canvas-state";
import type {
  AudioLayer,
  CanvasAudioMix,
  CanvasState,
} from "@/lib/studio/editor-v2/canvas-state";
import { DEFAULT_AUDIO_MIX } from "@/lib/studio/editor-v2/canvas-state";
import {
  computeDuckingSegments,
  type DuckingInterval,
} from "@/lib/studio/editor-v2/audio-ducking";
import { resolveLayerTrack } from "@/lib/studio/music-catalog";
import type { AudioClip } from "@/types/video-script";

/** One playable slice of an audio layer, in composition time. A music layer
 *  ducked under voiceover yields several (one per duck segment); every other
 *  layer yields one. */
export interface CanvasAudioSegment {
  layer: AudioLayer;
  lane: "music" | "voiceover";
  /** Scheduler track for the live preview — a URL, or a stock preset id. */
  track: string;
  /** This segment's index within its layer, and the layer's segment count. */
  segmentIndex: number;
  segmentCount: number;
  /** Order of the layer among the music layers (music only, else -1). */
  musicIndex: number;
  startSec: number;
  endSec: number;
  /** Seconds INTO the source file this segment starts playing. */
  sourceInSec: number;
  /** Effective gain (layer × lane × master × duck multiplier). */
  gain: number;
  fadeInSec: number;
  fadeOutSec: number;
}

/** Apply the audio mix's master+lane gains + per-layer gain/mute to a
 *  layer's volume. Returns 0 (silent) when the lane or layer is muted. */
function effectiveGain(layer: AudioLayer, mix: CanvasAudioMix): number {
  if (layer.muted) return 0;
  const lane = audioLaneForKind(layer.kind);
  if (lane === "music" && mix.musicMuted) return 0;
  if (lane === "voiceover" && mix.voiceoverMuted) return 0;
  const laneGain = lane === "music" ? mix.musicGain : mix.voiceoverGain;
  return layer.gain * laneGain * mix.masterGain;
}

interface LayerSpan {
  track: string;
  gain: number;
  startSec: number;
  playableSec: number;
  sourceInSec: number;
}

/** A layer's audible window inside `0..totalSec`, or null when it is silent,
 *  unplayable (pending-synthesis voiceover / unknown stock id) or entirely
 *  outside the composition. A negative composition start cuts the head. */
function layerSpan(
  state: CanvasState,
  layer: AudioLayer,
  mix: CanvasAudioMix,
  totalSec: number,
): LayerSpan | null {
  const track = resolveLayerTrack(layer.source);
  if (!track) return null;
  const gain = effectiveGain(layer, mix);
  if (gain <= 0) return null;
  const rawStart = layerCompositionStart(state, layer);
  const headCut = Math.max(0, -rawStart);
  const startSec = Math.max(0, rawStart);
  if (startSec >= totalSec) return null;
  const playableSec = Math.min(layerPlayableSeconds(layer) - headCut, totalSec - startSec);
  if (playableSec <= 0) return null;
  return { track, gain, startSec, playableSec, sourceInSec: layer.trimStartSec + headCut };
}

/**
 * The ONE lane builder. `totalSec` defaults to the composition length; the
 * Timeline emitter passes its frame-rounded length so segments never run
 * past the last frame.
 */
export function buildCanvasAudioSegments(
  state: CanvasState,
  totalSec: number = totalDurationSeconds(state),
): CanvasAudioSegment[] {
  if (totalSec <= 0) return [];
  const mix = state.audioMix ?? DEFAULT_AUDIO_MIX;
  const foreground: CanvasAudioSegment[] = [];
  const music: CanvasAudioSegment[] = [];

  // Foreground (voiceover + sfx) first so audible voiceover windows feed
  // the music ducking.
  const duckingIntervals: DuckingInterval[] = [];
  for (const layer of state.audioLayers) {
    if (layer.kind === "music") continue;
    const span = layerSpan(state, layer, mix, totalSec);
    if (!span) continue;
    const segment: CanvasAudioSegment = {
      layer,
      lane: audioLaneForKind(layer.kind),
      track: span.track,
      segmentIndex: 0,
      segmentCount: 1,
      musicIndex: -1,
      startSec: span.startSec,
      endSec: span.startSec + span.playableSec,
      sourceInSec: span.sourceInSec,
      gain: span.gain,
      fadeInSec: layer.fadeInSec,
      fadeOutSec: layer.fadeOutSec,
    };
    foreground.push(segment);
    // Only voiceover windows duck the music — sfx don't.
    if (layer.kind === "voiceover") {
      duckingIntervals.push({ startSec: segment.startSec, endSec: segment.endSec });
    }
  }

  let musicIndex = 0;
  for (const layer of state.audioLayers) {
    if (layer.kind !== "music") continue;
    const index = musicIndex;
    musicIndex += 1;
    const span = layerSpan(state, layer, mix, totalSec);
    if (!span) continue;
    // Ducking segments are computed in layer-local time (voiceover windows
    // shifted back by the layer's start) then mapped back to composition
    // time. Music continues uninterrupted under the duck: each segment
    // seeks into the source at its own elapsed offset.
    const segments = computeDuckingSegments(
      span.playableSec,
      duckingIntervals.map((iv) => ({
        startSec: iv.startSec - span.startSec,
        endSec: iv.endSec - span.startSec,
      })),
      {
        enabled: Boolean(mix.duckMusicUnderVoiceover),
        duckAmount: mix.duckAmount,
      },
    );
    segments.forEach((seg, i) => {
      music.push({
        layer,
        lane: "music",
        track: span.track,
        segmentIndex: i,
        segmentCount: segments.length,
        musicIndex: index,
        startSec: span.startSec + seg.startSec,
        endSec: span.startSec + seg.endSec,
        sourceInSec: span.sourceInSec + seg.startSec,
        gain: span.gain * seg.gainMultiplier,
        // The layer's fades ride its first / last segment.
        fadeInSec: i === 0 ? layer.fadeInSec : 0,
        fadeOutSec: i === segments.length - 1 ? layer.fadeOutSec : 0,
      });
    });
  }
  return [...music, ...foreground];
}

/** Live-preview projection: the flat AudioClip[] the shared
 *  `useMusicScheduler` / `prepareClipSchedule` consume. */
export function canvasStateToAudioClips(state: CanvasState): AudioClip[] {
  return buildCanvasAudioSegments(state).map((seg) => ({
    id:
      seg.layer.kind === "music"
        ? seg.segmentCount === 1
          ? `v2-music-${seg.musicIndex}`
          : `v2-music-${seg.musicIndex}-${seg.segmentIndex}`
        : seg.layer.id,
    track: seg.track,
    label: seg.layer.label,
    startSec: seg.startSec,
    endSec: seg.endSec,
    volume: seg.gain,
    trimStartSec: seg.sourceInSec,
    ...(seg.fadeInSec > 0 ? { fadeInSec: seg.fadeInSec } : {}),
    ...(seg.fadeOutSec > 0 ? { fadeOutSec: seg.fadeOutSec } : {}),
  }));
}
