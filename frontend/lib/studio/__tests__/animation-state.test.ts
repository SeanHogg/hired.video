/**
 * Tests for `shared/animation-state.ts` — the AnimationState shape +
 * pure mutation helpers (#1003). Pins the structural-share contract
 * the editor's history wrapper depends on (mutated frame is a new
 * reference; siblings stay reference-equal so cheap diff works).
 */

import { describe, expect, it } from "vitest";
import {
  createBlankAnimationState,
  duplicateFrame,
  findFrame,
  insertFrameAfter,
  removeFrame,
  reorderFrame,
  totalDurationSec,
  updateAnimationSettings,
  updateFrameHold,
  updateFramePixels,
} from "@shared/animation-state";

describe("createBlankAnimationState", () => {
  it("seeds a single blank frame at default dimensions", () => {
    const s = createBlankAnimationState();
    expect(s.width).toBe(480);
    expect(s.height).toBe(480);
    expect(s.fps).toBe(12);
    expect(s.frames).toHaveLength(1);
    expect(s.frames[0].pixelsDataUrl).toBeNull();
    expect(s.frames[0].hold).toBe(1);
    expect(s.activeFrameId).toBe(s.frames[0].id);
  });

  it("respects custom dimensions / fps / background", () => {
    const s = createBlankAnimationState(640, 360, { kind: "transparent" }, 24);
    expect(s.width).toBe(640);
    expect(s.height).toBe(360);
    expect(s.fps).toBe(24);
    expect(s.background).toEqual({ kind: "transparent" });
  });
});

describe("insertFrameAfter", () => {
  it("inserts a blank frame immediately after the given frame", () => {
    const s = createBlankAnimationState();
    const firstId = s.frames[0].id;
    const { state: next, newFrameId } = insertFrameAfter(s, firstId);
    expect(next.frames).toHaveLength(2);
    expect(next.frames[0].id).toBe(firstId);
    expect(next.frames[1].id).toBe(newFrameId);
    expect(next.activeFrameId).toBe(newFrameId);
  });

  it("appends when the source id doesn't resolve", () => {
    const s = createBlankAnimationState();
    const { state: next } = insertFrameAfter(s, "unknown-id");
    expect(next.frames).toHaveLength(2);
  });
});

describe("duplicateFrame", () => {
  it("copies pixel data + hold onto the new frame", () => {
    let s = createBlankAnimationState();
    s = updateFramePixels(s, s.frames[0].id, "data:image/png;base64,AAA");
    s = updateFrameHold(s, s.frames[0].id, 3);
    const { state: next, newFrameId } = duplicateFrame(s, s.frames[0].id);
    const dup = findFrame(next, newFrameId);
    expect(dup?.pixelsDataUrl).toBe("data:image/png;base64,AAA");
    expect(dup?.hold).toBe(3);
  });
});

describe("removeFrame", () => {
  it("keeps at least one frame in the strip", () => {
    const s = createBlankAnimationState();
    const next = removeFrame(s, s.frames[0].id);
    expect(next.frames).toHaveLength(1); // no-op
  });

  it("falls back to the previous frame when removing the active one", () => {
    let s = createBlankAnimationState();
    const firstId = s.frames[0].id;
    const { state: withTwo, newFrameId: secondId } = insertFrameAfter(s, firstId);
    s = withTwo;
    s = { ...s, activeFrameId: secondId };
    const next = removeFrame(s, secondId);
    expect(next.frames).toHaveLength(1);
    expect(next.activeFrameId).toBe(firstId);
  });
});

describe("reorderFrame", () => {
  it("moves a frame to the requested index", () => {
    let s = createBlankAnimationState();
    const firstId = s.frames[0].id;
    const { state: withTwo, newFrameId: secondId } = insertFrameAfter(s, firstId);
    const { state: withThree, newFrameId: thirdId } = insertFrameAfter(withTwo, secondId);
    const next = reorderFrame(withThree, thirdId, 0);
    expect(next.frames.map((f) => f.id)).toEqual([thirdId, firstId, secondId]);
  });

  it("clamps out-of-bounds destinations", () => {
    let s = createBlankAnimationState();
    const firstId = s.frames[0].id;
    const { state: withTwo } = insertFrameAfter(s, firstId);
    const next = reorderFrame(withTwo, firstId, 99);
    expect(next.frames[next.frames.length - 1].id).toBe(firstId);
  });
});

describe("updateFrameHold", () => {
  it("clamps the hold value to [1, 30]", () => {
    let s = createBlankAnimationState();
    s = updateFrameHold(s, s.frames[0].id, 0);
    expect(s.frames[0].hold).toBe(1);
    s = updateFrameHold(s, s.frames[0].id, 99);
    expect(s.frames[0].hold).toBe(30);
  });
});

describe("totalDurationSec", () => {
  it("sums per-frame holds at the project's fps", () => {
    let s = createBlankAnimationState(480, 480, { kind: "color", color: "#fff" }, 24);
    const id = s.frames[0].id;
    const { state: two, newFrameId: id2 } = insertFrameAfter(s, id);
    s = two;
    s = updateFrameHold(s, id2, 4); // hold 4 ticks
    // 1 + 4 = 5 ticks @ 24fps = 5/24 ≈ 0.208s
    expect(totalDurationSec(s)).toBeCloseTo(5 / 24, 5);
  });

  it("returns 0 when fps is zero (defensive)", () => {
    const s = updateAnimationSettings(createBlankAnimationState(), { fps: 0 });
    expect(totalDurationSec(s)).toBe(0);
  });
});

describe("structural sharing", () => {
  it("updateFramePixels keeps sibling frames reference-equal", () => {
    let s = createBlankAnimationState();
    const firstId = s.frames[0].id;
    const { state: withTwo, newFrameId: secondId } = insertFrameAfter(s, firstId);
    s = withTwo;
    const secondFrameBefore = s.frames[1];
    s = updateFramePixels(s, firstId, "data:image/png;base64,ZZZ");
    // First frame is replaced; second frame retains identity.
    expect(s.frames[0].pixelsDataUrl).toBe("data:image/png;base64,ZZZ");
    expect(s.frames[1]).toBe(secondFrameBefore);
  });
});
