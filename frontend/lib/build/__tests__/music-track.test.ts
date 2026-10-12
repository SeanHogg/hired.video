/**
 * The strip's Music row on the plan: each handle's drag → the timing patch
 * (move, trim head / tail, fades), kept inside the source and the playable
 * minimum; the clip's drawn geometry; and useTimelineAudio storing a drag
 * under the gesture's own undo group, and removing the music.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { emptyCanvasState, type AudioLayer, type CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { MUSIC_LAYER_ID, mixMusicTiming } from "@/lib/build/music-mix";
import { dragMusicHandle, musicClipOf, musicClipStyle, playableSeconds, MUSIC_MIN_PLAYABLE_SECONDS, type MusicClip } from "@/lib/build/music-track";
import { useTimelineAudio } from "@/lib/build/use-timeline-audio";

const clip: MusicClip = { durationSeconds: 30, startOffsetSec: 2, trimStartSec: 1, trimEndSec: 4, fadeInSec: 1, fadeOutSec: 2 };

describe("dragMusicHandle", () => {
  it("moves the clip, never before the video's start", () => {
    expect(dragMusicHandle(clip, "move", 3)).toEqual({ startOffsetSec: 5 });
    expect(dragMusicHandle(clip, "move", -10)).toEqual({ startOffsetSec: 0 });
  });

  it("trims the head and keeps the audio under the edge in place", () => {
    expect(dragMusicHandle(clip, "start", 2)).toEqual({ trimStartSec: 3, startOffsetSec: 4 });
    // Back past the source's start: stops at trim 0.
    expect(dragMusicHandle(clip, "start", -5)).toEqual({ trimStartSec: 0, startOffsetSec: 1 });
  });

  it("trims the tail, always leaving the playable minimum", () => {
    expect(dragMusicHandle(clip, "end", -6)).toEqual({ trimEndSec: 10 });
    const all = dragMusicHandle(clip, "end", -1000);
    expect(clip.durationSeconds - clip.trimStartSec - (all.trimEndSec ?? 0)).toBeCloseTo(MUSIC_MIN_PLAYABLE_SECONDS);
    expect(dragMusicHandle(clip, "end", 99)).toEqual({ trimEndSec: 0 });
  });

  it("sets the fades inside what plays, never overlapping", () => {
    expect(dragMusicHandle(clip, "fadeIn", 2)).toEqual({ fadeInSec: 3 });
    expect(dragMusicHandle(clip, "fadeOut", -3)).toEqual({ fadeOutSec: 5 });
    expect(dragMusicHandle(clip, "fadeIn", 999)).toEqual({ fadeInSec: playableSeconds(clip) - clip.fadeOutSec });
    expect(dragMusicHandle(clip, "fadeOut", 999)).toEqual({ fadeOutSec: 0 });
  });

  it("ignores a non-finite drag and stores through mixMusicTiming", () => {
    expect(dragMusicHandle(clip, "move", Number.NaN)).toEqual({ startOffsetSec: 2 });
    expect(mixMusicTiming({}, dragMusicHandle(clip, "start", 2)).musicMix).toEqual({ trimStartSec: 3, startOffsetSec: 4 });
  });
});

describe("musicClipStyle", () => {
  it("places the clip on the video's clock with its fades", () => {
    const s = musicClipStyle(clip, 50);
    expect(s.left).toBe("4%");
    expect(s.width).toBe("50%");
    expect(s.fadeIn).toBe("4%");
    expect(s.fadeOut).toBe("8%");
  });
});

describe("useTimelineAudio", () => {
  const layer: AudioLayer = {
    id: MUSIC_LAYER_ID,
    kind: "music",
    durationSeconds: 30,
    startOffsetSec: 0,
    trimStartSec: 0,
    trimEndSec: 0,
    fadeInSec: 0,
    fadeOutSec: 0,
    gain: 1,
  } as AudioLayer;
  const canvas: CanvasState = { ...emptyCanvasState(), audioLayers: [layer] };

  it("finds the clip, stores a drag under its gesture group, and removes the music", () => {
    const updatePlan = vi.fn();
    const { result } = renderHook(() => useTimelineAudio({ canvas, plan: { music: "lofi" }, updatePlan }));
    expect(result.current.clip).toBe(musicClipOf(canvas));
    result.current.setTiming({ fadeInSec: 2 }, "video:music-mix:1");
    expect(updatePlan).toHaveBeenLastCalledWith({ music: "lofi", musicMix: { fadeInSec: 2 } }, "video:music-mix:1");
    result.current.remove();
    expect(updatePlan).toHaveBeenLastCalledWith({ music: "none" });
  });

  it("is silent without a music layer", () => {
    const { result } = renderHook(() => useTimelineAudio({ canvas: emptyCanvasState(), plan: {}, updatePlan: vi.fn() }));
    expect(result.current.clip).toBeNull();
    expect(result.current.hasMusic).toBe(false);
  });
});
