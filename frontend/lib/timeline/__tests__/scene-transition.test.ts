/**
 * Scene transitions (#570): the emitter (CanvasState → Timeline
 * `sceneTransitions`) and the compositor's window lookup.
 *
 * Run: vitest run lib/timeline/__tests__/scene-transition.test.ts
 */
import { describe, expect, it } from "vitest";
import { emptyCanvasState, emptyScene, type CanvasState, type Scene } from "@/lib/studio/editor-v2/canvas-state";
import { emitSceneTransitions } from "@/lib/studio/editor-v2/scene-transition-emit";
import { activeSceneTransition } from "@/lib/timeline/scene-transition";

function stateWith(scenes: Array<Partial<Scene>>, defaultTransition: CanvasState["defaultTransition"] = null): CanvasState {
  return {
    ...emptyCanvasState({ fps: 30 }),
    defaultTransition,
    scenes: scenes.map((s, i) => ({ ...emptyScene(`Scene ${i + 1}`), ...s })),
  };
}

describe("emitSceneTransitions", () => {
  it("maps presets onto compositor kinds at each boundary", () => {
    const state = stateWith([
      { durationSeconds: 4 },
      { durationSeconds: 3, transitionIn: "fade" },
      { durationSeconds: 5, transitionIn: "slide" },
      { durationSeconds: 2, transitionIn: "cinematic-fade" },
    ]);
    expect(emitSceneTransitions(state)).toEqual([
      { atFrame: 120, kind: "cross-dissolve", durationFrames: 15 },
      { atFrame: 210, kind: "slide", durationFrames: 15 },
      { atFrame: 360, kind: "fade-to-black", durationFrames: 15 },
    ]);
  });

  it("inherits the project default; a per-scene cut overrides it", () => {
    const state = stateWith(
      [{ durationSeconds: 2 }, { durationSeconds: 2 }, { durationSeconds: 2, transitionIn: "cut" }],
      "fade",
    );
    expect(emitSceneTransitions(state)).toEqual([{ atFrame: 60, kind: "cross-dissolve", durationFrames: 15 }]);
  });

  it("never takes more than half of a short neighbouring scene", () => {
    const state = stateWith([{ durationSeconds: 0.4 }, { durationSeconds: 3, transitionIn: "fade" }]);
    // 0.4 s = 12 frames → at most 6.
    expect(emitSceneTransitions(state)).toEqual([{ atFrame: 12, kind: "cross-dissolve", durationFrames: 6 }]);
  });

  it("drops a transition with no room and emits nothing for one scene or no transitions", () => {
    expect(emitSceneTransitions(stateWith([{ durationSeconds: 0.05 }, { durationSeconds: 3, transitionIn: "fade" }]))).toEqual([]);
    expect(emitSceneTransitions(stateWith([{ durationSeconds: 3, transitionIn: "fade" }]))).toEqual([]);
    expect(emitSceneTransitions(stateWith([{}, {}]))).toEqual([]);
  });

  it("tolerates a legacy draft without defaultTransition", () => {
    const legacy = { ...stateWith([{}, {}]), defaultTransition: undefined } as unknown as CanvasState;
    expect(emitSceneTransitions(legacy)).toEqual([]);
  });
});

describe("activeSceneTransition", () => {
  const timeline = {
    sceneTransitions: [
      { atFrame: 100, kind: "cross-dissolve" as const, durationFrames: 10 },
      { atFrame: 200, kind: "fade-to-black" as const, durationFrames: 10 },
    ],
  };

  it("dissolve covers the frames before the boundary", () => {
    expect(activeSceneTransition(timeline, 89)).toBeNull();
    expect(activeSceneTransition(timeline, 90)?.progress).toBe(0);
    expect(activeSceneTransition(timeline, 95)?.progress).toBeCloseTo(0.5);
    expect(activeSceneTransition(timeline, 99)?.progress).toBeCloseTo(0.9);
    expect(activeSceneTransition(timeline, 100)).toBeNull();
  });

  it("fade-to-black is centred on the boundary and peaks there", () => {
    expect(activeSceneTransition(timeline, 195)).toBeNull();
    expect(activeSceneTransition(timeline, 196)?.progress).toBeCloseTo(0.2);
    expect(activeSceneTransition(timeline, 200)?.progress).toBe(1);
    expect(activeSceneTransition(timeline, 204)?.progress).toBeCloseTo(0.2);
    expect(activeSceneTransition(timeline, 205)).toBeNull();
  });

  it("ignores zero-length entries and timelines without transitions", () => {
    expect(activeSceneTransition({ sceneTransitions: [{ atFrame: 10, kind: "slide", durationFrames: 0 }] }, 9)).toBeNull();
    expect(activeSceneTransition({}, 0)).toBeNull();
  });
});
