/**
 * Tests for the unified `audioLayers[]` mutators — `updateAudioLayer`,
 * `addAudioLayer`, `removeAudioLayer`, and `splitAudioLayer` — the
 * canvas-state operations the audio-timeline drag UI (#1115) and the
 * multi-track audio rebuild feed. Validates the structural-share contract
 * (a mutator returns a new state with the affected layer updated; sibling
 * layers stay reference-equal) plus the split timing math.
 */

import { describe, expect, it } from "vitest";
import {
  emptyCanvasState,
  makeAudioLayer,
  addAudioLayer,
  removeAudioLayer,
  updateAudioLayer,
  splitAudioLayer,
  voiceoverLayers,
  musicLayers,
  type AudioLayer,
  type CanvasState,
} from "../canvas-state";

function withVoiceover(id: string, overrides: Partial<AudioLayer> = {}): CanvasState {
  const state = emptyCanvasState();
  return {
    ...state,
    audioLayers: [
      makeAudioLayer({
        id,
        kind: "voiceover",
        source: { kind: "custom", url: `https://example.com/${id}.mp3` },
        label: "Take 1",
        durationSeconds: 12,
        ...overrides,
      }),
    ],
  };
}

describe("updateAudioLayer — voiceover", () => {
  it("applies the patch to the matching layer", () => {
    const before = withVoiceover("vo-1");
    const after = updateAudioLayer(before, "vo-1", { startOffsetSec: 2.5, fadeInSec: 0.5 });
    expect(voiceoverLayers(after)[0].startOffsetSec).toBe(2.5);
    expect(voiceoverLayers(after)[0].fadeInSec).toBe(0.5);
  });

  it("preserves untouched fields", () => {
    const before = withVoiceover("vo-1", { gain: 0.7, label: "Custom label" });
    const after = updateAudioLayer(before, "vo-1", { trimStartSec: 1 });
    expect(voiceoverLayers(after)[0].gain).toBe(0.7);
    expect(voiceoverLayers(after)[0].label).toBe("Custom label");
  });

  it("is a no-op when the id doesn't match", () => {
    const before = withVoiceover("vo-1");
    const after = updateAudioLayer(before, "vo-missing", { startOffsetSec: 999 });
    // Default startOffsetSec stays 0 — nothing patched.
    expect(voiceoverLayers(after)[0].startOffsetSec).toBe(0);
  });

  it("returns a NEW state object (structural share)", () => {
    const before = withVoiceover("vo-1");
    const after = updateAudioLayer(before, "vo-1", { fadeOutSec: 0.5 });
    expect(after).not.toBe(before);
    expect(after.audioLayers).not.toBe(before.audioLayers);
  });

  it("keeps sibling layers reference-equal", () => {
    const state = emptyCanvasState();
    const stateWith2: CanvasState = {
      ...state,
      audioLayers: [
        makeAudioLayer({ id: "vo-1", kind: "voiceover", source: { kind: "custom", url: "u1" }, label: "1", durationSeconds: 5 }),
        makeAudioLayer({ id: "vo-2", kind: "voiceover", source: { kind: "custom", url: "u2" }, label: "2", durationSeconds: 8 }),
      ],
    };
    const after = updateAudioLayer(stateWith2, "vo-1", { fadeInSec: 0.5 });
    // Sibling at index 1 stays reference-equal.
    expect(after.audioLayers[1]).toBe(stateWith2.audioLayers[1]);
  });
});

