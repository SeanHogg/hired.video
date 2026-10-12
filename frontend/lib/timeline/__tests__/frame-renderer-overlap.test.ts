/**
 * frame-renderer overlap-handling unit tests.
 *
 * The renderer used to call `activeClipAt` (returns one clip per track
 * per frame). That made it impossible to share a track between multiple
 * simultaneous overlay widgets — every widget after the first was
 * silently dropped. The unified architecture pools every widget clip
 * onto a single `v2` track; the renderer iterates `activeClipsAt`
 * (every clip whose visible window contains the frame, in clip-array
 * order) so all overlapping widgets draw in z order.
 *
 * These tests pin that contract by mounting `renderTimelineFrame`
 * against a stub 2D context and recording the order of effect-applier
 * calls. A regression to single-clip-per-track would show as fewer
 * draws than active clips.
 *
 * Run: vitest run lib/timeline/__tests__/frame-renderer-overlap.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderTimelineFrame, createRendererState } from "@/lib/timeline/frame-renderer";
import { registerEffect, _resetRegistryForTests } from "@/lib/timeline/effects/registry";
import type { Timeline } from "@shared/timeline";

function stubContext() {
  const ctx = {
    fillStyle: "",
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  return ctx;
}

function stubCanvas(ctx: CanvasRenderingContext2D, w = 1920, h = 1080) {
  return {
    width: w,
    height: h,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

function makeTimeline(): Timeline {
  return {
    schemaVersion: 1,
    fps: 30,
    width: 1920,
    height: 1080,
    backgroundColor: "#000000",
    tracks: [
      {
        id: "v1",
        kind: "video",
        label: "Background",
        gain: 1,
        pan: 0,
        muted: false,
        solo: false,
        locked: false,
        clips: [
          {
            id: "bg",
            sourceId: "",
            startFrame: 0,
            durationFrames: 60,
            sourceInFrame: 0,
            effects: [
              { kind: "canvas-v2:background", params: { color: "#222222" } },
            ],
          },
        ],
      },
      {
        id: "v2",
        kind: "video",
        label: "Widgets",
        gain: 1,
        pan: 0,
        muted: false,
        solo: false,
        locked: false,
        // Three simultaneous widgets overlapping frame 10. Clip-array
        // order is the canonical paint order — the emit side (canvasState
        // ToTimeline) sorts by z before assembly so this list is in
        // bottom→top paint order.
        clips: [
          {
            id: "w-bottom",
            sourceId: "",
            startFrame: 0,
            durationFrames: 60,
            sourceInFrame: 0,
            effects: [
              { kind: "test:tag", params: { tag: "w-bottom" } },
            ],
          },
          {
            id: "w-mid",
            sourceId: "",
            startFrame: 0,
            durationFrames: 60,
            sourceInFrame: 0,
            effects: [
              { kind: "test:tag", params: { tag: "w-mid" } },
            ],
          },
          {
            id: "w-top",
            sourceId: "",
            startFrame: 0,
            durationFrames: 60,
            sourceInFrame: 0,
            effects: [
              { kind: "test:tag", params: { tag: "w-top" } },
            ],
          },
        ],
      },
    ],
    markers: [],
  };
}

beforeEach(() => {
  // Side-effect imports register the full canvas-v2 registry at module
  // load. Reset to a clean slate before each test so the stub `apply`
  // recorders we register below take over without colliding with the
  // production appliers (which expect real media + dimensions).
  _resetRegistryForTests();
});

describe("renderTimelineFrame — overlapping clips on a shared overlay track", () => {
  it("draws every active clip on the v2 widget track in clip-array order", async () => {
    const drawnTags: string[] = [];
    // Stub bg + tag effects so we can record paint order without
    // mounting the full canvas-v2 registry (which loads media etc.).
    registerEffect({
      kind: "canvas-v2:background",
      labelKey: "bg",
      category: "transform",
      defaults: {},
      apply() {
        drawnTags.push("bg");
      },
    });
    registerEffect({
      kind: "test:tag",
      labelKey: "tag",
      category: "transform",
      defaults: {},
      apply(effect) {
        const tag = effect.params.tag;
        if (typeof tag === "string") drawnTags.push(tag);
      },
    });

    const ctx = stubContext();
    const canvas = stubCanvas(ctx);
    const state = createRendererState({}, { useProxies: false });
    await renderTimelineFrame(canvas, makeTimeline(), state, 10);

    // bg first (v1 track), then all three widgets in clip-array order.
    // A regression to single-active-clip-per-track would show only
    // `["bg", "w-bottom"]` — w-mid and w-top would be silently dropped.
    expect(drawnTags).toEqual(["bg", "w-bottom", "w-mid", "w-top"]);
  });

  it("skips clips whose visible window doesn't contain the frame", async () => {
    const drawnTags: string[] = [];
    registerEffect({
      kind: "canvas-v2:background",
      labelKey: "bg",
      category: "transform",
      defaults: {},
      apply() {
        drawnTags.push("bg");
      },
    });
    registerEffect({
      kind: "test:tag",
      labelKey: "tag",
      category: "transform",
      defaults: {},
      apply(effect) {
        const tag = effect.params.tag;
        if (typeof tag === "string") drawnTags.push(tag);
      },
    });

    const timeline = makeTimeline();
    // First widget visible only in [0, 5); second visible [5, 60).
    timeline.tracks[1].clips[0].durationFrames = 5;
    timeline.tracks[1].clips[1].startFrame = 5;
    timeline.tracks[1].clips[1].durationFrames = 55;
    timeline.tracks[1].clips[2].startFrame = 5;
    timeline.tracks[1].clips[2].durationFrames = 55;

    const ctx = stubContext();
    const canvas = stubCanvas(ctx);
    const state = createRendererState({}, { useProxies: false });
    await renderTimelineFrame(canvas, timeline, state, 10);

    // Frame 10 is inside [5, 60) but outside [0, 5). Only w-mid + w-top draw.
    expect(drawnTags).toEqual(["bg", "w-mid", "w-top"]);
  });
});
