/**
 * Timeline-emit unit tests.
 *
 * The studio's persistence pipeline is `CanvasState → Timeline JSON →
 * (DB) → Timeline JSON → CanvasState`. These tests pin the contract that
 * the persisted shape is the unified five-track layout:
 *   v1  background (one clip per scene)
 *   v2  widget overlays (every widget across every scene, z-sorted)
 *   v3  scene-post effects (sourceless clips, one per scene that has effects)
 *   a1  music
 *   a2  voiceover
 *
 * No legacy/new branching. No `widget-<id>` tracks. The render side
 * (`activeClipsAt`) is what makes overlapping widgets on the shared
 * v2 track render correctly — see frame-renderer.test.ts for that half.
 *
 * Run: vitest run lib/studio/editor-v2/__tests__/timeline-emit.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  canvasStateToTimeline,
  timelineToCanvasState,
} from "@/lib/studio/editor-v2/timeline-emit";
import {
  defaultWidget,
  emptyCanvasState,
  emptyScene,
  type CanvasState,
  type Widget,
} from "@/lib/studio/editor-v2/canvas-state";
import type { Timeline } from "@shared/timeline";

function withZ(widget: Widget, z: number): Widget {
  return { ...widget, position: { ...widget.position, z } };
}

function stateWithWidgets(widgets: Widget[]): CanvasState {
  const base = emptyCanvasState();
  return {
    ...base,
    scenes: [
      {
        ...emptyScene("Scene 1"),
        durationSeconds: 5,
        widgets,
      },
    ],
  };
}

describe("canvasStateToTimeline", () => {
  it("emits the unified five-track shape with v2 as the widget overlay track", () => {
    const state = stateWithWidgets([defaultWidget("text")]);
    const timeline = canvasStateToTimeline(state);
    const ids = timeline.tracks.map((t) => t.id);
    expect(ids).toEqual(["v1", "v2", "v3", "a1", "a2"]);
  });

  it("does not emit any `widget-<id>` tracks", () => {
    const state = stateWithWidgets([
      defaultWidget("text"),
      defaultWidget("image"),
      defaultWidget("heading"),
    ]);
    const timeline = canvasStateToTimeline(state);
    const widgetTracks = timeline.tracks.filter((t) =>
      t.id.startsWith("widget-"),
    );
    expect(widgetTracks).toEqual([]);
  });

  it("pools every widget across every scene into a single v2 track", () => {
    const base = emptyCanvasState();
    const state: CanvasState = {
      ...base,
      scenes: [
        { ...emptyScene("Scene 1"), durationSeconds: 3, widgets: [defaultWidget("text"), defaultWidget("image")] },
        { ...emptyScene("Scene 2"), durationSeconds: 4, widgets: [defaultWidget("heading")] },
      ],
    };
    const timeline = canvasStateToTimeline(state);
    const v2 = timeline.tracks.find((t) => t.id === "v2");
    expect(v2).toBeDefined();
    expect(v2!.clips).toHaveLength(3);
  });

  it("sorts v2 clips globally by widget z so array order = paint order", () => {
    const top = withZ({ ...defaultWidget("text"), id: "top" }, 5);
    const mid = withZ({ ...defaultWidget("text"), id: "mid" }, 2);
    const bot = withZ({ ...defaultWidget("text"), id: "bot" }, 1);
    // Authored in a deliberately not-pre-sorted order so we know the
    // emit is what's sorting.
    const state = stateWithWidgets([top, bot, mid]);
    const timeline = canvasStateToTimeline(state);
    const v2 = timeline.tracks.find((t) => t.id === "v2")!;
    expect(v2.clips.map((c) => c.id)).toEqual(["bot", "mid", "top"]);
  });

  it("emits a v3 clip only for scenes that carry post-effects", () => {
    const base = emptyCanvasState();
    const state: CanvasState = {
      ...base,
      scenes: [
        { ...emptyScene("A"), durationSeconds: 3, widgets: [], effects: [{ kind: "blur", params: { radius: 4 } }] },
        { ...emptyScene("B"), durationSeconds: 3, widgets: [] },
      ],
    };
    const timeline = canvasStateToTimeline(state);
    const v3 = timeline.tracks.find((t) => t.id === "v3")!;
    expect(v3.clips).toHaveLength(1);
  });
});

describe("timelineToCanvasState", () => {
  it("hydrates widgets from the v2 track", () => {
    const text = defaultWidget("text");
    const image = defaultWidget("image");
    const state = stateWithWidgets([text, image]);
    const timeline = canvasStateToTimeline(state);
    const restored = timelineToCanvasState(timeline);
    expect(restored.scenes).toHaveLength(1);
    expect(restored.scenes[0].widgets.map((w) => w.id).sort()).toEqual(
      [text.id, image.id].sort(),
    );
  });

  it("returns a default canvas state for malformed input", () => {
    // The reader is tolerant — non-Timeline blobs collapse to the same
    // default `emptyCanvasState()` the editor uses for a fresh project
    // so callers never see a thrown error. The seeded scene carries no
    // widgets.
    const restored = timelineToCanvasState({ tracks: "nope" } as unknown);
    expect(restored.scenes.length).toBeGreaterThan(0);
    expect(restored.scenes[0].widgets).toEqual([]);
  });

  it("buckets widgets back into the scene whose bg clip contains them", () => {
    const base = emptyCanvasState();
    const w1 = { ...defaultWidget("text"), id: "w1" };
    const w2 = { ...defaultWidget("text"), id: "w2" };
    const state: CanvasState = {
      ...base,
      scenes: [
        { ...emptyScene("A"), durationSeconds: 2, widgets: [w1] },
        { ...emptyScene("B"), durationSeconds: 2, widgets: [w2] },
      ],
    };
    const timeline = canvasStateToTimeline(state);
    const restored = timelineToCanvasState(timeline);
    expect(restored.scenes.map((s) => s.widgets.map((w) => w.id))).toEqual([
      ["w1"],
      ["w2"],
    ]);
  });
});

describe("canvasState ↔ Timeline round-trip", () => {
  it("preserves widget count and ids across a full round-trip", () => {
    const widgets = [
      withZ({ ...defaultWidget("text"), id: "t" }, 2),
      withZ({ ...defaultWidget("image"), id: "i" }, 1),
      withZ({ ...defaultWidget("heading"), id: "h" }, 3),
    ];
    const before = stateWithWidgets(widgets);
    const after = timelineToCanvasState(canvasStateToTimeline(before));
    const idsBefore = before.scenes.flatMap((s) => s.widgets.map((w) => w.id)).sort();
    const idsAfter = after.scenes.flatMap((s) => s.widgets.map((w) => w.id)).sort();
    expect(idsAfter).toEqual(idsBefore);
  });

  it("survives an external nest of widget-<id> tracks (pre-unification data)", () => {
    // Simulate a Timeline produced by the post-#832, pre-unification emit:
    // one track per widget. The unified reader doesn't look at these
    // tracks, but it MUST not crash — the migration is responsible for
    // converting persisted data to v2 before serving, but a stale cache
    // or a hand-edited blob shouldn't blow up the editor on load.
    const stale: Timeline = {
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
              id: "s1_bg",
              sourceId: "",
              startFrame: 0,
              durationFrames: 60,
              sourceInFrame: 0,
              effects: [
                { kind: "canvas-v2:background", params: { color: "#000000", sceneId: "s1" } },
              ],
            },
          ],
        },
        // Pre-unification per-widget track — ignored by the strict reader.
        {
          id: "widget-x",
          kind: "video",
          label: "text",
          gain: 1,
          pan: 0,
          muted: false,
          solo: false,
          locked: false,
          clips: [
            {
              id: "x",
              sourceId: "",
              startFrame: 0,
              durationFrames: 60,
              sourceInFrame: 0,
              effects: [
                { kind: "canvas-v2:text", params: { x: 0.1, y: 0.1, width: 0.3, height: 0.1, text: "x" } },
              ],
            },
          ],
        },
      ],
      markers: [],
    };
    expect(() => timelineToCanvasState(stale)).not.toThrow();
    const restored = timelineToCanvasState(stale);
    // The bg clip yields a scene with no widgets — that's fine. The
    // migration (drizzle/0096_…) is what makes widget-* tracks visible
    // by folding them into v2; this test pins the "doesn't crash"
    // contract for the pre-migration case.
    expect(restored.scenes).toHaveLength(1);
  });
});
