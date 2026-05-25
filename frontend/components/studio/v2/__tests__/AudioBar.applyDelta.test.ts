/**
 * Tests for `applyDelta` — the pure mode-aware bar-snapshot translator
 * that lives at the heart of `<AudioBar>` (#1115). Pins every mode's
 * clamp + the invariants every drag must preserve (playable length
 * stays ≥ MIN, fades can't overlap, trim never goes negative, trim-end
 * can't push past source duration).
 */

import { describe, expect, it } from "vitest";
import { applyDelta, type AudioBarValue } from "@/components/studio/v2/AudioBar";

function snap(overrides: Partial<AudioBarValue> = {}): AudioBarValue {
  return {
    startSec: 0,
    endSec: 10,
    trimStartSec: 0,
    trimEndSec: 0,
    fadeInSec: 0,
    fadeOutSec: 0,
    sourceDurationSec: 10,
    ...overrides,
  };
}

describe("applyDelta — move mode", () => {
  it("shifts both ends by the delta", () => {
    const next = applyDelta(snap({ startSec: 5, endSec: 15 }), 3, "move");
    expect(next.startSec).toBe(8);
    expect(next.endSec).toBe(18);
  });

  it("clamps to startSec ≥ 0 (can't drag past composition start)", () => {
    const next = applyDelta(snap({ startSec: 2, endSec: 10 }), -10, "move");
    expect(next.startSec).toBe(0);
    expect(next.endSec).toBe(8); // playable length preserved (10 - 2 = 8)
  });

  it("preserves playable length across the drag", () => {
    const before = snap({ startSec: 1, endSec: 7 });
    const after = applyDelta(before, 5, "move");
    expect(after.endSec - after.startSec).toBe(before.endSec - before.startSec);
  });

  it("doesn't mutate trim fields on move", () => {
    const before = snap({ trimStartSec: 1.5, trimEndSec: 0.8 });
    const after = applyDelta(before, 3, "move");
    expect(after.trimStartSec).toBe(1.5);
    expect(after.trimEndSec).toBe(0.8);
  });
});

describe("applyDelta — trim-start mode", () => {
  it("moves the left edge inward, growing trimStart by the same amount", () => {
    const next = applyDelta(snap({ startSec: 0, endSec: 10, trimStartSec: 0 }), 2, "trim-start");
    expect(next.startSec).toBe(2);
    expect(next.trimStartSec).toBe(2);
    expect(next.endSec).toBe(10);
  });

  it("clamps so playable stays ≥ 0.05s", () => {
    const next = applyDelta(snap({ startSec: 0, endSec: 1 }), 5, "trim-start");
    // Can't push start past end - MIN.
    expect(next.startSec).toBeLessThanOrEqual(1 - 0.05);
    expect(next.endSec - next.startSec).toBeGreaterThanOrEqual(0.05);
  });

  it("clamps startSec ≥ 0 when user drags past composition start", () => {
    const next = applyDelta(snap({ startSec: 3, endSec: 10, trimStartSec: 3 }), -10, "trim-start");
    expect(next.startSec).toBe(0);
    expect(next.trimStartSec).toBe(0);
  });
});

describe("applyDelta — trim-end mode", () => {
  it("moves the right edge outward, shrinking trimEnd by the same amount", () => {
    const next = applyDelta(snap({ startSec: 0, endSec: 5, trimEndSec: 5, sourceDurationSec: 10 }), 2, "trim-end");
    expect(next.endSec).toBe(7);
    expect(next.trimEndSec).toBe(3);
  });

  it("can't extend past source duration", () => {
    const next = applyDelta(snap({ startSec: 0, endSec: 9, trimEndSec: 1, sourceDurationSec: 10 }), 5, "trim-end");
    // Max end = startSec + (sourceDur - trimStart) = 0 + (10 - 0) = 10.
    expect(next.endSec).toBe(10);
    expect(next.trimEndSec).toBe(0);
  });

  it("clamps so playable stays ≥ 0.05s when dragged in", () => {
    const next = applyDelta(snap({ startSec: 0, endSec: 5 }), -100, "trim-end");
    expect(next.endSec).toBe(0.05);
  });
});

describe("applyDelta — fade-in mode", () => {
  it("grows fadeInSec by the delta", () => {
    const next = applyDelta(snap({ endSec: 10 }), 2, "fade-in");
    expect(next.fadeInSec).toBe(2);
  });

  it("clamps fade ≥ 0", () => {
    const next = applyDelta(snap({ fadeInSec: 0.5 }), -10, "fade-in");
    expect(next.fadeInSec).toBe(0);
  });

  it("clamps so fade-in + fade-out ≤ playable length", () => {
    const next = applyDelta(snap({ endSec: 5, fadeOutSec: 2 }), 100, "fade-in");
    // Playable = 5, fadeOut = 2 → fadeIn capped at 3.
    expect(next.fadeInSec).toBe(3);
  });
});

describe("applyDelta — fade-out mode", () => {
  it("grows fadeOutSec when dragged LEFT (negative delta)", () => {
    // The fade-out handle sits at endSec - fadeOutSec; dragging it
    // LEFT (toward the bar's centre) INCREASES the fade length.
    const next = applyDelta(snap(), -2, "fade-out");
    expect(next.fadeOutSec).toBe(2);
  });

  it("shrinks fadeOutSec when dragged RIGHT (positive delta)", () => {
    const next = applyDelta(snap({ fadeOutSec: 3 }), 1, "fade-out");
    expect(next.fadeOutSec).toBe(2);
  });

  it("clamps to fade ≥ 0", () => {
    const next = applyDelta(snap({ fadeOutSec: 0.5 }), 10, "fade-out");
    expect(next.fadeOutSec).toBe(0);
  });

  it("clamps so fade-in + fade-out ≤ playable length", () => {
    const next = applyDelta(snap({ endSec: 5, fadeInSec: 3 }), -100, "fade-out");
    // Playable = 5, fadeIn = 3 → fadeOut capped at 2.
    expect(next.fadeOutSec).toBe(2);
  });
});

describe("applyDelta — invariants across all modes", () => {
  const modes = ["move", "trim-start", "trim-end", "fade-in", "fade-out"] as const;

  for (const mode of modes) {
    it(`${mode}: playable length stays ≥ 0.05`, () => {
      const next = applyDelta(snap({ startSec: 0, endSec: 5 }), 100, mode);
      // 1e-9 FP tolerance — Math.min on values close to MIN_PLAYABLE
      // sometimes lands a sub-ULP short. The model invariant holds.
      expect(next.endSec - next.startSec).toBeGreaterThanOrEqual(0.05 - 1e-9);
    });
    it(`${mode}: trimStart ≥ 0`, () => {
      const next = applyDelta(snap({ trimStartSec: 0 }), -100, mode);
      expect(next.trimStartSec).toBeGreaterThanOrEqual(0);
    });
    it(`${mode}: trimEnd ≥ 0`, () => {
      const next = applyDelta(snap({ trimEndSec: 0 }), -100, mode);
      expect(next.trimEndSec).toBeGreaterThanOrEqual(0);
    });
    it(`${mode}: fadeIn + fadeOut never exceeds playable`, () => {
      const next = applyDelta(snap({ endSec: 5, fadeInSec: 1, fadeOutSec: 1 }), 100, mode);
      expect(next.fadeInSec + next.fadeOutSec).toBeLessThanOrEqual(next.endSec - next.startSec + 0.001);
    });
  }
});
