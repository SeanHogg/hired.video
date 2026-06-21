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

describe("voiceover narration round-trip (#2006)", () => {
  it("does NOT emit an A2 audio clip for a pending (no-url) narration placeholder", () => {
    const base = emptyCanvasState();
    const scene = { ...emptyScene("Hook"), durationSeconds: 4, widgets: [] };
    const state: CanvasState = {
      ...base,
      scenes: [scene],
      voiceovers: [
        { id: "vo-1", url: "", text: "Stop scrolling.", durationSeconds: 4, anchorSceneId: scene.id, label: "Narration" },
      ],
    };
    const a2 = canvasStateToTimeline(state).tracks.find((t) => t.id === "a2");
    expect(a2?.clips ?? []).toHaveLength(0);
  });

  it("preserves a pending narration script through emit → hydrate", () => {
    const base = emptyCanvasState();
    const scene = { ...emptyScene("Hook"), durationSeconds: 4, widgets: [] };
    const state: CanvasState = {
      ...base,
      scenes: [scene],
      voiceovers: [
        { id: "vo-1", url: "", text: "Stop scrolling — this changes hiring.", durationSeconds: 4, anchorSceneId: scene.id, label: "Narration — Hook" },
      ],
    };
    const round = timelineToCanvasState(canvasStateToTimeline(state));
    expect(round.voiceovers).toHaveLength(1);
    expect(round.voiceovers[0]).toMatchObject({
      url: "",
      text: "Stop scrolling — this changes hiring.",
      anchorSceneId: round.scenes[0].id,
    });
  });

  it("keeps the source script on a synthesised (with-url) clip too", () => {
    const base = emptyCanvasState();
    const scene = { ...emptyScene("Hook"), durationSeconds: 4, widgets: [] };
    const state: CanvasState = {
      ...base,
      scenes: [scene],
      voiceovers: [
        { id: "vo-1", url: "https://cdn/n.wav", text: "Voiced line.", durationSeconds: 4, anchorSceneId: scene.id, label: "Narration" },
      ],
    };
    const round = timelineToCanvasState(canvasStateToTimeline(state));
    const vo = round.voiceovers.find((v) => v.url === "https://cdn/n.wav");
    expect(vo?.text).toBe("Voiced line.");
  });
});

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

  it("dedupes by clip.id when a project has BOTH v2 clips and widget-<id> tracks", () => {
    // Transition-window layered saves can leave a timeline_spec carrying
    // both shapes simultaneously: a v2 track with all widget clips AND
    // per-widget `widget-<id>` tracks pointing at the same widget ids.
    // Without dedup the reader paints every widget twice (the duplicate
    // headings + stray decorative shapes the user saw on the public
    // watch page). v2 entries win order (explicit post-#832 save) and
    // legacy widget-* duplicates are dropped.
    const dual: Timeline = {
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
          gain: 1, pan: 0, muted: false, solo: false, locked: false,
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
        {
          id: "v2",
          kind: "video",
          label: "Widgets",
          gain: 1, pan: 0, muted: false, solo: false, locked: false,
          clips: [
            {
              id: "alpha",
              sourceId: "",
              startFrame: 0,
              durationFrames: 60,
              sourceInFrame: 0,
              effects: [
                { kind: "canvas-v2:text", params: { x: 0.1, y: 0.1, width: 0.3, height: 0.1, text: "alpha", z: 1 } },
              ],
            },
          ],
        },
        // Same clip id "alpha" reappears in a legacy widget-* track.
        {
          id: "widget-alpha",
          kind: "video",
          label: "text",
          gain: 1, pan: 0, muted: false, solo: false, locked: false,
          clips: [
            {
              id: "alpha",
              sourceId: "",
              startFrame: 0,
              durationFrames: 60,
              sourceInFrame: 0,
              effects: [
                { kind: "canvas-v2:text", params: { x: 0.1, y: 0.1, width: 0.3, height: 0.1, text: "alpha", z: 1 } },
              ],
            },
          ],
        },
      ],
      markers: [],
    };
    const restored = timelineToCanvasState(dual);
    expect(restored.scenes).toHaveLength(1);
    // Only ONE widget surfaces despite "alpha" appearing on both tracks.
    expect(restored.scenes[0].widgets.map((w) => w.id)).toEqual(["alpha"]);
  });

  // ─── Comic widget round-trip (#938) ──────────────────────────────────────
  //
  // Regression guard against the bug found in the post-#938 audit: the
  // emit-side gained cases for the 3 new widget kinds (speech-bubble /
  // caption-box / sfx-burst) but the parse-side did not, so any saved
  // comic project loaded with empty pages on public view + on re-open.
  // These tests fail loudly if either side regresses.

  it("round-trips a speech-bubble widget verbatim", () => {
    const bubble = defaultWidget("speech-bubble");
    if (bubble.params.kind !== "speech-bubble") throw new Error("setup");
    bubble.params.data.text = "I can do this.";
    bubble.params.data.shape = "thought";
    bubble.params.data.tail = { anchorX: 0.3, anchorY: 0.55 };
    bubble.params.data.bgColor = "#ffffff";
    bubble.params.data.strokeColor = "#000000";
    bubble.params.data.strokeWidth = 4;
    bubble.params.data.fontPx = 24;
    bubble.params.data.color = "#0a0a0a";

    const state = stateWithWidgets([bubble]);
    const timeline = canvasStateToTimeline(state);
    const restored = timelineToCanvasState(timeline);
    expect(restored.scenes).toHaveLength(1);
    expect(restored.scenes[0].widgets).toHaveLength(1);
    const w = restored.scenes[0].widgets[0];
    expect(w.kind).toBe("speech-bubble");
    if (w.params.kind !== "speech-bubble") throw new Error("kind narrow");
    expect(w.params.data.text).toBe("I can do this.");
    expect(w.params.data.shape).toBe("thought");
    expect(w.params.data.tail).toEqual({ anchorX: 0.3, anchorY: 0.55 });
    expect(w.params.data.bgColor).toBe("#ffffff");
    expect(w.params.data.strokeColor).toBe("#000000");
    expect(w.params.data.strokeWidth).toBe(4);
    expect(w.params.data.fontPx).toBe(24);
  });

  it("round-trips a tail-less speech-bubble (caption-style float)", () => {
    // Tail can be null when the bubble is used as a free-floating
    // narration ribbon. Persistence must preserve the null — the
    // editor's "remove tail" affordance writes it.
    const bubble = defaultWidget("speech-bubble");
    if (bubble.params.kind !== "speech-bubble") throw new Error("setup");
    bubble.params.data.tail = null;
    bubble.params.data.text = "Years later…";
    const state = stateWithWidgets([bubble]);
    const restored = timelineToCanvasState(canvasStateToTimeline(state));
    const w = restored.scenes[0].widgets[0];
    if (w.params.kind !== "speech-bubble") throw new Error("kind narrow");
    expect(w.params.data.tail).toBeNull();
    expect(w.params.data.text).toBe("Years later…");
  });

  it("round-trips a caption-box widget verbatim", () => {
    const cap = defaultWidget("caption-box");
    if (cap.params.kind !== "caption-box") throw new Error("setup");
    cap.params.data.text = "MEANWHILE…";
    cap.params.data.italic = true;
    cap.params.data.bgColor = "#fef3c7";
    cap.params.data.color = "#451a03";
    cap.params.data.strokeColor = "#451a03";
    cap.params.data.strokeWidth = 3;
    cap.params.data.fontPx = 20;

    const state = stateWithWidgets([cap]);
    const restored = timelineToCanvasState(canvasStateToTimeline(state));
    const w = restored.scenes[0].widgets[0];
    expect(w.kind).toBe("caption-box");
    if (w.params.kind !== "caption-box") throw new Error("kind narrow");
    expect(w.params.data.text).toBe("MEANWHILE…");
    expect(w.params.data.italic).toBe(true);
    expect(w.params.data.bgColor).toBe("#fef3c7");
    expect(w.params.data.strokeWidth).toBe(3);
    expect(w.params.data.fontPx).toBe(20);
  });

  it("round-trips an sfx-burst widget verbatim", () => {
    const sfx = defaultWidget("sfx-burst");
    if (sfx.params.kind !== "sfx-burst") throw new Error("setup");
    sfx.params.data.text = "DOKI!";
    sfx.params.data.shape = "jagged";
    sfx.params.data.bgColor = "#ec4899";
    sfx.params.data.color = "#fff1f2";
    sfx.params.data.strokeWidth = 5;
    sfx.params.data.fontPx = 40;
    sfx.position.rotation = -18;

    const state = stateWithWidgets([sfx]);
    const restored = timelineToCanvasState(canvasStateToTimeline(state));
    const w = restored.scenes[0].widgets[0];
    expect(w.kind).toBe("sfx-burst");
    if (w.params.kind !== "sfx-burst") throw new Error("kind narrow");
    expect(w.params.data.text).toBe("DOKI!");
    expect(w.params.data.shape).toBe("jagged");
    expect(w.params.data.bgColor).toBe("#ec4899");
    expect(w.params.data.strokeWidth).toBe(5);
    expect(w.params.data.fontPx).toBe(40);
    expect(w.position.rotation).toBe(-18);
  });

  it("falls back to safe defaults on a malformed comic widget blob", () => {
    // Parse path must not crash when a malformed / partial blob lands —
    // every field has a type-guarded default. The case study is a
    // saved comic with stripped-down params (e.g. a legacy migration
    // dropped fields). The widget should still hydrate with usable
    // fallbacks so the canvas isn't empty.
    const stale: Timeline = {
      schemaVersion: 1,
      fps: 24,
      width: 1080,
      height: 1920,
      backgroundColor: "#ffffff",
      tracks: [
        {
          id: "v1",
          kind: "video",
          label: "Background",
          gain: 1, pan: 0, muted: false, solo: false, locked: false,
          clips: [
            { id: "bg-1", sourceId: "", startFrame: 0, durationFrames: 60, sourceInFrame: 0, effects: [] },
          ],
        },
        {
          id: "v2",
          kind: "video",
          label: "Widgets",
          gain: 1, pan: 0, muted: false, solo: false, locked: false,
          clips: [
            {
              id: "bubble-1",
              sourceId: "",
              startFrame: 0,
              durationFrames: 60,
              sourceInFrame: 0,
              effects: [
                { kind: "canvas-v2:speech-bubble", params: { x: 0.5, y: 0.2, width: 0.4, height: 0.2 } },
              ],
            },
            {
              id: "sfx-1",
              sourceId: "",
              startFrame: 0,
              durationFrames: 60,
              sourceInFrame: 0,
              effects: [
                { kind: "canvas-v2:sfx-burst", params: { x: 0.6, y: 0.5, width: 0.2, height: 0.2, shape: "nonsense" } },
              ],
            },
          ],
        },
        { id: "v3", kind: "video", label: "Scene FX",  gain: 1, pan: 0, muted: false, solo: false, locked: false, clips: [] },
        { id: "a1", kind: "audio", label: "Music",     gain: 1, pan: 0, muted: false, solo: false, locked: false, clips: [] },
        { id: "a2", kind: "audio", label: "Voiceover", gain: 1, pan: 0, muted: false, solo: false, locked: false, clips: [] },
      ],
      markers: [],
    };
    const restored = timelineToCanvasState(stale);
    expect(restored.scenes).toHaveLength(1);
    const widgets = restored.scenes[0].widgets;
    expect(widgets).toHaveLength(2);
    const bubble = widgets.find((w) => w.kind === "speech-bubble");
    const sfx = widgets.find((w) => w.kind === "sfx-burst");
    if (!bubble || bubble.params.kind !== "speech-bubble") throw new Error("bubble lost");
    if (!sfx || sfx.params.kind !== "sfx-burst") throw new Error("sfx lost");
    // Defaults applied where fields were missing.
    expect(bubble.params.data.shape).toBe("speech");
    expect(bubble.params.data.strokeWidth).toBeGreaterThan(0);
    expect(bubble.params.data.tail).toBeNull(); // tail anchors missing → null
    // Unknown shape value falls back to "star".
    expect(sfx.params.data.shape).toBe("star");
  });

  it("normalises pre-unification `widget-<id>` tracks back into the v2 shape on read", () => {
    // Simulate a Timeline produced by the post-#832, pre-unification
    // emit: one track per widget. The reader is the normalisation seam
    // — it has to fold these back into widgets so projects authored
    // during that window still hydrate (migration 0096 cleans the
    // storage layer permanently, but the JS reader covers the window
    // before it runs in any given environment).
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
        // Two widget-<id> tracks — order on disk is deliberately not
        // z-sorted so the reader's z-merge ordering is exercised.
        {
          id: "widget-top",
          kind: "video",
          label: "text",
          gain: 1, pan: 0, muted: false, solo: false, locked: false,
          clips: [
            {
              id: "top",
              sourceId: "",
              startFrame: 0,
              durationFrames: 60,
              sourceInFrame: 0,
              effects: [
                { kind: "canvas-v2:text", params: { x: 0.1, y: 0.1, width: 0.3, height: 0.1, text: "top", z: 5 } },
              ],
            },
          ],
        },
        {
          id: "widget-bottom",
          kind: "video",
          label: "text",
          gain: 1, pan: 0, muted: false, solo: false, locked: false,
          clips: [
            {
              id: "bottom",
              sourceId: "",
              startFrame: 0,
              durationFrames: 60,
              sourceInFrame: 0,
              effects: [
                { kind: "canvas-v2:text", params: { x: 0.1, y: 0.2, width: 0.3, height: 0.1, text: "bottom", z: 1 } },
              ],
            },
          ],
        },
      ],
      markers: [],
    };
    const restored = timelineToCanvasState(stale);
    expect(restored.scenes).toHaveLength(1);
    // Both widgets surface, lower-z drawn first → array order [bottom, top].
    expect(restored.scenes[0].widgets.map((w) => w.id)).toEqual(["bottom", "top"]);
  });
});

