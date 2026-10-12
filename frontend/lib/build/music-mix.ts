/**
 * Music mix — the owner's hand mix of the résumé video's background music,
 * stored on the plan (`plan.musicMix`) and laid over the music layer of the
 * canvas derived from résumé + plan.
 *
 * The derived canvas is rebuilt on every résumé change and its music layer
 * gets a fresh id each time, so (like the frame overrides in
 * canvas-overrides.ts) the edit lives on the plan and is applied after the
 * derive: the layer gets a STABLE id (`MUSIC_LAYER_ID`) the Advanced timeline
 * can address, plus the owner's start / trims / fades / volume.
 *
 * Every helper clamps to the schema's bounds (MusicMixSchema) before storing,
 * so a timeline drag can never write a plan that fails to read back.
 */
import {
  MUSIC_FADE_SECONDS_MAX,
  MUSIC_MIX_SECONDS_MAX,
  type MusicMix,
  type VideoPlan,
} from "@shared/video-plan";
import type { AudioLayer, CanvasState } from "@/lib/studio/editor-v2/canvas-state";

/** The derived video's one music layer, addressed by the timeline. */
export const MUSIC_LAYER_ID = "build-music";

/** Seconds of the track that always stay playable, whatever the trims. */
const MIN_PLAYABLE_SECONDS = 0.5;

/** A timeline drag on the music bar (AdvancedTimeline's `AudioPatch`). */
export type MusicTimingPatch = Pick<MusicMix, "startOffsetSec" | "trimStartSec" | "trimEndSec" | "fadeInSec" | "fadeOutSec">;

const clamp = (value: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0;

/** Round to the millisecond so a drag doesn't store float noise. */
const ms = (value: number): number => Math.round(value * 1000) / 1000;

/** The layer with the owner's mix on it (trims kept inside the source). */
function mixLayer(layer: AudioLayer, mix: MusicMix | undefined): AudioLayer {
  const next: AudioLayer = { ...layer, id: MUSIC_LAYER_ID };
  if (!mix) return next;
  if (mix.startOffsetSec !== undefined) next.startOffsetSec = mix.startOffsetSec;
  if (mix.fadeInSec !== undefined) next.fadeInSec = mix.fadeInSec;
  if (mix.fadeOutSec !== undefined) next.fadeOutSec = mix.fadeOutSec;
  if (mix.volume !== undefined) next.gain = mix.volume;
  const trimStart = mix.trimStartSec ?? layer.trimStartSec;
  const trimEnd = mix.trimEndSec ?? layer.trimEndSec;
  // The video may have got shorter since the mix was made (the track is
  // derived at the video's length): never trim the music away entirely.
  const room = Math.max(0, layer.durationSeconds - MIN_PLAYABLE_SECONDS);
  next.trimStartSec = Math.min(trimStart, room);
  next.trimEndSec = Math.min(trimEnd, Math.max(0, room - next.trimStartSec));
  return next;
}

/** The canvas with the owner's music mix applied to its (first) music layer.
 *  No music layer (silent video) → the canvas unchanged. */
export function applyMusicMix(canvas: CanvasState, mix: MusicMix | undefined): CanvasState {
  const index = canvas.audioLayers.findIndex((l) => l.kind === "music");
  if (index < 0) return canvas;
  return {
    ...canvas,
    audioLayers: canvas.audioLayers.map((l, i) => (i === index ? mixLayer(l, mix) : l)),
  };
}

/** The plan with `mix` stored; an empty mix removes the key. */
function withMix(plan: VideoPlan, mix: MusicMix): VideoPlan {
  const pruned: MusicMix = {};
  for (const [key, value] of Object.entries(mix) as Array<[keyof MusicMix, number | undefined]>) {
    if (value !== undefined) pruned[key] = value;
  }
  const { musicMix: _old, ...rest } = plan;
  return Object.keys(pruned).length > 0 ? { ...rest, musicMix: pruned } : rest;
}

/** A drag on the music bar (move / trim / fade), clamped to the plan's bounds. */
export function mixMusicTiming(plan: VideoPlan, patch: MusicTimingPatch): VideoPlan {
  const next: MusicMix = { ...plan.musicMix };
  const seconds = (value: number | undefined, max: number) => (value === undefined ? undefined : ms(clamp(value, max)));
  if (patch.startOffsetSec !== undefined) next.startOffsetSec = seconds(patch.startOffsetSec, MUSIC_MIX_SECONDS_MAX);
  if (patch.trimStartSec !== undefined) next.trimStartSec = seconds(patch.trimStartSec, MUSIC_MIX_SECONDS_MAX);
  if (patch.trimEndSec !== undefined) next.trimEndSec = seconds(patch.trimEndSec, MUSIC_MIX_SECONDS_MAX);
  if (patch.fadeInSec !== undefined) next.fadeInSec = seconds(patch.fadeInSec, MUSIC_FADE_SECONDS_MAX);
  if (patch.fadeOutSec !== undefined) next.fadeOutSec = seconds(patch.fadeOutSec, MUSIC_FADE_SECONDS_MAX);
  return withMix(plan, next);
}

/** The music's volume (0..1); full volume clears the stored value. */
export function setMusicVolume(plan: VideoPlan, volume: number): VideoPlan {
  const v = Math.round(clamp(volume, 1) * 100) / 100;
  return withMix(plan, { ...plan.musicMix, volume: v === 1 ? undefined : v });
}

/** The volume the music plays at (1 = full). */
export function musicVolume(plan: VideoPlan): number {
  return plan.musicMix?.volume ?? 1;
}

/** Remove the music from the video (silent), with its mix. */
export function removeMusic(plan: VideoPlan): VideoPlan {
  const { musicMix: _mix, ...rest } = plan;
  return { ...rest, music: "none" };
}
