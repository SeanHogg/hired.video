/**
 * game-state-edit unit tests — pure immutable mutations on `GameState`.
 * Used by the right-rail `<GameEditor>` and (soon) by an undo / redo
 * stack and an agent-tool hydrator. Pinning them here prevents the
 * mutation rules drifting from the runtime's invariants — e.g. if
 * `setStartLevel` ever forgot to defensively check the id, the runtime's
 * `findStartLevel` would silently fall back to levels[0] and a Save +
 * reload would mysteriously lose the user's "set as start" pick.
 *
 * Run: vitest run lib/studio/__tests__/game-state-edit.test.ts
 */

import { describe, it, expect } from "vitest";
import { emptyGameState, isPlayable, type GameState } from "@shared/game-state";
import {
  BEHAVIORS,
  BEHAVIOR_PARAM_DEFAULTS,
  addLevel,
  addSprite,
  deleteLevel,
  deleteSprite,
  setStartLevel,
  updateGameSettings,
  updateLevel,
  updateSprite,
  updateSpriteParam,
} from "@/lib/studio/game/game-state-edit";

function freshState(): GameState {
  return emptyGameState({ width: 1280, height: 720, fps: 60 });
}

describe("addLevel", () => {
  it("appends a new level with a stable id and the next ordinal label by default", () => {
    const before = freshState();
    const { state, level } = addLevel(before);
    expect(state.levels).toHaveLength(2);
    expect(level.label).toBe("Level 2");
    expect(level.id).toBe("level-2");
    expect(state.levels[1]).toBe(level);
  });

  it("does not mutate the input state", () => {
    const before = freshState();
    addLevel(before);
    expect(before.levels).toHaveLength(1);
  });

  it("avoids id collisions after a delete (no reuse)", () => {
    // Add two levels (level-2, level-3), delete level-2, then add again
    // — new id must be level-4, never level-2. Stable ids keep an
    // eventual undo stack referentially correct.
    let s = freshState();
    s = addLevel(s).state; // level-2
    s = addLevel(s).state; // level-3
    s = deleteLevel(s, "level-2");
    const after = addLevel(s).state;
    expect(after.levels.map((l) => l.id)).toEqual(["level-1", "level-3", "level-4"]);
  });

  it("honors a custom label override", () => {
    const { level } = addLevel(freshState(), "Boss fight");
    expect(level.label).toBe("Boss fight");
  });
});

describe("deleteLevel", () => {
  it("removes the level by id", () => {
    let s = freshState();
    s = addLevel(s).state;
    s = deleteLevel(s, "level-2");
    expect(s.levels.map((l) => l.id)).toEqual(["level-1"]);
  });

  it("refuses to drop below one level so the runtime can always mount", () => {
    // The editor's delete button is disabled here, but the helper still
    // needs to refuse to keep the data model invariant.
    const before = freshState();
    const after = deleteLevel(before, "level-1");
    expect(after.levels).toHaveLength(1);
    expect(isPlayable(after)).toBe(true);
  });

  it("retargets startLevelId to a surviving level when the start is deleted", () => {
    let s = freshState();
    s = addLevel(s).state; // level-2
    s = setStartLevel(s, "level-2");
    s = deleteLevel(s, "level-2");
    expect(s.startLevelId).toBe("level-1");
    expect(isPlayable(s)).toBe(true);
  });
});

describe("updateLevel", () => {
  it("patches the matched level only", () => {
    let s = freshState();
    s = addLevel(s).state;
    s = updateLevel(s, "level-2", { label: "Renamed", backgroundColor: "#ff00aa" });
    expect(s.levels[1].label).toBe("Renamed");
    expect(s.levels[1].backgroundColor).toBe("#ff00aa");
    // Level 1 untouched.
    expect(s.levels[0].label).toBe("Level 1");
  });

  it("is a no-op for an unknown id", () => {
    const before = freshState();
    const after = updateLevel(before, "ghost", { label: "x" });
    expect(after.levels).toEqual(before.levels);
  });
});

describe("setStartLevel", () => {
  it("updates startLevelId when the target exists", () => {
    let s = freshState();
    s = addLevel(s).state;
    s = setStartLevel(s, "level-2");
    expect(s.startLevelId).toBe("level-2");
  });

  it("refuses to set a dangling id — startLevelId always resolves", () => {
    // The runtime's `findStartLevel` falls back defensively when this
    // refusal is bypassed; the editor refuses up-front so a save-reload
    // never silently retargets the user's pick.
    const before = freshState();
    const after = setStartLevel(before, "ghost");
    expect(after.startLevelId).toBe(before.startLevelId);
  });
});

