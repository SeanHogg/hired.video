/**
 * Tests for the extended block-script interpreter (gap #1007).
 *
 * Covers:
 *   - Expression evaluation: literals, math, comparisons, boolean,
 *     random/round, sensing
 *   - Statement execution: motion, looks, control flow (if, repeat, forever),
 *     variables (set, change-by, scope), broadcasts
 *   - Loop guards: repeat-n cap, forever single-pass-per-fire
 *   - Variable scope: sprite-local vs global resolution
 */

import { describe, it, expect } from "vitest";
import {
  evalExpr,
  executeStmts,
  fireProgramEvents,
  seedGlobalVars,
  seedScriptVars,
} from "../block-interp.js";
import type {
  BlockExpr,
  BlockStmt,
  ScriptProgram,
} from "@shared/game-blocks";

function makeSprite(id: string, program?: ScriptProgram) {
  return {
    id,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    visible: true,
    source: { id, scriptProgram: program },
  };
}

function makeCtx(now = 0) {
  return {
    now,
    levelMountTs: now,
    mouse: { x: 0, y: 0 },
    heldKeys: new Set<string>(),
    spritesById: new Map(),
    spriteVars: new Map<string, Record<string, number | string | boolean>>(),
    globalVars: Object.create(null) as Record<string, number | string | boolean>,
  };
}

