/**
 * Tests for `mergeCanvasStates` (the /studio bulk "Merge" core) and the
 * `mergeBlocker` eligibility rule. Covers scene concatenation with fresh
 * ids, audio re-anchoring (anchored + composition-0 layers), caption cue
 * shifting, lead-project globals, and the empty-input exception.
 */
import { describe, expect, it } from "vitest";
import {
  emptyCanvasState,
  emptyScene,
  layerCompositionStart,
  makeAudioLayer,
  type CanvasState,
} from "../canvas-state";
import { mergeCanvasStates } from "../merge-canvas-states";
import { mergeBlocker } from "../../merge-studio-projects";

function stateWith(durations: number[], extra: Partial<CanvasState> = {}): CanvasState {
  const base = emptyCanvasState();
  return {
    ...base,
    scenes: durations.map((d, i) => ({ ...emptyScene(`S${i + 1}`), durationSeconds: d })),
    ...extra,
  };
}

describe("mergeCanvasStates", () => {
  it("concatenates scenes in order with fresh ids", () => {
    const a = stateWith([5, 3]);
    const b = stateWith([4]);
    const merged = mergeCanvasStates([a, b]);
    expect(merged.scenes.map((s) => s.durationSeconds)).toEqual([5, 3, 4]);
    const sourceIds = new Set([...a.scenes, ...b.scenes].map((s) => s.id));
    expect(merged.scenes.every((s) => !sourceIds.has(s.id))).toBe(true);
  });

  it("keeps each audio layer's composition start", () => {
    const a = stateWith([5, 3]);
    const anchoredVo = makeAudioLayer({
      kind: "voiceover",
      source: { kind: "custom", url: "https://cdn/vo.mp3" },
      label: "VO",
      durationSeconds: 2,
      anchorSceneId: a.scenes[1].id,
      startOffsetSec: 0.5,
    });
    const b = stateWith([4]);
    const music = makeAudioLayer({
      kind: "music",
      source: { kind: "stock", trackId: "t1" },
      label: "Bed",
      durationSeconds: 4,
      startOffsetSec: 1,
    });
    const merged = mergeCanvasStates([
      { ...a, audioLayers: [anchoredVo] },
      { ...b, audioLayers: [music] },
    ]);
    const [vo, bed] = merged.audioLayers;
    expect(layerCompositionStart(merged, vo)).toBe(5.5);
    // Composition-0 music in source B now starts where B starts (8s) + 1s.
    expect(layerCompositionStart(merged, bed)).toBe(9);
    expect(vo.id).not.toBe(anchoredVo.id);
  });

  it("shifts caption cues by each source's start offset", () => {
    const a = stateWith([5], {
      captions: { style: "bold-pop", enabled: false, cues: [{ start: 0, end: 1, text: "a" }] },
    });
    const b = stateWith([4], {
      captions: { style: "standard", enabled: true, cues: [{ start: 1, end: 2, text: "b" }] },
    });
    const merged = mergeCanvasStates([a, b]);
    expect(merged.captions).toEqual({
      style: "bold-pop",
      enabled: true,
      cues: [
        { start: 0, end: 1, text: "a" },
        { start: 6, end: 7, text: "b" },
      ],
    });
  });

  it("returns null captions when no source has any", () => {
    expect(mergeCanvasStates([stateWith([1]), stateWith([1])]).captions).toBeNull();
  });

  it("takes globals from the lead project", () => {
    const a = stateWith([1], { width: 1080, height: 1920, themeId: "lead" });
    const b = stateWith([1], { width: 1920, height: 1080, themeId: "other" });
    const merged = mergeCanvasStates([a, b]);
    expect([merged.width, merged.height, merged.themeId]).toEqual([1080, 1920, "lead"]);
  });

  it("throws on an empty input", () => {
    expect(() => mergeCanvasStates([])).toThrow();
  });
});

describe("mergeBlocker", () => {
  const video = { kind: "nle" as const, mediaKind: "video" as const };
  it("needs at least two projects", () => {
    expect(mergeBlocker([video])).toBe("tooFew");
  });
  it("rejects mixed media kinds", () => {
    expect(mergeBlocker([video, { kind: "nle", mediaKind: "podcast" }])).toBe("mixedKinds");
  });
  it("rejects non-canvas runtimes, Comic+, and legacy scene projects", () => {
    expect(mergeBlocker([{ kind: "nle", mediaKind: "game" }, { kind: "nle", mediaKind: "game" }])).toBe("unsupportedKind");
    expect(
      mergeBlocker([{ kind: "nle", mediaKind: "interactive_comic" }, { kind: "nle", mediaKind: "interactive_comic" }]),
    ).toBe("unsupportedKind");
    expect(mergeBlocker([video, { kind: "scene", mediaKind: "video" }])).toBe("unsupportedKind");
  });
  it("allows two v2 videos", () => {
    expect(mergeBlocker([video, video])).toBeNull();
  });
});