describe("addSprite", () => {
  it("appends a sprite to the active level with behavior-derived id prefix", () => {
    const { state, sprite } = addSprite(freshState(), "level-1", { behavior: "platformer-player" });
    expect(state.levels[0].sprites).toHaveLength(1);
    expect(sprite.id).toBe("platformer-player-1");
  });

  it("uses `sprite-<n>` prefix when no behavior is set", () => {
    const { sprite } = addSprite(freshState(), "level-1", {});
    expect(sprite.id).toMatch(/^sprite-\d+$/);
  });

  it("places the sprite roughly centered on the canvas by default", () => {
    const { sprite } = addSprite(freshState(), "level-1", { behavior: "static" });
    // Width 64 default → center at (1280/2 - 32 = 608, 720/2 - 32 = 328).
    expect(sprite.x).toBeGreaterThan(500);
    expect(sprite.x).toBeLessThan(700);
    expect(sprite.y).toBeGreaterThan(280);
    expect(sprite.y).toBeLessThan(380);
  });

  it("bumps the per-behavior counter so repeated adds get unique ids", () => {
    let s = freshState();
    s = addSprite(s, "level-1", { behavior: "scroll-left" }).state;
    s = addSprite(s, "level-1", { behavior: "scroll-left" }).state;
    s = addSprite(s, "level-1", { behavior: "scroll-left" }).state;
    expect(s.levels[0].sprites.map((sp) => sp.id)).toEqual([
      "scroll-left-1",
      "scroll-left-2",
      "scroll-left-3",
    ]);
  });

  it("returns the original state when the level id is missing (no-op)", () => {
    const before = freshState();
    const { state } = addSprite(before, "ghost", { behavior: "static" });
    expect(state.levels).toEqual(before.levels);
  });
});

describe("deleteSprite", () => {
  it("drops the sprite by id; leaves siblings intact", () => {
    let s = freshState();
    s = addSprite(s, "level-1", { behavior: "static" }).state;
    s = addSprite(s, "level-1", { behavior: "platformer-player" }).state;
    s = deleteSprite(s, "level-1", "static-1");
    expect(s.levels[0].sprites.map((sp) => sp.id)).toEqual(["platformer-player-1"]);
  });

  it("is a no-op for an unknown level / sprite id", () => {
    const before = freshState();
    const after = deleteSprite(before, "ghost", "static-1");
    expect(after).toEqual(before);
  });
});

describe("updateSprite", () => {
  it("patches the matched sprite only", () => {
    let s = freshState();
    s = addSprite(s, "level-1", { behavior: "static" }).state;
    s = updateSprite(s, "level-1", "static-1", { x: 100, y: 200, width: 32 });
    const updated = s.levels[0].sprites[0];
    expect(updated.x).toBe(100);
    expect(updated.y).toBe(200);
    expect(updated.width).toBe(32);
    // Height untouched at the default.
    expect(updated.height).toBeGreaterThan(0);
  });
});

describe("updateSpriteParam", () => {
  it("preserves other params when patching a single key", () => {
    let s = freshState();
    s = addSprite(s, "level-1", { behavior: "platformer-player" }).state;
    s = updateSpriteParam(s, "level-1", "platformer-player-1", "runSpeed", 400);
    s = updateSpriteParam(s, "level-1", "platformer-player-1", "jumpPower", 700);
    const params = s.levels[0].sprites[0].params ?? {};
    expect(params.runSpeed).toBe(400);
    expect(params.jumpPower).toBe(700);
  });

  it("creates the params object on a sprite that has none", () => {
    let s = freshState();
    s = addSprite(s, "level-1", {}).state; // no behavior, no params
    s = updateSpriteParam(s, "level-1", "sprite-1", "anything", 42);
    expect(s.levels[0].sprites[0].params).toEqual({ anything: 42 });
  });
});

describe("updateGameSettings", () => {
  it("patches width / height / fps without touching levels", () => {
    const before = freshState();
    const after = updateGameSettings(before, { width: 640, height: 360, fps: 30 });
    expect(after.width).toBe(640);
    expect(after.height).toBe(360);
    expect(after.fps).toBe(30);
    expect(after.levels).toEqual(before.levels);
  });
});

describe("BEHAVIOR_PARAM_DEFAULTS", () => {
  it("has an entry for every BEHAVIORS member (exhaustiveness regression guard)", () => {
    // A future behavior added to BEHAVIORS without a matching param
    // record entry would fail this test — the editor's inspector form
    // would otherwise silently render nothing for the new behavior.
    for (const b of BEHAVIORS) {
      expect(BEHAVIOR_PARAM_DEFAULTS[b]).toBeDefined();
    }
  });

  it("ships defaults the inspector form renders cleanly", () => {
    // Each param needs a key + label + kind + default. Any missing field
    // would break the form input mapping in <GameEditor>.
    for (const b of BEHAVIORS) {
      for (const spec of BEHAVIOR_PARAM_DEFAULTS[b]) {
        expect(typeof spec.key).toBe("string");
        expect(spec.key.length).toBeGreaterThan(0);
        expect(typeof spec.label).toBe("string");
        expect(["number", "boolean", "text"]).toContain(spec.kind);
        expect(spec.default).toBeDefined();
      }
    }
  });
});
