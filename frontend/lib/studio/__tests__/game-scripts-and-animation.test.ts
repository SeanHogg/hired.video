/**
 * Block-script + animation tests — pins:
 *   1. The pure helpers in `game-state-edit.ts` that build / mutate
 *      rules + actions (immutable, no input mutation).
 *   2. The runtime's `fireRules` + `executeActions` interpretation —
 *      every action kind moves the right field, gotoLevel calls the
 *      injected handler, set-message stamps an expiry.
 *   3. The animation `applyAnimation` interpolator — fade / slide /
 *      scale produce the expected multipliers over the duration and
 *      reset to identity once elapsed.
 *
 * Together they guarantee the editor + the runtime + the export bundle
 * agree on the visual scripting contract.
 *
 * Run: vitest run lib/studio/__tests__/game-scripts-and-animation.test.ts
 */

import { describe, it, expect } from "vitest";
import { emptyGameState, type GameState, type GameSprite } from "@shared/game-state";
import {
  addAction,
  addRule,
  addSprite,
  deleteAction,
  deleteRule,
  reorderLevels,
  updateAction,
  updateRuleTrigger,
  updateSpriteAnimation,
  addCustomSpriteAsset,
} from "@/lib/studio/game/game-state-edit";
import { fireRules, applyAnimation } from "@/lib/studio/game/runtime-core.js";
import type { RuntimeSprite } from "@/lib/studio/game/runtime-core.js";

function freshStateWithSprite(): { state: GameState; spriteId: string } {
  let state = emptyGameState({ width: 1280, height: 720, fps: 60 });
  const { state: s2, sprite } = addSprite(state, "level-1", { behavior: null });
  return { state: s2, spriteId: sprite.id };
}