describe("canvasStateToTimeline — stale/partial draft tolerance (#2212 crash fix)", () => {
  // Regression: a draft persisted by an OLDER app shape (before the
  // `voiceovers[]` field existed) rehydrated from localStorage as a CanvasState
  // with no `voiceovers` key. The emitter does `for (const vo of
  // state.voiceovers)`, which threw "voiceovers is not iterable" and crashed the
  // editor error boundary — surfaced once anonymous visitors began landing on
  // `/studio/new` with stale localStorage. The emitter must normalize defensively.
  it("does not throw when voiceovers is missing", () => {
    const base = emptyCanvasState();
    const partial = { ...base, scenes: [emptyScene("Scene 1")] } as Partial<CanvasState> &
      Record<string, unknown>;
    delete partial.voiceovers;
    expect(() => canvasStateToTimeline(partial as CanvasState)).not.toThrow();
  });

  it("does not throw when scenes is missing", () => {
    const base = emptyCanvasState();
    const partial = { ...base } as Partial<CanvasState> & Record<string, unknown>;
    delete partial.scenes;
    expect(() => canvasStateToTimeline(partial as CanvasState)).not.toThrow();
  });

  it("treats a missing voiceovers field as an empty voiceover track", () => {
    const base = emptyCanvasState();
    const partial = { ...base, scenes: [emptyScene("Scene 1")] } as Partial<CanvasState> &
      Record<string, unknown>;
    delete partial.voiceovers;
    const timeline = canvasStateToTimeline(partial as CanvasState);
    const a2 = timeline.tracks.find((t) => t.id === "a2");
    // a2 (voiceover) track exists but carries no clips — same as an explicit [].
    expect(a2?.clips ?? []).toEqual([]);
  });
});
