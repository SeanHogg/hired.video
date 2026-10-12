/**
 * useTimelineAudio — the video's music as the strip edits it, mapped onto
 * the video plan (music-mix.ts):
 *
 *   clip       the derived music layer as it plays (music-track.ts), or null
 *   setTiming  a drag on the Music row (move / trim / fade) → `plan.musicMix`,
 *              under the gesture's own undo group (one step per drag)
 *   remove     the video goes silent (`music: "none"`, mix dropped)
 *   setVolume  the Advanced header's slider → `musicMix.volume`
 *
 * The track itself is ONE stock track, picked in Media; each scene's
 * narration is written in the scene inspector.
 */
import { useCallback } from "react";
import type { VideoPlan } from "@shared/video-plan";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { mixMusicTiming, musicVolume, removeMusic, setMusicVolume, type MusicTimingPatch } from "./music-mix";
import { musicClipOf } from "./music-track";

interface Args {
  canvas: CanvasState | null;
  plan: VideoPlan;
  updatePlan: (next: VideoPlan, group?: string) => void;
}

const VOLUME_GROUP = "video:music-volume";

export function useTimelineAudio({ canvas, plan, updatePlan }: Args) {
  const clip = musicClipOf(canvas);

  const setTiming = useCallback(
    (patch: MusicTimingPatch, group: string) => updatePlan(mixMusicTiming(plan, patch), group),
    [plan, updatePlan],
  );

  const remove = useCallback(() => updatePlan(removeMusic(plan)), [plan, updatePlan]);

  const setVolume = useCallback(
    (volume: number) => updatePlan(setMusicVolume(plan, volume), VOLUME_GROUP),
    [plan, updatePlan],
  );

  return {
    clip,
    hasMusic: clip !== null,
    volume: musicVolume(plan),
    setTiming,
    remove,
    setVolume,
  };
}

export type TimelineAudio = ReturnType<typeof useTimelineAudio>;
