/**
 * Chapter-seed derivation for the Engagement tab (no live canvas).
 *
 * Run: vitest run components/engagement/__tests__/scene-boundaries.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  chapterSeedFromProject,
  formatSceneTimestamp,
  hasSeedSource,
  looksLikeTimeline,
  sceneBoundariesFromCanvas,
} from "../scene-boundaries";

function bgClip(opts: {
  id: string;
  startFrame: number;
  durationFrames: number;
  label: string;
}) {
  return {
    id: opts.id,
    sourceId: "",
    startFrame: opts.startFrame,
    durationFrames: opts.durationFrames,
    sourceInFrame: 0,
    effects: [
      {
        kind: "canvas-v2:background",
        params: { label: opts.label, sceneId: opts.id, color: "#0f172a" },
      },
    ],
  };
}

const twoSceneTimeline = {
  fps: 30,
  tracks: [
    {
      id: "v1",
      kind: "video",
      clips: [
        bgClip({ id: "s1", startFrame: 0, durationFrames: 90, label: "Hook" }),
        bgClip({ id: "s2", startFrame: 90, durationFrames: 150, label: "Proof" }),
      ],
    },
  ],
};

describe("sceneBoundariesFromCanvas", () => {
  it("accumulates start times from scene durations", () => {
    const seed = sceneBoundariesFromCanvas([
      { label: "Hook", durationSeconds: 3 },
      { label: "Proof", durationSeconds: 5 },
    ]);
    expect(seed.sceneBoundaries).toEqual([
      { title: "Hook", start: 0 },
      { title: "Proof", start: 3 },
    ]);
    expect(seed.durationSec).toBe(8);
  });

  it("returns empty for no scenes", () => {
    expect(sceneBoundariesFromCanvas([])).toEqual({
      sceneBoundaries: [],
      durationSec: 0,
    });
  });
});

describe("chapterSeedFromProject", () => {
  it("hydrates from a v2 timelineSpec", () => {
    const seed = chapterSeedFromProject({ timelineSpec: twoSceneTimeline });
    expect(seed.sceneBoundaries).toEqual([
      { title: "Hook", start: 0 },
      { title: "Proof", start: 3 },
    ]);
    expect(seed.durationSec).toBe(8);
  });

  it("does not invent emptyCanvasState Scene 1 from garbage timelineSpec", () => {
    expect(chapterSeedFromProject({ timelineSpec: { foo: 1 } })).toEqual({
      sceneBoundaries: [],
      durationSec: 0,
    });
    expect(chapterSeedFromProject({ timelineSpec: null })).toEqual({
      sceneBoundaries: [],
      durationSec: 0,
    });
  });

  it("falls back to script.scenes", () => {
    const seed = chapterSeedFromProject({
      script: {
        scenes: [
          { title: "Hook", duration: 4 },
          { title: "Proof", duration: 6 },
        ],
      },
    });
    expect(seed.sceneBoundaries).toEqual([
      { title: "Hook", start: 0 },
      { title: "Proof", start: 4 },
    ]);
    expect(seed.durationSec).toBe(10);
  });

  it("falls back to storyboard.scenes", () => {
    const seed = chapterSeedFromProject({
      storyboard: {
        scenes: [{ title: "Intro", type: "intro", duration: 3 }],
      },
    });
    expect(seed.sceneBoundaries).toEqual([{ title: "Intro", start: 0 }]);
    expect(seed.durationSec).toBe(3);
  });

  it("prefers timelineSpec over script and storyboard", () => {
    const seed = chapterSeedFromProject({
      timelineSpec: twoSceneTimeline,
      script: { scenes: [{ title: "Ignored", duration: 99 }] },
      storyboard: { scenes: [{ title: "Also ignored", duration: 1 }] },
    });
    expect(seed.sceneBoundaries.map((b) => b.title)).toEqual(["Hook", "Proof"]);
  });

  it("uses script over storyboard when timeline is missing", () => {
    const seed = chapterSeedFromProject({
      script: { scenes: [{ title: "From script", duration: 2 }] },
      storyboard: { scenes: [{ title: "From board", duration: 9 }] },
    });
    expect(seed.sceneBoundaries).toEqual([{ title: "From script", start: 0 }]);
  });
});

describe("hasSeedSource / looksLikeTimeline", () => {
  it("recognises a real timeline", () => {
    expect(looksLikeTimeline(twoSceneTimeline)).toBe(true);
    expect(looksLikeTimeline({ tracks: [] })).toBe(false);
    expect(looksLikeTimeline(null)).toBe(false);
  });

  it("is true when any seed shape is present", () => {
    expect(hasSeedSource({ timelineSpec: twoSceneTimeline })).toBe(true);
    expect(hasSeedSource({ script: { scenes: [{ title: "A" }] } })).toBe(true);
    expect(hasSeedSource({ storyboard: { scenes: [{ title: "A" }] } })).toBe(true);
    expect(hasSeedSource({})).toBe(false);
  });
});

describe("formatSceneTimestamp", () => {
  it("formats mm:ss and h:mm:ss", () => {
    expect(formatSceneTimestamp(0)).toBe("0:00");
    expect(formatSceneTimestamp(65)).toBe("1:05");
    expect(formatSceneTimestamp(3661)).toBe("1:01:01");
  });
});
