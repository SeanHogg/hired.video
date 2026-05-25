/**
 * Tests for `updateVoiceoverClip` + `updateMusicTiming` — the canvas-
 * state mutators the audio-timeline drag UI (#1115) feeds. Validates
 * the structural-share contract (mutator returns a new state with the
 * affected slot updated; sibling slots stay reference-equal).
 */

import { describe, expect, it } from "vitest";
import {
  emptyCanvasState,
  updateVoiceoverClip,
  updateMusicTiming,
  type CanvasState,
  type VoiceoverClip,
} from "../canvas-state";

function withVoiceover(id: string, overrides: Partial<VoiceoverClip> = {}): CanvasState {
  const state = emptyCanvasState();
  return {
    ...state,
    voiceovers: [
      {
        id,
        url: `https://example.com/${id}.mp3`,
        label: "Take 1",
        durationSeconds: 12,
        anchorSceneId: null,
        ...overrides,
      },
    ],
  };
}

describe("updateVoiceoverClip", () => {
  it("applies the patch to the matching clip", () => {
    const before = withVoiceover("vo-1");
    const after = updateVoiceoverClip(before, "vo-1", { startOffsetSec: 2.5, fadeInSec: 0.5 });
    expect(after.voiceovers[0].startOffsetSec).toBe(2.5);
    expect(after.voiceovers[0].fadeInSec).toBe(0.5);
  });

  it("preserves untouched fields", () => {
    const before = withVoiceover("vo-1", { gain: 0.7, label: "Custom label" });
    const after = updateVoiceoverClip(before, "vo-1", { trimStartSec: 1 });
    expect(after.voiceovers[0].gain).toBe(0.7);
    expect(after.voiceovers[0].label).toBe("Custom label");
  });

  it("is a no-op when the id doesn't match", () => {
    const before = withVoiceover("vo-1");
    const after = updateVoiceoverClip(before, "vo-missing", { startOffsetSec: 999 });
    expect(after.voiceovers[0].startOffsetSec).toBeUndefined();
  });

  it("returns a NEW state object (structural share)", () => {
    const before = withVoiceover("vo-1");
    const after = updateVoiceoverClip(before, "vo-1", { fadeOutSec: 0.5 });
    expect(after).not.toBe(before);
    expect(after.voiceovers).not.toBe(before.voiceovers);
  });

  it("keeps sibling voiceovers reference-equal", () => {
    const state = emptyCanvasState();
    const stateWith2 = {
      ...state,
      voiceovers: [
        { id: "vo-1", url: "u1", label: "1", durationSeconds: 5, anchorSceneId: null },
        { id: "vo-2", url: "u2", label: "2", durationSeconds: 8, anchorSceneId: null },
      ],
    };
    const after = updateVoiceoverClip(stateWith2, "vo-1", { fadeInSec: 0.5 });
    // Sibling at index 1 stays reference-equal.
    expect(after.voiceovers[1]).toBe(stateWith2.voiceovers[1]);
  });
});

describe("updateMusicTiming", () => {
  it("patches the music source's timing fields", () => {
    const base = emptyCanvasState();
    const state: CanvasState = {
      ...base,
      musicSource: { kind: "stock", trackId: "corporate-inspire" },
    };
    const after = updateMusicTiming(state, { fadeInSec: 1.5, startOffsetSec: 3 });
    expect(after.musicSource?.fadeInSec).toBe(1.5);
    expect(after.musicSource?.startOffsetSec).toBe(3);
    // Discriminator preserved — the music source stayed `stock`.
    expect(after.musicSource?.kind).toBe("stock");
  });

  it("works for custom music sources too", () => {
    const base = emptyCanvasState();
    const state: CanvasState = {
      ...base,
      musicSource: {
        kind: "custom",
        url: "https://example.com/x.mp3",
        label: "Custom",
        durationSeconds: 30,
      },
    };
    const after = updateMusicTiming(state, { fadeOutSec: 2 });
    expect(after.musicSource?.fadeOutSec).toBe(2);
    // Custom-only fields preserved.
    if (after.musicSource?.kind === "custom") {
      expect(after.musicSource.durationSeconds).toBe(30);
      expect(after.musicSource.label).toBe("Custom");
    } else {
      throw new Error("musicSource kind was mutated");
    }
  });

  it("is a no-op when no music source is set", () => {
    const state = emptyCanvasState();
    const after = updateMusicTiming(state, { fadeInSec: 1 });
    expect(after).toBe(state);
    expect(after.musicSource).toBeNull();
  });
});