function makeRuntimeSprite(source: GameSprite): RuntimeSprite {
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

// ─── Pure helpers ───────────────────────────────────────────────────────────

describe("addRule / deleteRule / updateRuleTrigger", () => {
  it("appends a rule with a stable id + the trigger the caller passed", () => {
    const { state, spriteId } = freshStateWithSprite();
    const next = addRule(state, "level-1", spriteId, { kind: "on-level-mount" });
    const sprite = next.levels[0].sprites[0];
    expect(sprite.scripts).toBeDefined();
    expect(sprite.scripts).toHaveLength(1);
    expect(sprite.scripts![0].trigger.kind).toBe("on-level-mount");
    expect(sprite.scripts![0].id).toMatch(/^rule-/);
  });

  it("does not mutate the input state", () => {
    const { state, spriteId } = freshStateWithSprite();
    addRule(state, "level-1", spriteId, { kind: "on-tick" });
    expect(state.levels[0].sprites[0].scripts ?? []).toEqual([]);
  });

  it("deleteRule removes the targeted rule + leaves siblings intact", () => {
    const { state, spriteId } = freshStateWithSprite();
    let s = addRule(state, "level-1", spriteId, { kind: "on-level-mount" });
    s = addRule(s, "level-1", spriteId, { kind: "on-click" });
    const firstId = s.levels[0].sprites[0].scripts![0].id;
    s = deleteRule(s, "level-1", spriteId, firstId);
    expect(s.levels[0].sprites[0].scripts).toHaveLength(1);
    expect(s.levels[0].sprites[0].scripts![0].trigger.kind).toBe("on-click");
  });

  it("updateRuleTrigger swaps the trigger without disturbing actions", () => {
    const { state, spriteId } = freshStateWithSprite();
    let s = addRule(state, "level-1", spriteId, { kind: "on-tick" });
    const ruleId = s.levels[0].sprites[0].scripts![0].id;
    s = addAction(s, "level-1", spriteId, ruleId, { kind: "move-by", dx: 5, dy: 0 });
    s = updateRuleTrigger(s, "level-1", spriteId, ruleId, { kind: "on-key-press", key: "ArrowRight" });
    const rule = s.levels[0].sprites[0].scripts![0];
    expect(rule.trigger.kind).toBe("on-key-press");
    expect(rule.actions).toHaveLength(1);
  });
});

describe("addAction / updateAction / deleteAction", () => {
  it("appends an action; updateAction patches in place; deleteAction removes", () => {
    const { state, spriteId } = freshStateWithSprite();
    let s = addRule(state, "level-1", spriteId, { kind: "on-tick" });
    const ruleId = s.levels[0].sprites[0].scripts![0].id;
    s = addAction(s, "level-1", spriteId, ruleId, { kind: "move-by", dx: 10, dy: 0 });
    s = addAction(s, "level-1", spriteId, ruleId, { kind: "show" });
    expect(s.levels[0].sprites[0].scripts![0].actions).toHaveLength(2);
    s = updateAction(s, "level-1", spriteId, ruleId, 0, { kind: "move-by", dx: 50, dy: 5 });
    const updated = s.levels[0].sprites[0].scripts![0].actions[0];
    expect(updated.kind).toBe("move-by");
    if (updated.kind === "move-by") expect(updated.dx).toBe(50);
    s = deleteAction(s, "level-1", spriteId, ruleId, 0);
    expect(s.levels[0].sprites[0].scripts![0].actions).toHaveLength(1);
    expect(s.levels[0].sprites[0].scripts![0].actions[0].kind).toBe("show");
  });
});

describe("updateSpriteAnimation", () => {
  it("writes the onMount field", () => {
    const { state, spriteId } = freshStateWithSprite();
    const next = updateSpriteAnimation(state, "level-1", spriteId, {
      kind: "fade-in",
      durationMs: 600,
      easing: "ease-out",
    });
    expect(next.levels[0].sprites[0].onMount?.kind).toBe("fade-in");
  });

  it("accepts null to clear the animation", () => {
    const { state, spriteId } = freshStateWithSprite();
    let s = updateSpriteAnimation(state, "level-1", spriteId, {
      kind: "scale-up",
      durationMs: 300,
      easing: "linear",
    });
    s = updateSpriteAnimation(s, "level-1", spriteId, null);
    expect(s.levels[0].sprites[0].onMount).toBeNull();
  });
});

describe("reorderLevels", () => {
  it("reorders levels by the supplied id list, preserving level identity", () => {
    let s = emptyGameState();
    s = { ...s, levels: [
      { id: "a", label: "A", backgroundColor: "#000", sprites: [] },
      { id: "b", label: "B", backgroundColor: "#000", sprites: [] },
      { id: "c", label: "C", backgroundColor: "#000", sprites: [] },
    ], startLevelId: "a" };
    const next = reorderLevels(s, ["c", "a", "b"]);
    expect(next.levels.map((l) => l.id)).toEqual(["c", "a", "b"]);
  });

  it("appends any levels missing from the ordering so a malformed call never loses data", () => {
    let s = emptyGameState();
    s = { ...s, levels: [
      { id: "a", label: "A", backgroundColor: "#000", sprites: [] },
      { id: "b", label: "B", backgroundColor: "#000", sprites: [] },
    ], startLevelId: "a" };
    const next = reorderLevels(s, ["b"]);
    expect(next.levels.map((l) => l.id)).toEqual(["b", "a"]);
  });
});

describe("addCustomSpriteAsset", () => {
  it("appends a new asset entry", () => {
    let s = emptyGameState();
    s = addCustomSpriteAsset(s, { id: "custom:foo", url: "https://example.com/foo.png" });
    expect(s.assets).toHaveLength(1);
    expect(s.assets[0].id).toBe("custom:foo");
  });

  it("replaces the URL on an existing id (idempotent re-pick)", () => {
    let s = emptyGameState();
    s = addCustomSpriteAsset(s, { id: "custom:foo", url: "https://example.com/v1.png" });
    s = addCustomSpriteAsset(s, { id: "custom:foo", url: "https://example.com/v2.png" });
    expect(s.assets).toHaveLength(1);
    expect(s.assets[0].url).toBe("https://example.com/v2.png");
  });
});

// ─── Runtime: fireRules / executeActions ────────────────────────────────────

describe("fireRules + executeActions", () => {
  function makeSpriteWithRule(actions: Array<unknown>): RuntimeSprite {
    return makeRuntimeSprite({
      id: "s",
      assetId: "builtin:x",
      x: 100,
      y: 100,
      width: 32,
      height: 32,
      behavior: null,
      scripts: [{ id: "r1", trigger: { kind: "on-level-mount" }, actions: actions as any }],
    });
  }

  it("move-by mutates x/y by the deltas", () => {
    const sprite = makeSpriteWithRule([{ kind: "move-by", dx: 50, dy: -20 }]);
    fireRules(sprite, "on-level-mount", null, { gotoLevel: () => {}, now: 0 });
    expect(sprite.x).toBe(150);
    expect(sprite.y).toBe(80);
  });

  it("set-position sets x/y absolutely", () => {
    const sprite = makeSpriteWithRule([{ kind: "set-position", x: 5, y: 7 }]);
    fireRules(sprite, "on-level-mount", null, { gotoLevel: () => {}, now: 0 });
    expect(sprite.x).toBe(5);
    expect(sprite.y).toBe(7);
  });

  it("hide / show toggle visibility", () => {
    const hider = makeSpriteWithRule([{ kind: "hide" }]);
    fireRules(hider, "on-level-mount", null, { gotoLevel: () => {}, now: 0 });
    expect(hider.visible).toBe(false);

    const shower = makeSpriteWithRule([{ kind: "show" }]);
    shower.visible = false;
    fireRules(shower, "on-level-mount", null, { gotoLevel: () => {}, now: 0 });
    expect(shower.visible).toBe(true);
  });

  it("set-property width / height mutates runtime instance only", () => {
    const sprite = makeSpriteWithRule([{ kind: "set-property", property: "width", value: 200 }]);
    fireRules(sprite, "on-level-mount", null, { gotoLevel: () => {}, now: 0 });
    expect(sprite.width).toBe(200);
    // The authored source is untouched — exiting play mode would
    // restore the original bbox.
    expect(sprite.source.width).toBe(32);
  });

  it("goto-level invokes the injected handler with the target id", () => {
    let target: string | null = null;
    const sprite = makeSpriteWithRule([{ kind: "goto-level", levelId: "boss" }]);
    fireRules(sprite, "on-level-mount", null, {
      gotoLevel: (id) => { target = id; },
      now: 0,
    });
    expect(target).toBe("boss");
  });

  it("subsequent actions after goto-level are dropped (sprite was unmounted)", () => {
    let calls = 0;
    const sprite = makeSpriteWithRule([
      { kind: "goto-level", levelId: "x" },
      { kind: "move-by", dx: 99, dy: 99 },
    ]);
    fireRules(sprite, "on-level-mount", null, {
      gotoLevel: () => { calls++; },
      now: 0,
    });
    expect(calls).toBe(1);
    expect(sprite.x).toBe(100); // move-by didn't run
  });

  it("set-message stamps an expiry 2s in the future", () => {
    const sprite = makeSpriteWithRule([{ kind: "set-message", text: "hi" }]);
    fireRules(sprite, "on-level-mount", null, { gotoLevel: () => {}, now: 1000 });
    expect(sprite.message).toBe("hi");
    expect(sprite.messageUntilTs).toBe(3000);
  });

  it("only fires rules whose trigger kind matches", () => {
    const sprite = makeSpriteWithRule([{ kind: "move-by", dx: 1, dy: 0 }]);
    fireRules(sprite, "on-click", null, { gotoLevel: () => {}, now: 0 });
    expect(sprite.x).toBe(100); // didn't fire
    fireRules(sprite, "on-level-mount", null, { gotoLevel: () => {}, now: 0 });
    expect(sprite.x).toBe(101); // fired
  });

  it("on-key-press matches by exact key", () => {
    const sprite = makeRuntimeSprite({
      id: "s",
      assetId: "builtin:x",
      x: 0, y: 0, width: 10, height: 10,
      behavior: null,
      scripts: [
        { id: "r1", trigger: { kind: "on-key-press", key: "ArrowLeft" }, actions: [{ kind: "move-by", dx: -5, dy: 0 } as any] },
      ],
    });
    fireRules(sprite, "on-key-press", { key: "ArrowRight" }, { gotoLevel: () => {}, now: 0 });
    expect(sprite.x).toBe(0); // wrong key, didn't fire
    fireRules(sprite, "on-key-press", { key: "ArrowLeft" }, { gotoLevel: () => {}, now: 0 });
    expect(sprite.x).toBe(-5); // matched
  });
});

// ─── Runtime: applyAnimation ────────────────────────────────────────────────

describe("applyAnimation", () => {
  function spriteWithAnim(kind: string): RuntimeSprite {
    const s = makeRuntimeSprite({
      id: "s",
      assetId: "x",
      x: 0, y: 0, width: 10, height: 10,
      behavior: null,
      onMount: { kind: kind as any, durationMs: 1000, easing: "linear" },
    });
    s.mountTs = 0;
    return s;
  }

  it("fade-in interpolates alpha from 0 to 1 over the duration", () => {
    const sprite = spriteWithAnim("fade-in");
    applyAnimation(sprite, 0);
    expect(sprite.alpha).toBeCloseTo(0, 2);
    applyAnimation(sprite, 500);
    expect(sprite.alpha).toBeCloseTo(0.5, 2);
    applyAnimation(sprite, 1500);
    expect(sprite.alpha).toBe(1); // past duration → identity
  });

  it("slide-in-left starts with negative offsetX, ends at 0", () => {
    const sprite = spriteWithAnim("slide-in-left");
    applyAnimation(sprite, 0);
    expect(sprite.offsetX).toBeLessThan(0);
    applyAnimation(sprite, 1500);
    expect(sprite.offsetX).toBe(0);
  });

  it("scale-up interpolates scale from 0 to 1", () => {
    const sprite = spriteWithAnim("scale-up");
    applyAnimation(sprite, 0);
    expect(sprite.scale).toBeCloseTo(0, 2);
    applyAnimation(sprite, 1500);
    expect(sprite.scale).toBe(1);
  });

  it("none leaves all multipliers at identity", () => {
    const sprite = spriteWithAnim("none");
    applyAnimation(sprite, 500);
    expect(sprite.alpha).toBe(1);
    expect(sprite.scale).toBe(1);
    expect(sprite.offsetX).toBe(0);
    expect(sprite.offsetY).toBe(0);
  });

  it("missing onMount leaves multipliers at identity (no crash)", () => {
    const sprite = makeRuntimeSprite({
      id: "s", assetId: "x", x: 0, y: 0, width: 10, height: 10,
      behavior: null,
    });
    expect(() => applyAnimation(sprite, 100)).not.toThrow();
    expect(sprite.alpha).toBe(1);
  });
});
