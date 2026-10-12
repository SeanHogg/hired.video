/**
 * Frame-time selection for the home-wall explicit scan: one frame per scene
 * (more for long scenes, ~every 3 s), clamped to the video, at most 12.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/content-scan-service", () => ({ contentScanService: { submitFrames: vi.fn() } }));

import { MAX_SCAN_FRAMES, selectFrameTimes } from "../moderation-frames";

describe("selectFrameTimes", () => {
  it("takes the middle of each short scene", () => {
    expect(selectFrameTimes({ sceneDurations: [2, 2, 2], totalSeconds: 6 })).toEqual([1, 3, 5]);
  });

  it("samples long scenes about every 3 seconds", () => {
    // 9 s scene → 3 frames centred in 3 s slots; then a 2 s scene → 1 frame.
    expect(selectFrameTimes({ sceneDurations: [9, 2], totalSeconds: 11 })).toEqual([1.5, 4.5, 7.5, 10]);
  });

  it("without scenes, samples the whole video every ~3 seconds", () => {
    expect(selectFrameTimes({ sceneDurations: [], totalSeconds: 12 })).toEqual([1.5, 4.5, 7.5, 10.5]);
  });

  it("never exceeds the cap and keeps the first and last frame", () => {
    const times = selectFrameTimes({ sceneDurations: Array.from({ length: 30 }, () => 2), totalSeconds: 60 });
    expect(times).toHaveLength(MAX_SCAN_FRAMES);
    expect(times[0]).toBe(1);
    expect(times[times.length - 1]).toBe(59);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("clamps times past the end of the rendered video", () => {
    // Scenes add up to 10 s but the render is only 4 s long.
    const times = selectFrameTimes({ sceneDurations: [5, 5], totalSeconds: 4 });
    expect(times.every((t) => t <= 3.95)).toBe(true);
    expect(new Set(times).size).toBe(times.length);
  });

  it("returns nothing for an empty / zero-length video", () => {
    expect(selectFrameTimes({ sceneDurations: [], totalSeconds: 0 })).toEqual([]);
    expect(selectFrameTimes({ sceneDurations: [0, 0], totalSeconds: 0 })).toEqual([]);
  });

  it("honours a custom cap", () => {
    expect(selectFrameTimes({ sceneDurations: [2, 2, 2, 2], totalSeconds: 8, max: 2 })).toEqual([1, 7]);
  });
});
