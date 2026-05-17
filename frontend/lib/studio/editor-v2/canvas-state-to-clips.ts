// canvas-state-to-clips.ts — single source of truth for "what does this
// v2 canvas state sound like as a flat AudioClip[]?". Consumed by
// `usePreviewPlayback` (live preview) AND any future surface that needs
// to schedule the project's audio (server-side render workers, the V2-
// native exporter, etc.) — so music + voiceover playback can't drift
// per surface.
//
// V2 stores music as `state.musicSource` (a single track that plays
// from t=0 looping over the composition) and voiceovers as
// `state.voiceovers[]` (each anchored to a scene start). This module
// translates both into the unified `AudioClip` shape that
// `scheduleClipsToDestination` consumes — the same shape V1 uses for
// `audio.clips`.

import { totalDurationSeconds } from "@/lib/studio/editor-v2/canvas-state";
import type {
  CanvasAudioMix,
  CanvasState,
  Scene,
  VoiceoverClip,
} from "@/lib/studio/editor-v2/canvas-state";
import { DEFAULT_AUDIO_MIX } from "@/lib/studio/editor-v2/canvas-state";
import { findMusicTrack } from "@/lib/studio/music-catalog";
import type { AudioClip } from "@/types/video-script";

/** Start time of a scene within the composition. Returns 0 when the
 *  scene id can't be found (the voiceover then anchors to t=0). */
function sceneStart(scenes: Scene[], anchorSceneId: string | null): number {
  if (!anchorSceneId) return 0;
  let cursor = 0;
  for (const scene of scenes) {
    if (scene.id === anchorSceneId) return cursor;
    cursor += scene.durationSeconds;
  }
  return 0;
}

/** Apply the audio mix's master+lane gains + per-clip mute to a clip's
 *  volume. Mirrors what the render pipeline does so preview matches
 *  export 1:1. */
function effectiveGain(
  baseVolume: number | undefined,
  lane: "music" | "voiceover",
  mix: CanvasAudioMix,
): number {
  if (lane === "music" && mix.musicMuted) return 0;
  if (lane === "voiceover" && mix.voiceoverMuted) return 0;
  const laneGain = lane === "music" ? mix.musicGain : mix.voiceoverGain;
  return (baseVolume ?? 1) * laneGain * mix.masterGain;
}

/** Build the music clip — single looping bed across the whole comp.
 *  Returns null when the project has no music selected. */
function musicClipFor(state: CanvasState, totalSec: number, mix: CanvasAudioMix): AudioClip | null {
  if (!state.musicSource) return null;
  if (totalSec <= 0) return null;
  // Stock tracks ride on their procedural preset key (the scheduler's
  // `isUrlTrack` check routes them to AmbientPlayer). Custom tracks
  // ride on their hosted URL. The scheduler picks the right driver.
  let track: string;
  let label = "Music";
  if (state.musicSource.kind === "stock") {
    const catalog = findMusicTrack(state.musicSource.trackId);
    if (!catalog || catalog.id === "none") return null;
    // Prefer the static file URL when the catalog entry has one;
    // otherwise let the scheduler resolve the preset id.
    track = catalog.src || catalog.id;
    label = catalog.label;
  } else {
    if (!state.musicSource.url) return null;
    track = state.musicSource.url;
    label = state.musicSource.label;
  }
  return {
    id: "v2-music",
    track,
    label,
    startSec: 0,
    endSec: totalSec,
    volume: effectiveGain(1, "music", mix),
  };
}

function voiceoverClipFor(
  vo: VoiceoverClip,
  scenes: Scene[],
  mix: CanvasAudioMix,
): AudioClip | null {
  if (!vo.url) return null;
  if (vo.muted) return null;
  const start = sceneStart(scenes, vo.anchorSceneId);
  return {
    id: vo.id,
    track: vo.url,
    label: vo.label,
    startSec: start,
    endSec: start + vo.durationSeconds,
    volume: effectiveGain(vo.gain, "voiceover", mix),
  };
}

/** Convert v2 CanvasState into the flat AudioClip[] the shared
 *  `useMusicScheduler` / `scheduleClipsToDestination` consume. Includes
 *  music (looped bed) + every non-muted voiceover, with audioMix gains
 *  applied. */
export function canvasStateToAudioClips(state: CanvasState): AudioClip[] {
  const totalSec = totalDurationSeconds(state);
  const mix = state.audioMix ?? DEFAULT_AUDIO_MIX;
  const out: AudioClip[] = [];
  const music = musicClipFor(state, totalSec, mix);
  if (music) out.push(music);
  for (const vo of state.voiceovers) {
    const clip = voiceoverClipFor(vo, state.scenes, mix);
    if (clip) out.push(clip);
  }
  return out;
}