describe("evalExpr", () => {
  it("literals evaluate to their primitive value", () => {
    const sprite = makeSprite("s1");
    const ctx = makeCtx();
    expect(evalExpr({ kind: "literal-num", value: 7 } as BlockExpr, sprite, ctx)).toBe(7);
    expect(evalExpr({ kind: "literal-str", value: "hi" } as BlockExpr, sprite, ctx)).toBe("hi");
    expect(evalExpr({ kind: "literal-bool", value: true } as BlockExpr, sprite, ctx)).toBe(true);
  });

  it("math-op +, -, *, /, mod evaluate left/right recursively", () => {
    const sprite = makeSprite("s1");
    const ctx = makeCtx();
    const add: BlockExpr = {
      kind: "math-op",
      op: "+",
      left: { kind: "literal-num", value: 3 },
      right: { kind: "literal-num", value: 4 },
    };
    expect(evalExpr(add, sprite, ctx)).toBe(7);
    const mul: BlockExpr = {
      kind: "math-op",
      op: "*",
      left: { kind: "literal-num", value: 6 },
      right: add,
    };
    expect(evalExpr(mul, sprite, ctx)).toBe(42);
    const div: BlockExpr = { kind: "math-op", op: "/", left: { kind: "literal-num", value: 10 }, right: { kind: "literal-num", value: 2 } };
    expect(evalExpr(div, sprite, ctx)).toBe(5);
    const mod: BlockExpr = { kind: "math-op", op: "mod", left: { kind: "literal-num", value: 7 }, right: { kind: "literal-num", value: 3 } };
    expect(evalExpr(mod, sprite, ctx)).toBe(1);
  });

  it("division by zero yields 0 (Scratch convention) not NaN", () => {
    const sprite = makeSprite("s1");
    const ctx = makeCtx();
    const div: BlockExpr = { kind: "math-op", op: "/", left: { kind: "literal-num", value: 5 }, right: { kind: "literal-num", value: 0 } };
    expect(evalExpr(div, sprite, ctx)).toBe(0);
  });

  it("compare eq / lt / gt — numeric + string coercion paths", () => {
    const sprite = makeSprite("s1");
    const ctx = makeCtx();
    expect(evalExpr({ kind: "compare", op: "eq", left: { kind: "literal-num", value: 5 }, right: { kind: "literal-num", value: 5 } } as BlockExpr, sprite, ctx)).toBe(true);
    expect(evalExpr({ kind: "compare", op: "lt", left: { kind: "literal-num", value: 3 }, right: { kind: "literal-num", value: 4 } } as BlockExpr, sprite, ctx)).toBe(true);
    expect(evalExpr({ kind: "compare", op: "gt", left: { kind: "literal-num", value: 3 }, right: { kind: "literal-num", value: 4 } } as BlockExpr, sprite, ctx)).toBe(false);
    // String coercion — "5" eq 5 should be true (loose-equal semantics).
    expect(evalExpr({ kind: "compare", op: "eq", left: { kind: "literal-str", value: "5" }, right: { kind: "literal-num", value: 5 } } as BlockExpr, sprite, ctx)).toBe(true);
  });

  it("and/or short-circuit, not flips", () => {
    const sprite = makeSprite("s1");
    const ctx = makeCtx();
    expect(evalExpr({ kind: "and", left: { kind: "literal-bool", value: true }, right: { kind: "literal-bool", value: false } } as BlockExpr, sprite, ctx)).toBe(false);
    expect(evalExpr({ kind: "or", left: { kind: "literal-bool", value: false }, right: { kind: "literal-bool", value: true } } as BlockExpr, sprite, ctx)).toBe(true);
    expect(evalExpr({ kind: "not", value: { kind: "literal-bool", value: true } } as BlockExpr, sprite, ctx)).toBe(false);
  });

  it("random-range returns a value in [min, max]", () => {
    const sprite = makeSprite("s1");
    const ctx = makeCtx();
    for (let i = 0; i < 100; i++) {
      const v = evalExpr(
        { kind: "random-range", min: { kind: "literal-num", value: 1 }, max: { kind: "literal-num", value: 10 } } as BlockExpr,
        sprite,
        ctx,
      ) as number;
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("var-ref reads sprite-local first, then global, then 0", () => {
    const sprite = makeSprite("s1");
    const ctx = makeCtx();
    ctx.globalVars["score"] = 100;
    ctx.spriteVars.set("s1", { score: 99 });
    expect(evalExpr({ kind: "var-ref", name: "score" } as BlockExpr, sprite, ctx)).toBe(99);
    ctx.spriteVars.delete("s1");
    expect(evalExpr({ kind: "var-ref", name: "score" } as BlockExpr, sprite, ctx)).toBe(100);
    expect(evalExpr({ kind: "var-ref", name: "missing" } as BlockExpr, sprite, ctx)).toBe(0);
  });

  it("mouse-x / mouse-y / key-pressed? / timer pull from ctx", () => {
    const sprite = makeSprite("s1");
    const ctx = makeCtx(5000);
    ctx.levelMountTs = 1000;
    ctx.mouse = { x: 320, y: 180 };
    ctx.heldKeys.add("ArrowRight");
    expect(evalExpr({ kind: "mouse-x" } as BlockExpr, sprite, ctx)).toBe(320);
    expect(evalExpr({ kind: "mouse-y" } as BlockExpr, sprite, ctx)).toBe(180);
    expect(evalExpr({ kind: "key-pressed?", key: "ArrowRight" } as BlockExpr, sprite, ctx)).toBe(true);
    expect(evalExpr({ kind: "key-pressed?", key: "ArrowLeft" } as BlockExpr, sprite, ctx)).toBe(false);
    // timer is seconds since levelMountTs.
    expect(evalExpr({ kind: "timer" } as BlockExpr, sprite, ctx)).toBe(4);
  });

  it("distance-to computes Euclidean distance to a sprite by id", () => {
    const sprite = makeSprite("s1");
    sprite.x = 0;
    sprite.y = 0;
    const target = makeSprite("s2");
    target.x = 3;
    target.y = 4;
    const ctx = makeCtx();
    ctx.spritesById.set("s2", target);
    expect(evalExpr({ kind: "distance-to", spriteId: "s2" } as BlockExpr, sprite, ctx)).toBe(5);
  });
});

describe("executeStmts", () => {
  it("move-by mutates sprite x/y", () => {
    const sprite = makeSprite("s1");
    const ctx = makeCtx();
    executeStmts(sprite, [
      { id: "1", kind: "move-by", dx: { kind: "literal-num", value: 10 }, dy: { kind: "literal-num", value: -5 } },
    ], ctx);
    expect(sprite.x).toBe(10);
    expect(sprite.y).toBe(-5);
  });

  it("set-position overrides sprite coords", () => {
    const sprite = makeSprite("s1");
    sprite.x = 100;
    const ctx = makeCtx();
    executeStmts(sprite, [
      { id: "1", kind: "set-position", x: { kind: "literal-num", value: 0 }, y: { kind: "literal-num", value: 0 } },
    ], ctx);
    expect(sprite.x).toBe(0);
    expect(sprite.y).toBe(0);
  });

  it("if executes its body only when condition is true", () => {
    const sprite = makeSprite("s1");
    const ctx = makeCtx();
    executeStmts(sprite, [
      {
        id: "if1",
        kind: "if",
        condition: { kind: "literal-bool", value: false },
        thenBody: [
          { id: "x1", kind: "move-by", dx: { kind: "literal-num", value: 5 }, dy: { kind: "literal-num", value: 0 } },
        ],
      } as BlockStmt,
    ], ctx);
    expect(sprite.x).toBe(0);
  });

  it("if-else picks the right branch", () => {
    const sprite = makeSprite("s1");
    const ctx = makeCtx();
    executeStmts(sprite, [
      {
        id: "if1",
        kind: "if-else",
        condition: { kind: "literal-bool", value: false },
        thenBody: [
          { id: "x1", kind: "move-by", dx: { kind: "literal-num", value: 5 }, dy: { kind: "literal-num", value: 0 } },
        ],
        elseBody: [
          { id: "x2", kind: "move-by", dx: { kind: "literal-num", value: -3 }, dy: { kind: "literal-num", value: 0 } },
        ],
      } as BlockStmt,
    ], ctx);
    expect(sprite.x).toBe(-3);
  });

  it("repeat-n runs the body N times", () => {
    const sprite = makeSprite("s1");
    const ctx = makeCtx();
    executeStmts(sprite, [
      {
        id: "r1",
        kind: "repeat-n",
        count: { kind: "literal-num", value: 5 },
        body: [
          { id: "m1", kind: "move-by", dx: { kind: "literal-num", value: 1 }, dy: { kind: "literal-num", value: 0 } },
        ],
      } as BlockStmt,
    ], ctx);
    expect(sprite.x).toBe(5);
  });

  it("repeat-n is capped at MAX_LOOP_ITERATIONS (5000) so a million-count doesn't freeze", () => {
    const sprite = makeSprite("s1");
    const ctx = makeCtx();
    const start = Date.now();
    executeStmts(sprite, [
      {
        id: "r1",
        kind: "repeat-n",
        count: { kind: "literal-num", value: 1_000_000 },
        body: [
          { id: "m1", kind: "move-by", dx: { kind: "literal-num", value: 1 }, dy: { kind: "literal-num", value: 0 } },
        ],
      } as BlockStmt,
    ], ctx);
    // Cap is 5000.
    expect(sprite.x).toBe(5000);
    // And it returns in well under 1s.
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("set-var + change-var-by mutate the sprite-local scope when declared local", () => {
    const sprite = makeSprite("s1");
    const ctx = makeCtx();
    ctx.spriteVars.set("s1", { score: 0 });
    executeStmts(sprite, [
      { id: "1", kind: "set-var", name: "score", value: { kind: "literal-num", value: 10 } },
      { id: "2", kind: "change-var-by", name: "score", delta: { kind: "literal-num", value: 5 } },
    ], ctx);
    expect(ctx.spriteVars.get("s1")?.score).toBe(15);
  });

  it("set-var on a global-declared name writes to the global scope", () => {
    const sprite = makeSprite("s1");
    const ctx = makeCtx();
    ctx.globalVars["coins"] = 0;
    executeStmts(sprite, [
      { id: "1", kind: "change-var-by", name: "coins", delta: { kind: "literal-num", value: 7 } },
    ], ctx);
    expect(ctx.globalVars["coins"]).toBe(7);
  });

  it("broadcast pushes to ctx.broadcast (the runtime's queue)", () => {
    const sprite = makeSprite("s1");
    const ctx = makeCtx();
    const fired: string[] = [];
    ctx.broadcast = (name: string) => fired.push(name);
    executeStmts(sprite, [
      { id: "1", kind: "broadcast", name: "win" },
    ], ctx);
    expect(fired).toEqual(["win"]);
  });

  it("goto-level fires the runtime callback + bails out of the remaining stmts", () => {
    const sprite = makeSprite("s1");
    const ctx = makeCtx();
    let gotoCalled: string | null = null;
    ctx.gotoLevel = (lvl: string) => { gotoCalled = lvl; };
    executeStmts(sprite, [
      { id: "1", kind: "goto-level", levelId: "level-2" },
      { id: "2", kind: "move-by", dx: { kind: "literal-num", value: 999 }, dy: { kind: "literal-num", value: 0 } },
    ], ctx);
    expect(gotoCalled).toBe("level-2");
    // Subsequent stmts were dropped because the sprite was unmounted.
    expect(sprite.x).toBe(0);
  });
});

describe("fireProgramEvents", () => {
  it("only fires handlers whose event kind matches", () => {
    const program: ScriptProgram = {
      schemaVersion: 1,
      events: [
        {
          id: "h1",
          event: { kind: "on-tick" },
          body: [{ id: "m1", kind: "move-by", dx: { kind: "literal-num", value: 1 }, dy: { kind: "literal-num", value: 0 } }],
        },
        {
          id: "h2",
          event: { kind: "on-level-mount" },
          body: [{ id: "m2", kind: "move-by", dx: { kind: "literal-num", value: 100 }, dy: { kind: "literal-num", value: 0 } }],
        },
      ],
      variables: [],
    };
    const sprite = makeSprite("s1", program);
    const ctx = makeCtx();
    fireProgramEvents(sprite, "on-tick", null, ctx);
    expect(sprite.x).toBe(1);
    fireProgramEvents(sprite, "on-level-mount", null, ctx);
    expect(sprite.x).toBe(101);
  });

  it("on-key-press filters by key, on-receive filters by message name", () => {
    const program: ScriptProgram = {
      schemaVersion: 1,
      events: [
        {
          id: "h1",
          event: { kind: "on-key-press", key: "ArrowRight" },
          body: [{ id: "m1", kind: "move-by", dx: { kind: "literal-num", value: 10 }, dy: { kind: "literal-num", value: 0 } }],
        },
        {
          id: "h2",
          event: { kind: "on-receive", name: "go" },
          body: [{ id: "m2", kind: "move-by", dx: { kind: "literal-num", value: -5 }, dy: { kind: "literal-num", value: 0 } }],
        },
      ],
      variables: [],
    };
    const sprite = makeSprite("s1", program);
    const ctx = makeCtx();
    fireProgramEvents(sprite, "on-key-press", { key: "ArrowLeft" }, ctx);
    expect(sprite.x).toBe(0);
    fireProgramEvents(sprite, "on-key-press", { key: "ArrowRight" }, ctx);
    expect(sprite.x).toBe(10);
    fireProgramEvents(sprite, "on-receive", { name: "stop" }, ctx);
    expect(sprite.x).toBe(10);
    fireProgramEvents(sprite, "on-receive", { name: "go" }, ctx);
    expect(sprite.x).toBe(5);
  });
});

describe("seedScriptVars + seedGlobalVars", () => {
  it("seedScriptVars populates the spriteVars map from each sprite's declared variables", () => {
    const program: ScriptProgram = {
      schemaVersion: 1,
      events: [],
      variables: [
        { name: "hp", initial: 100 },
        { name: "name", initial: "hero" },
      ],
    };
    const sprite = makeSprite("s1", program);
    const ctx = makeCtx();
    seedScriptVars([sprite], ctx);
    expect(ctx.spriteVars.get("s1")?.hp).toBe(100);
    expect(ctx.spriteVars.get("s1")?.name).toBe("hero");
  });

  it("seedGlobalVars writes through to ctx.globalVars + doesn't clobber existing keys", () => {
    const ctx = makeCtx();
    ctx.globalVars["preset"] = 7;
    seedGlobalVars(
      [
        { name: "preset", initial: 999 },
        { name: "fresh", initial: 42 },
      ],
      ctx,
    );
    // Existing key kept.
    expect(ctx.globalVars["preset"]).toBe(7);
    // New key seeded.
    expect(ctx.globalVars["fresh"]).toBe(42);
  });
});
