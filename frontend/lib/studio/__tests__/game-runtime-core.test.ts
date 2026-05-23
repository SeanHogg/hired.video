/**
 * Runtime-core unit tests — locks the SINGLE-SOURCE behavior interpreter
 * that drives BOTH the editor's `<GameStage>` and the exported HTML5
 * bundle's `runtime.js`. A regression here breaks both surfaces in
 * lockstep.
 *
 * The contract: pure functions that take primitives + GameState shapes
 * and mutate a `RuntimeSprite` in place. No DOM dependencies in the
 * dispatch path itself (only `runGame` touches DOM, tested separately).
 *
 * Run: vitest run lib/studio/__tests__/game-runtime-core.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  findStartLevel,
  tintForBehavior,
  updateSprite,
} from "@/lib/studio/game/runtime-core.js";
import type { RuntimeSprite } from "@/lib/studio/game/runtime-core.js";
import { emptyGameState, type GameSprite } from "@shared/game-state";

// ─── Test fixtures ────────────────────────────────────────────────────────

function makeSprite(overrides: Partial<GameSprite> = {}): GameSprite {
  return {
    id: "s1",
    assetId: "placeholder:tile",
    x: 100,
    y: 200,
    width: 32,
    height: 32,
    behavior: null,
    params: {},
    ...overrides,
  };
}

function makeRuntimeSprite(source: GameSprite): RuntimeSprite {
  // Mirror the shape `runGame.mountLevel` produces — keeping every
  // field initialised so the behavior dispatcher + script interpreter
  // + animation interpreter all read defined values.
  return {
    source,
    x: source.x,
    y: source.y,
    width: source.width,
    height: source.height,
    vy: 0,
    flipped: false,
    picked: false,
    visible: true,
    alpha: 1,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    mountTs: 0,
    message: null,
    messageUntilTs: 0,
    hasFiredOnMount: false,
    everySecondsLastFiredTs: {},
  };
}

// ─── findStartLevel ───────────────────────────────────────────────────────

describe("findStartLevel", () => {
  it("returns null when no levels exist", () => {
    const state = emptyGameState();
    state.levels = [];
    expect(findStartLevel(state)).toBeNull();
  });

  it("returns the level whose id matches startLevelId", () => {
    const state = emptyGameState();
    state.levels = [
      { id: "menu", label: "Menu", backgroundColor: "#000", sprites: [] },
      { id: "play", label: "Play", backgroundColor: "#fff", sprites: [] },
    ];
    state.startLevelId = "play";
    expect(findStartLevel(state)?.id).toBe("play");
  });

  it("falls back to levels[0] when startLevelId is corrupted", () => {
    // Defensive — the editor shouldn't write a dangling reference, but
    // legacy / hand-edited rows might. Players still get a level.
    const state = emptyGameState();
    state.levels = [
      { id: "real", label: "Real", backgroundColor: "#000", sprites: [] },
    ];
    state.startLevelId = "ghost-doesnt-exist";
    expect(findStartLevel(state)?.id).toBe("real");
  });
});

// ─── tintForBehavior ──────────────────────────────────────────────────────

describe("tintForBehavior", () => {
  it("returns the documented palette for each known behavior", () => {
    expect(tintForBehavior("platformer-player").fill).toBe("#fbbf24");
    expect(tintForBehavior("scroll-left").fill).toBe("#ef4444");
    expect(tintForBehavior("static").fill).toBe("#475569");
    expect(tintForBehavior("quiz-answer").fill).toBe("#6366f1");
    expect(tintForBehavior("memory-card").fill).toBe("#10b981");
  });

  it("falls through unknown behaviors to a neutral grey", () => {
    // The runtime must tolerate future behavior ids it doesn't know
    // — older bundled exports should still render placeholder
    // rectangles for them rather than crashing.
    expect(tintForBehavior("future-behavior-x").fill).toBe("#64748b");
    expect(tintForBehavior(null).fill).toBe("#64748b");
  });
});

// ─── updateSprite ─────────────────────────────────────────────────────────

describe("updateSprite — platformer-player", () => {
  it("moves left when ArrowLeft is held", () => {
    const sprite = makeRuntimeSprite(makeSprite({ behavior: "platformer-player" }));
    const keys = new Set(["ArrowLeft"]);
    updateSprite(sprite, 0.1, keys, 1280);
    // dt=0.1, runSpeed=200 default → 20px left
    expect(sprite.x).toBeCloseTo(100 - 20);
  });

  it("moves right when ArrowRight is held", () => {
    const sprite = makeRuntimeSprite(makeSprite({ behavior: "platformer-player" }));
    updateSprite(sprite, 0.1, new Set(["ArrowRight"]), 1280);
    expect(sprite.x).toBeCloseTo(100 + 20);
  });

  it("supports WASD as well as arrow keys", () => {
    const left = makeRuntimeSprite(makeSprite({ behavior: "platformer-player" }));
    updateSprite(left, 0.1, new Set(["a"]), 1280);
    expect(left.x).toBeLessThan(100);

    const right = makeRuntimeSprite(makeSprite({ behavior: "platformer-player" }));
    updateSprite(right, 0.1, new Set(["d"]), 1280);
    expect(right.x).toBeGreaterThan(100);
  });

  it("applies gravity each tick when airborne", () => {
    const sprite = makeRuntimeSprite(makeSprite({ behavior: "platformer-player", y: 200 }));
    // Lift off the ground so gravity can act without clamping.
    sprite.y = 100;
    sprite.vy = 0;
    updateSprite(sprite, 0.1, new Set(), 1280);
    // gravity 1400 * 0.1 = 140 added to vy
    expect(sprite.vy).toBeCloseTo(140);
    // y = 100 + 140 * 0.1 = 114
    expect(sprite.y).toBeCloseTo(114);
  });

  it("jumps from the ground when ArrowUp is held", () => {
    const sprite = makeRuntimeSprite(makeSprite({ behavior: "platformer-player", y: 200 }));
    expect(sprite.y).toBe(200); // on ground
    updateSprite(sprite, 0.016, new Set(["ArrowUp"]), 1280);
    // vy gets -500 (jumpPower default) then gravity adds ~22 → still strongly negative
    expect(sprite.vy).toBeLessThan(-400);
  });

  it("does not double-jump while airborne", () => {
    const sprite = makeRuntimeSprite(makeSprite({ behavior: "platformer-player", y: 200 }));
    sprite.y = 50; // airborne
    sprite.vy = 100; // falling
    updateSprite(sprite, 0.016, new Set(["ArrowUp"]), 1280);
    // vy not reset to -jumpPower because not on ground
    expect(sprite.vy).toBeGreaterThan(0);
  });

  it("clamps to ground when falling past authored Y", () => {
    const sprite = makeRuntimeSprite(makeSprite({ behavior: "platformer-player", y: 200 }));
    sprite.y = 199;
    sprite.vy = 5000; // strong downward
    updateSprite(sprite, 0.1, new Set(), 1280);
    expect(sprite.y).toBe(200); // clamped to source.y
    expect(sprite.vy).toBe(0); // zeroed on landing
  });

  it("honors per-sprite runSpeed override", () => {
    const sprite = makeRuntimeSprite(
      makeSprite({ behavior: "platformer-player", params: { runSpeed: 400 } }),
    );
    updateSprite(sprite, 0.1, new Set(["ArrowRight"]), 1280);
    expect(sprite.x).toBeCloseTo(100 + 40); // 400 * 0.1
  });
});

describe("updateSprite — scroll-left", () => {
  it("moves left at the configured speed", () => {
    const sprite = makeRuntimeSprite(
      makeSprite({ behavior: "scroll-left", params: { speed: 300 } }),
    );
    updateSprite(sprite, 0.1, new Set(), 1280);
    expect(sprite.x).toBeCloseTo(100 - 30);
  });

  it("wraps to worldWidth once it scrolls fully off-screen", () => {
    const sprite = makeRuntimeSprite(
      makeSprite({ behavior: "scroll-left", x: -50, width: 32 }),
    );
    // x=-50 + width=32 = -18 → off-screen left
    updateSprite(sprite, 0, new Set(), 1280);
    expect(sprite.x).toBe(1280); // wrapped to worldWidth
  });
});

describe("updateSprite — passive behaviors", () => {
  it("no-ops for static behavior", () => {
    const sprite = makeRuntimeSprite(makeSprite({ behavior: "static" }));
    const before = { ...sprite };
    updateSprite(sprite, 0.1, new Set(["ArrowLeft", "ArrowUp"]), 1280);
    expect(sprite.x).toBe(before.x);
    expect(sprite.y).toBe(before.y);
    expect(sprite.vy).toBe(before.vy);
  });

  it("no-ops for null behavior", () => {
    const sprite = makeRuntimeSprite(makeSprite({ behavior: null }));
    const before = { ...sprite };
    updateSprite(sprite, 0.1, new Set(["ArrowLeft"]), 1280);
    expect(sprite.x).toBe(before.x);
  });

  it("no-ops for unknown behaviors so future ids don't crash", () => {
    const sprite = makeRuntimeSprite(makeSprite({ behavior: "future-x" }));
    const before = { ...sprite };
    updateSprite(sprite, 0.1, new Set(["ArrowLeft"]), 1280);
    expect(sprite.x).toBe(before.x);
  });
});