describe("updateAudioLayer — music timing", () => {
  function withMusic(id: string, source: AudioLayer["source"], overrides: Partial<AudioLayer> = {}): CanvasState {
    const base = emptyCanvasState();
    return {
      ...base,
      audioLayers: [
        makeAudioLayer({
          id,
          kind: "music",
          source,
          label: "Music",
          durationSeconds: 60,
          ...overrides,
        }),
      ],
    };
  }

  it("patches a stock music layer's timing fields", () => {
    const state = withMusic("m-1", { kind: "stock", trackId: "corporate-inspire" });
    const after = updateAudioLayer(state, "m-1", { fadeInSec: 1.5, startOffsetSec: 3 });
    const m = musicLayers(after)[0];
    expect(m.fadeInSec).toBe(1.5);
    expect(m.startOffsetSec).toBe(3);
    // Discriminator preserved — the source stayed `stock`.
    expect(m.source.kind).toBe("stock");
    if (m.source.kind === "stock") expect(m.source.trackId).toBe("corporate-inspire");
  });

  it("works for custom music sources too", () => {
    const state = withMusic(
      "m-1",
      { kind: "custom", url: "https://example.com/x.mp3" },
      { label: "Custom", durationSeconds: 30 },
    );
    const after = updateAudioLayer(state, "m-1", { fadeOutSec: 2 });
    const m = musicLayers(after)[0];
    expect(m.fadeOutSec).toBe(2);
    // Custom-only fields preserved.
    expect(m.source.kind).toBe("custom");
    expect(m.durationSeconds).toBe(30);
    expect(m.label).toBe("Custom");
  });

  it("is a no-op when no music layer is set", () => {
    const state = emptyCanvasState();
    const after = updateAudioLayer(state, "missing", { fadeInSec: 1 });
    expect(musicLayers(after)).toHaveLength(0);
  });
});

describe("addAudioLayer / removeAudioLayer", () => {
  it("appends a layer and removes it by id", () => {
    const state = emptyCanvasState();
    const layer = makeAudioLayer({
      id: "m-1",
      kind: "music",
      source: { kind: "stock", trackId: "tech-ambient" },
      label: "Music",
      durationSeconds: 24,
    });
    const added = addAudioLayer(state, layer);
    expect(added.audioLayers).toHaveLength(1);
    expect(added.audioLayers[0].id).toBe("m-1");
    const removed = removeAudioLayer(added, "m-1");
    expect(removed.audioLayers).toHaveLength(0);
  });
});

describe("splitAudioLayer", () => {
  function withSplittableMusic(overrides: Partial<AudioLayer> = {}): CanvasState {
    const base = emptyCanvasState();
    return {
      ...base,
      audioLayers: [
        makeAudioLayer({
          id: "m-1",
          kind: "music",
          source: { kind: "custom", url: "https://example.com/track.mp3" },
          label: "Music",
          durationSeconds: 60,
          fadeInSec: 1,
          fadeOutSec: 2,
          ...overrides,
        }),
      ],
    };
  }

  it("splits a layer into head + tail with the right trim / offset / fades", () => {
    const state = withSplittableMusic();
    // Layer starts at composition 0 (no anchor, offset 0). Cut at 10s.
    const { state: next, newLayerId } = splitAudioLayer(state, "m-1", 10);
    expect(newLayerId).not.toBeNull();
    expect(next.audioLayers).toHaveLength(2);

    const head = next.audioLayers.find((l) => l.id === "m-1")!;
    const tail = next.audioLayers.find((l) => l.id === newLayerId)!;

    // Head: keeps the fade-in, ends at the cut via an added trim-end, no fade-out.
    expect(head.fadeInSec).toBe(1);
    expect(head.fadeOutSec).toBe(0);
    // duration 60, trimStart 0, cut at local 10 → trimEnd = 60 - 0 - 10 = 50.
    expect(head.trimEndSec).toBe(50);

    // Tail: advanced offset + trimStart by the cut, keeps the fade-out, no fade-in.
    expect(tail.startOffsetSec).toBe(10);
    expect(tail.trimStartSec).toBe(10);
    expect(tail.fadeInSec).toBe(0);
    expect(tail.fadeOutSec).toBe(2);
  });

  it("is a no-op (null id) when the cut falls within 50ms of an edge", () => {
    const state = withSplittableMusic();
    const atStart = splitAudioLayer(state, "m-1", 0.02);
    expect(atStart.newLayerId).toBeNull();
    expect(atStart.state).toBe(state);

    // Playable length is 60; a cut within 50ms of the end is a no-op too.
    const atEnd = splitAudioLayer(state, "m-1", 59.99);
    expect(atEnd.newLayerId).toBeNull();
    expect(atEnd.state).toBe(state);
  });

  it("is a no-op when the layer id doesn't exist", () => {
    const state = withSplittableMusic();
    const result = splitAudioLayer(state, "missing", 10);
    expect(result.newLayerId).toBeNull();
    expect(result.state).toBe(state);
  });
});
