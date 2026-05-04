/**
 * useAudioMix — single source of truth for "patch the audio-mix
 * config on a VideoScript." AudioMixerDialog (full editor) and the
 * inline NLETimeline lane controls both consume this hook so neither
 * site re-implements the mutation rules.
 *
 * Per the standing DRY rule, the lane defaults, the patch shape, and
 * the master/master-gain semantics live here ONCE.
 */

import { useCallback, useMemo } from "react";
import type {
  AudioLaneConfig,
  AudioMixConfig,
  VideoScript,
} from "@/types/video-script";

export const LANE_KEYS = ["music", "voiceover", "recording"] as const;
export type LaneKey = typeof LANE_KEYS[number];

export const DEFAULT_LANE: AudioLaneConfig = {
  gain: 1,
  fadeInSec: 0,
  fadeOutSec: 0,
  muted: false,
};

const DEFAULT_AUDIO = { track: "none", label: "None", volume: 0.6 } as const;

export interface UseAudioMixResult {
  mix: AudioMixConfig | undefined;
  /** Read a lane's effective config (merged with defaults). */
  laneOf: (key: LaneKey) => AudioLaneConfig;
  patchLane: (key: LaneKey, patch: Partial<AudioLaneConfig>) => void;
  patchMix: (patch: Partial<AudioMixConfig>) => void;
  /** Drop the entire mix object back to "no per-lane settings". */
  resetMix: () => void;
}

export function useAudioMix(
  script: VideoScript | null | undefined,
  onScriptChange: ((s: VideoScript) => void) | undefined,
): UseAudioMixResult {
  const audio = script?.video?.audio;
  const mix = audio?.mix;

  const laneOf = useCallback(
    (key: LaneKey): AudioLaneConfig => ({ ...DEFAULT_LANE, ...mix?.[key] }),
    [mix],
  );

  const patchMix = useCallback(
    (patch: Partial<AudioMixConfig>) => {
      if (!script || !onScriptChange) return;
      const nextMix = { ...mix, ...patch };
      const nextAudio = { ...(audio ?? DEFAULT_AUDIO), mix: nextMix };
      onScriptChange({ ...script, video: { ...script.video, audio: nextAudio } });
    },
    [script, onScriptChange, mix, audio],
  );

  const patchLane = useCallback(
    (key: LaneKey, patch: Partial<AudioLaneConfig>) => {
      const current = { ...DEFAULT_LANE, ...mix?.[key] };
      patchMix({ [key]: { ...current, ...patch } });
    },
    [mix, patchMix],
  );

  const resetMix = useCallback(() => {
    if (!script || !onScriptChange) return;
    const nextAudio = { ...(audio ?? DEFAULT_AUDIO), mix: undefined };
    onScriptChange({ ...script, video: { ...script.video, audio: nextAudio } });
  }, [script, onScriptChange, audio]);

  return useMemo(
    () => ({ mix, laneOf, patchLane, patchMix, resetMix }),
    [mix, laneOf, patchLane, patchMix, resetMix],
  );
}
