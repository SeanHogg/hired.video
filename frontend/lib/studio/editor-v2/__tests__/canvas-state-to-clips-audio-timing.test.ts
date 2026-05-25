/**
 * Tests for the music + voiceover timing-control plumbing in
 * `canvasStateToAudioClips` (#1115). Pins:
 *   - Music `startOffsetSec` shifts the clip's composition-time start.
 *   - Music `fadeInSec` / `fadeOutSec` ride the first / last segment.
 *   - Voiceover trims shrink the playable length; offset shifts start.
 *
 * The shared audio scheduler reads these fields verbatim, so a
 * regression here would silently break preview + export fades.
 */

import { describe, expect, it } from "vitest";
import { canvasStateToAudioClips } from "../canvas-state-to-clips";
import { emptyCanvasState, type CanvasState } from "../canvas-state";

function withVoiceover(overrides: { startOffsetSec?: number; trimStartSec?: number; trimEndSec?: number; fadeInSec?: number; fadeOutSec?: number } = {}): CanvasState {
  const base = emptyCanvasState();
  return {
    ...base,
    voiceovers: [
      {
        id: "vo-1",
        url: "https://example.com/vo.mp3",
        label: "Take 1",
        durationSeconds: 12,
        anchorSceneId: null,
        ...overrides,
      },
    ],
  };
}

describe("canvasStateToAudioClips — voiceover timing", () => {
  it("offsets startSec by startOffsetSec", () => {
    const state = withVoiceover({ startOffsetSec: 2.5 });
    const clips = canvasStateToAudioClips(state);
    const vo = clips.find((c) => c.id === "vo-1");
    expect(vo).toBeDefined();
    expect(vo?.startSec).toBe(2.5);
  });

  it("shrinks playable length by trimStartSec + trimEndSec", () => {
    const state = withVoiceover({ trimStartSec: 1, trimEndSec: 2 });
    const clips = canvasStateToAudioClips(state);
    const vo = clips.find((c) => c.id === "vo-1");
    expect(vo).toBeDefined();
    // duration 12 - trimStart 1 - trimEnd 2 = 9
    expect(vo!.endSec - vo!.startSec).toBe(9);
  });

  it("passes fadeInSec + fadeOutSec to the clip", () => {
    const state = withVoiceover({ fadeInSec: 0.5, fadeOutSec: 1 });
    const clips = canvasStateToAudioClips(state);
    const vo = clips.find((c) => c.id === "vo-1");
    expect(vo?.fadeInSec).toBe(0.5);
    expect(vo?.fadeOutSec).toBe(1);
  });

  it("clamps fully-trimmed clips to ≥ 50ms (no zero-length crash)", () => {
    // duration 12, both trims = 999 → would yield negative; clamp.
    const state = withVoiceover({ trimStartSec: 999, trimEndSec: 999 });
    const clips = canvasStateToAudioClips(state);
    const vo = clips.find((c) => c.id === "vo-1");
    expect(vo!.endSec - vo!.startSec).toBeGreaterThanOrEqual(0.05);
  });
});

describe("canvasStateToAudioClips — music timing", () => {
  function withMusic(
    timing: { startOffsetSec?: number; fadeInSec?: number; fadeOutSec?: number } = {},
  ): CanvasState {
    const base = emptyCanvasState();
    return {
      ...base,
      musicSource: {
        kind: "custom",
        url: "https://example.com/track.mp3",
        label: "Stock",
        durationSeconds: 60,
        ...timing,
      },
    };
  }

  it("shifts music startSec by startOffsetSec", () => {
    const state = withMusic({ startOffsetSec: 1.5 });
    const clips = canvasStateToAudioClips(state);
    const music = clips.find((c) => c.id.startsWith("v2-music"));
    expect(music).toBeDefined();
    expect(music!.startSec).toBeGreaterThanOrEqual(1.5);
  });

  it("attaches fadeInSec to the FIRST music segment only", () => {
    const state = withMusic({ fadeInSec: 1.2 });
    const clips = canvasStateToAudioClips(state).filter((c) => c.id.startsWith("v2-music"));
    expect(clips[0].fadeInSec).toBe(1.2);
  });

  it("attaches fadeOutSec to the LAST music segment only", () => {
    const state = withMusic({ fadeOutSec: 1.7 });
    const clips = canvasStateToAudioClips(state).filter((c) => c.id.startsWith("v2-music"));
    expect(clips[clips.length - 1].fadeOutSec).toBe(1.7);
  });

  it("emits no music when the offset puts the start past the composition end", () => {
    const state = withMusic({ startOffsetSec: 9999 });
    const clips = canvasStateToAudioClips(state).filter((c) => c.id.startsWith("v2-music"));
    expect(clips.length).toBe(0);
  });
});
