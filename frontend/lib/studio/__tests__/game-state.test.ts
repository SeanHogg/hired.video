/**
 * Game-state helper unit tests — covers the SoT constructors + predicates
 * in `shared/game-state.ts`. Every consumer that materializes or queries a
 * `GameState` goes through these functions (chooser, "+ Add level",
 * template seeds, the runtime's start-level resolver) — so a regression
 * here breaks game-kind seeding across every entry point.
 *
 * Run: vitest run lib/studio/__tests__/game-state.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  GAME_STATE_SCHEMA_VERSION,
  emptyGameState,
  defaultLevel,
  isPlayable,
  type GameState,
} from "@shared/game-state";

describe("emptyGameState", () => {
  it("returns a playable state with a single starter level by default", () => {
    const state = emptyGameState();
    expect(state.schemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
    expect(state.engine).toBe("phaser-3");
    expect(state.width).toBe(1280);
    expect(state.height).toBe(720);
    expect(state.fps).toBe(60);
    expect(state.levels).toHaveLength(1);
    expect(state.levels[0].id).toBe(state.startLevelId);
    expect(isPlayable(state)).toBe(true);
  });

  it("honors width / height / fps overrides for portrait + 30fps templates", () => {
    const state = emptyGameState({ width: 720, height: 1280, fps: 30 });
    expect(state.width).toBe(720);
    expect(state.height).toBe(1280);
    expect(state.fps).toBe(30);
  });

  it("seeds an empty asset manifest so the runtime preload has a stable shape", () => {
    // The runtime iterates `state.assets` at boot — undefined would crash.
    expect(emptyGameState().assets).toEqual([]);
  });
});

describe("defaultLevel", () => {
  it("produces a level matching the id + label and an empty sprite array", () => {
    const level = defaultLevel("level-3", "Boss fight");
    expect(level.id).toBe("level-3");
    expect(level.label).toBe("Boss fight");
    expect(level.sprites).toEqual([]);
    // Slate-900 fallback so the canvas is never transparent on first paint.
    expect(level.backgroundColor).toBeTruthy();
  });
});

describe("isPlayable", () => {
  it("returns false when no levels exist", () => {
    const state: GameState = { ...emptyGameState(), levels: [] };
    expect(isPlayable(state)).toBe(false);
  });

  it("returns false when startLevelId points at a missing level", () => {
    const state = emptyGameState();
    state.startLevelId = "doesnt-exist";
    expect(isPlayable(state)).toBe(false);
  });

  it("returns true when startLevelId resolves to a level", () => {
    const state = emptyGameState();
    expect(isPlayable(state)).toBe(true);
  });
});
