// canvas-state-to-clips.ts — single source of truth for "what does this
// v2 canvas state sound like as a flat AudioClip[]?". Consumed by
// `usePreviewPlayback` (live preview) AND any future surface that needs
// to schedule the project's audio (server-side render workers, the V2-
// native exporter, etc.) — so music + voiceover playback can't drift
// per surface.
//
// V2 stores all audio as `state.audioLayers[]` — a unified list of music,
// voiceover, and sfx layers (multi-track audio rebuild). This module
// projects every layer into the unified `AudioClip` shape that
// `scheduleClipsToDestination` consumes — the same shape V1 uses for
// `audio.clips`. Music-kind layers are auto-ducked under voiceover when
// the mixer is configured for it; voiceover/sfx play at their lane gain.

import {
  audioLaneForKind,
  layerCompositionStart,
  layerPlayableSeconds,
  musicLayers,
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

/** Apply the audio mix's master+lane gains + per-layer gain/mute to a
 *  layer's volume. Mirrors what the render pipeline does so preview
 *  matches export 1:1. Returns 0 (silent) when the lane or layer is
 *  muted. */
function effectiveGain(layer: AudioLayer, mix: CanvasAudioMix): number {
  if (layer.muted) return 0;
  const lane = audioLaneForKind(layer.kind);
  if (lane === "music" && mix.musicMuted) return 0;
  if (lane === "voiceover" && mix.voiceoverMuted) return 0;
  const laneGain = lane === "music" ? mix.musicGain : mix.voiceoverGain;
  return layer.gain * laneGain * mix.masterGain;
}

/** Build the AudioClip(s) for a single music layer. When ducking is off
 *  (or there are no voiceovers) returns one clip; when on, returns one
 *  clip per ducking segment so the shared scheduler hears the correct
 *  gain at every moment. The segment math lives in `audio-ducking.ts` —
 *  the same one `timeline-emit.ts` uses (DRY). */
function musicLayerClips(
  layer: AudioLayer,
  index: number,
  totalSec: number,
  mix: CanvasAudioMix,
  voiceoverIntervals: DuckingInterval[],
  start: number,
): AudioClip[] {
  const track = resolveLayerTrack(layer.source);
  if (!track) return [];
  const baseGain = effectiveGain(layer, mix);
  if (baseGain === 0) return [];
  const audibleStart = Math.max(0, start);
  if (audibleStart >= totalSec) return [];
  const spanLen = Math.min(
    layerPlayableSeconds(layer),
    totalSec - audibleStart,
  );
  if (spanLen <= 0.05) return [];
  // Ducking segments are computed in layer-local time (shift the
  // voiceover intervals back by the layer's audible start) then mapped
  // back to composition time. Music continues uninterrupted under the
  // duck: each segment seeks into the source at its own elapsed offset.
  const segments = computeDuckingSegments(
    spanLen,
    voiceoverIntervals.map((iv) => ({
      startSec: iv.startSec - audibleStart,
      endSec: iv.endSec - audibleStart,
    })),
    {
      enabled: Boolean(mix.duckMusicUnderVoiceover),
      duckAmount: mix.duckAmount,
    },
  );
  return segments.map((seg, i) => ({
    id: segments.length === 1 ? `v2-music-${index}` : `v2-music-${index}-${i}`,
    track,
    label: layer.label,
    startSec: seg.startSec + audibleStart,
    endSec: seg.endSec + audibleStart,
    volume: baseGain * seg.gainMultiplier,
    // Seek into the source so trims + mid-duck continuation play the
    // right slice. seg.startSec is elapsed within the layer.
    trimStartSec: layer.trimStartSec + seg.startSec,
    ...(i === 0 && layer.fadeInSec > 0 ? { fadeInSec: layer.fadeInSec } : {}),
    ...(i === segments.length - 1 && layer.fadeOutSec > 0
      ? { fadeOutSec: layer.fadeOutSec }
      : {}),
  }));
}

/** Build the AudioClip for a voiceover OR sfx layer — a single clip
 *  with no ducking (these are foreground audio). */
function foregroundLayerClip(
  layer: AudioLayer,
  mix: CanvasAudioMix,
  start: number,
): AudioClip | null {
  const track = resolveLayerTrack(layer.source);
  if (!track) return null;
  const volume = effectiveGain(layer, mix);
  if (volume === 0) return null;
  const playableSec = layerPlayableSeconds(layer);
  return {
    id: layer.id,
    track,
    label: layer.label,
    startSec: start,
    endSec: start + playableSec,
    volume,
    fadeInSec: layer.fadeInSec,
    fadeOutSec: layer.fadeOutSec,
    trimStartSec: layer.trimStartSec,
  };
}

/** Convert v2 CanvasState into the flat AudioClip[] the shared
 *  `useMusicScheduler` / `scheduleClipsToDestination` consume. Includes
 *  every music layer (auto-ducked under voiceover when the mixer is
 *  configured for it), every voiceover, and every sfx layer, with the
 *  audioMix gains applied. */
export function canvasStateToAudioClips(state: CanvasState): AudioClip[] {
  const totalSec = totalDurationSeconds(state);
  if (totalSec <= 0) return [];
  const mix = state.audioMix ?? DEFAULT_AUDIO_MIX;
  const out: AudioClip[] = [];

  // Foreground (voiceover + sfx) first so their windows feed ducking.
  const foreground: AudioClip[] = [];
  const duckingIntervals: DuckingInterval[] = [];
  for (const layer of state.audioLayers) {
    if (layer.kind === "music") continue;
    const start = layerCompositionStart(state, layer);
    const clip = foregroundLayerClip(layer, mix, start);
    if (!clip) continue;
    foreground.push(clip);
    // Only voiceover windows duck the music — sfx don't.
    if (layer.kind === "voiceover") {
      duckingIntervals.push({ startSec: clip.startSec, endSec: clip.endSec });
    }
  }

  let musicIndex = 0;
  for (const layer of musicLayers(state)) {
    const start = layerCompositionStart(state, layer);
    out.push(
      ...musicLayerClips(layer, musicIndex, totalSec, mix, duckingIntervals, start),
    );
    musicIndex += 1;
  }
  out.push(...foreground);
  return out;
}
