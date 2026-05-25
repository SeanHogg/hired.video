/**
 * Tests for `runtimeStatePayload` — pins the per-mediaKind save-draft
 * payload contract:
 *   - Timeline-authoring kinds (video / podcast / voice / comic) emit
 *     `{ kind: "nle", timelineSpec }`.
 *   - Non-Timeline kinds (image / animation / game) emit `{ kind:
 *     "scene", <runtimeState>: <snapshot value> }` when their
 *     snapshot is populated; otherwise just `{ kind: "scene" }`.
 *   - Empty snapshots don't leak fields across kinds.
 */

import { describe, expect, it } from "vitest";
import { runtimeStatePayload } from "../runtime-state-payload";
import { emptyCanvasState } from "../canvas-state";
import { createBlankImageState } from "@shared/image-state";
import { createBlankAnimationState } from "@shared/animation-state";
import { emptyGameState } from "@shared/game-state";

function snapshot(opts: Partial<Parameters<typeof runtimeStatePayload>[1]> = {}) {
  return {
    canvasState: opts.canvasState ?? emptyCanvasState(),
    imageState: opts.imageState ?? null,
    animationState: opts.animationState ?? null,
    gameState: opts.gameState ?? null,
    cadState: opts.cadState ?? null,
  };
}

describe("runtimeStatePayload", () => {
  it("emits `kind: 'nle'` + timelineSpec for video kind", () => {
    const slice = runtimeStatePayload("video", snapshot());
    expect(slice.kind).toBe("nle");
    expect(slice.timelineSpec).toBeDefined();
    expect(slice.imageState).toBeUndefined();
    expect(slice.animationState).toBeUndefined();
    expect(slice.gameState).toBeUndefined();
  });

  it("emits `kind: 'nle'` + timelineSpec for podcast / voice / comic kinds", () => {
    for (const k of ["podcast", "voice", "comic"] as const) {
      const slice = runtimeStatePayload(k, snapshot());
      expect(slice.kind).toBe("nle");
      expect(slice.timelineSpec).toBeDefined();
    }
  });

  it("emits `kind: 'scene'` + imageState when image kind + snapshot populated", () => {
    const img = createBlankImageState();
    const slice = runtimeStatePayload("image", snapshot({ imageState: img }));
    expect(slice.kind).toBe("scene");
    expect(slice.imageState).toBe(img);
    expect(slice.timelineSpec).toBeUndefined();
    expect(slice.animationState).toBeUndefined();
    expect(slice.gameState).toBeUndefined();
  });

  it("emits just `kind: 'scene'` when image kind + snapshot is null (pre-hydration)", () => {
    const slice = runtimeStatePayload("image", snapshot());
    expect(slice.kind).toBe("scene");
    expect(slice.imageState).toBeUndefined();
  });

  it("emits `kind: 'scene'` + animationState when animation kind + snapshot populated", () => {
    const anim = createBlankAnimationState();
    const slice = runtimeStatePayload("animation", snapshot({ animationState: anim }));
    expect(slice.kind).toBe("scene");
    expect(slice.animationState).toBe(anim);
    expect(slice.timelineSpec).toBeUndefined();
    expect(slice.imageState).toBeUndefined();
  });

  it("emits `kind: 'scene'` + gameState when game kind + snapshot populated", () => {
    const game = emptyGameState();
    const slice = runtimeStatePayload("game", snapshot({ gameState: game }));
    expect(slice.kind).toBe("scene");
    expect(slice.gameState).toBe(game);
    expect(slice.timelineSpec).toBeUndefined();
  });

  it("doesn't leak fields across kinds — a populated imageState in the snapshot doesn't end up in a video payload", () => {
    const img = createBlankImageState();
    const slice = runtimeStatePayload("video", snapshot({ imageState: img }));
    expect(slice.imageState).toBeUndefined();
    expect(slice.timelineSpec).toBeDefined();
  });
});
