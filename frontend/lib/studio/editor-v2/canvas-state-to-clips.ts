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
import {
  computeDuckingSegments,
  type DuckingInterval,
} from "@/lib/studio/editor-v2/audio-ducking";
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

/** Resolve `state.musicSource` to the `{track, label}` the scheduler
 *  consumes. Returns null when no track is selected or the catalog
 *  rejects the id. Shared by both single-clip and split-for-ducking
 *  code paths so they can't disagree about what's playing. */
function resolvedMusic(state: CanvasState): { track: string; label: string } | null {
  if (!state.musicSource) return null;
  if (state.musicSource.kind === "stock") {
    const catalog = findMusicTrack(state.musicSource.trackId);
    if (!catalog || catalog.id === "none") return null;
    return { track: catalog.src || catalog.id, label: catalog.label };
  }
  if (!state.musicSource.url) return null;
  return { track: state.musicSource.url, label: state.musicSource.label };
}

/** Build music clip(s) for the timeline. When ducking is off (or there
 *  are no voiceovers) returns one full-span clip; when on, returns one
 *  clip per ducking segment so the shared scheduler hears the correct
 *  gain at every moment. Per DRY: the segment math lives in
 *  `audio-ducking.ts` and is the same one `timeline-emit.ts` uses. */
function musicClipsFor(
  state: CanvasState,
  totalSec: number,
  mix: CanvasAudioMix,
  voiceoverIntervals: DuckingInterval[],
): AudioClip[] {
  if (totalSec <= 0) return [];
  const resolved = resolvedMusic(state);
  if (!resolved) return [];
  const baseGain = effectiveGain(1, "music", mix);
  if (baseGain === 0) return [];
  // Per-source timing controls (#1115 audio-timeline UI). Music can be
  // offset later in the composition + faded in / out at the edges.
  // Read directly off the (possibly absent) controls — defaults are 0.
  const offset = state.musicSource?.startOffsetSec ?? 0;
  const fadeIn = state.musicSource?.fadeInSec ?? 0;
  const fadeOut = state.musicSource?.fadeOutSec ?? 0;
  // The shared `computeDuckingSegments` carves the music timeline by
  // voiceover intervals; we slice from the offset onward so the music
  // doesn't play before its start point. Pre-offset silence is just an
  // absent clip; the scheduler treats gaps as silence by default.
  const audibleStart = Math.max(0, offset);
  if (audibleStart >= totalSec) return [];
  const segments = computeDuckingSegments(totalSec - audibleStart, voiceoverIntervals.map((iv) => ({
    startSec: Math.max(0, iv.startSec - audibleStart),
    endSec: Math.max(0, iv.endSec - audibleStart),
  })), {
    enabled: Boolean(mix.duckMusicUnderVoiceover),
    duckAmount: mix.duckAmount,
  });
  return segments.map((seg, i) => ({
    id: segments.length === 1 ? "v2-music" : `v2-music-${i}`,
    track: resolved.track,
    label: resolved.label,
    startSec: seg.startSec + audibleStart,
    endSec: seg.endSec + audibleStart,
    volume: baseGain * seg.gainMultiplier,
    // Only the FIRST segment carries the fade-in; only the LAST carries
    // the fade-out. Intermediate segments are inside the duck windows
    // and don't get re-faded.
    ...(i === 0 && fadeIn > 0 ? { fadeInSec: fadeIn } : {}),
    ...(i === segments.length - 1 && fadeOut > 0 ? { fadeOutSec: fadeOut } : {}),
  }));
}

function voiceoverClipFor(
  vo: VoiceoverClip,
  scenes: Scene[],
  mix: CanvasAudioMix,
): AudioClip | null {
  if (!vo.url) return null;
  if (vo.muted) return null;
  // Anchor + manual offset compose: the editor's UI lets the user
  // drag the clip relative to the scene boundary without re-anchoring.
  // Trim from the source's tail shortens the played duration; the
  // scheduler reads `endSec` as the cutoff.
  const anchorStart = sceneStart(scenes, vo.anchorSceneId);
  const offset = vo.startOffsetSec ?? 0;
  const trimStart = Math.max(0, vo.trimStartSec ?? 0);
  const trimEnd = Math.max(0, vo.trimEndSec ?? 0);
  const start = anchorStart + offset;
  // Effective playable length after both-end trims. Clamp to a
  // minimum of 50ms so a fully-trimmed clip doesn't crash the
  // scheduler's interval math.
  const playableSec = Math.max(0.05, vo.durationSeconds - trimStart - trimEnd);
  return {
    id: vo.id,
    track: vo.url,
    label: vo.label,
    startSec: start,
    endSec: start + playableSec,
    volume: effectiveGain(vo.gain, "voiceover", mix),
    fadeInSec: vo.fadeInSec,
    fadeOutSec: vo.fadeOutSec,
    trimStartSec: trimStart,
  };
}

/** Convert v2 CanvasState into the flat AudioClip[] the shared
 *  `useMusicScheduler` / `scheduleClipsToDestination` consume. Includes
 *  music (auto-ducked under voiceover when the mixer is configured
 *  for it) + every non-muted voiceover, with audioMix gains applied. */
export function canvasStateToAudioClips(state: CanvasState): AudioClip[] {
  const totalSec = totalDurationSeconds(state);
  const mix = state.audioMix ?? DEFAULT_AUDIO_MIX;
  const out: AudioClip[] = [];
  const voiceClips: AudioClip[] = [];
  const duckingIntervals: DuckingInterval[] = [];
  for (const vo of state.voiceovers) {
    const clip = voiceoverClipFor(vo, state.scenes, mix);
    if (!clip) continue;
    voiceClips.push(clip);
    // Only audible voiceovers participate in ducking — a muted clip
    // shouldn't be dropping the music gain.
    duckingIntervals.push({ startSec: clip.startSec, endSec: clip.endSec });
  }
  out.push(...musicClipsFor(state, totalSec, mix, duckingIntervals));
  out.push(...voiceClips);
  return out;
}
