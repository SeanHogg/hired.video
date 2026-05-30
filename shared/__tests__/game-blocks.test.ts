/**
 * Tests for the Snap!/Scratch visual block AST + mutators (gap #1007).
 *
 * Run: node --import tsx --test shared/__tests__/game-blocks.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addEventHandler,
  addVariable,
  appendStmt,
  emptyExpr,
  emptyScriptProgram,
  insertStmtAt,
  moveStmt,
  newBlockId,
  removeEventHandler,
  removeStmt,
  removeVariable,
  updateEventHandler,
  updateStmt,
  type BlockStmt,
} from "../game-blocks.js";

describe("ScriptProgram mutators", () => {
  it("emptyScriptProgram seeds an empty events + variables collection", () => {
    const p = emptyScriptProgram();
    assert.strictEqual(p.schemaVersion, 1);
    assert.deepStrictEqual(p.events, []);
    assert.deepStrictEqual(p.variables, []);
  });

  it("addEventHandler pushes a fresh handler with an empty body + a unique id", () => {
    const p0 = emptyScriptProgram();
    const p1 = addEventHandler(p0, { kind: "on-tick" });
    assert.strictEqual(p1.events.length, 1);
    assert.strictEqual(p1.events[0].event.kind, "on-tick");
    assert.deepStrictEqual(p1.events[0].body, []);
    assert.notStrictEqual(p1, p0);
    assert.notStrictEqual(p1.events, p0.events);
  });

  it("addEventHandler ids are unique across handlers", () => {
    let p = emptyScriptProgram();
    for (let i = 0; i < 5; i++) p = addEventHandler(p, { kind: "on-tick" });
    const ids = new Set(p.events.map((e) => e.id));
    assert.strictEqual(ids.size, 5);
  });

  it("appendStmt drops the stmt at the end of the event body", () => {
    let p = addEventHandler(emptyScriptProgram(), { kind: "on-tick" });
    const evtId = p.events[0].id;
    p = appendStmt(p, { eventId: evtId, parents: [] }, {
      id: newBlockId(),
      kind: "show",
    });
    assert.strictEqual(p.events[0].body.length, 1);
    assert.strictEqual(p.events[0].body[0].kind, "show");
  });

  it("insertStmtAt respects the index + clamps out-of-range positions", () => {
    let p = addEventHandler(emptyScriptProgram(), { kind: "on-tick" });
    const evtId = p.events[0].id;
    const path = { eventId: evtId, parents: [] };
    p = appendStmt(p, path, { id: "a", kind: "show" });
    p = appendStmt(p, path, { id: "b", kind: "hide" });
    p = insertStmtAt(p, path, 1, { id: "c", kind: "show" });
    assert.deepStrictEqual(p.events[0].body.map((s) => s.id), ["a", "c", "b"]);
    // Out-of-range clamps to the end.
    p = insertStmtAt(p, path, 99, { id: "d", kind: "hide" });
    assert.deepStrictEqual(p.events[0].body.map((s) => s.id), ["a", "c", "b", "d"]);
  });

  it("moveStmt reorders within the body", () => {
    let p = addEventHandler(emptyScriptProgram(), { kind: "on-tick" });
    const evtId = p.events[0].id;
    const path = { eventId: evtId, parents: [] };
    p = appendStmt(p, path, { id: "a", kind: "show" });
    p = appendStmt(p, path, { id: "b", kind: "hide" });
    p = appendStmt(p, path, { id: "c", kind: "show" });
    p = moveStmt(p, path, 0, 2);
    assert.deepStrictEqual(p.events[0].body.map((s) => s.id), ["b", "c", "a"]);
  });

  it("removeStmt only drops the top-level body match — leaves siblings alone", () => {
    let p = addEventHandler(emptyScriptProgram(), { kind: "on-tick" });
    const evtId = p.events[0].id;
    const path = { eventId: evtId, parents: [] };
    p = appendStmt(p, path, { id: "a", kind: "show" });
    p = appendStmt(p, path, { id: "b", kind: "hide" });
    p = removeStmt(p, path, "a");
    assert.deepStrictEqual(p.events[0].body.map((s) => s.id), ["b"]);
  });

  it("appendStmt into a nested if/thenBody works via the bucket trail", () => {
    let p = addEventHandler(emptyScriptProgram(), { kind: "on-tick" });
    const evtId = p.events[0].id;
    const ifStmt: BlockStmt = {
      id: "i1",
      kind: "if",
      condition: { kind: "literal-bool", value: true },
      thenBody: [],
    };
    p = appendStmt(p, { eventId: evtId, parents: [] }, ifStmt);
    p = appendStmt(
      p,
      { eventId: evtId, parents: ["i1"], bucket: "thenBody" },
      { id: "x", kind: "show" },
    );
    const top = p.events[0].body[0];
    assert.strictEqual(top.kind, "if");
    if (top.kind === "if") {
      assert.strictEqual(top.thenBody.length, 1);
      assert.strictEqual(top.thenBody[0].kind, "show");
    }
  });

  it("appendStmt into deeply nested control bodies walks the parent chain", () => {
    let p = addEventHandler(emptyScriptProgram(), { kind: "on-tick" });
    const evtId = p.events[0].id;
    const inner: BlockStmt = {
      id: "fvr",
      kind: "forever",
      body: [],
    };
    const outer: BlockStmt = {
      id: "if",
      kind: "if",
      condition: { kind: "literal-bool", value: true },
      thenBody: [inner],
    };
    p = appendStmt(p, { eventId: evtId, parents: [] }, outer);
    p = appendStmt(
      p,
      { eventId: evtId, parents: ["if", "fvr"], bucket: "body" },
      { id: "leaf", kind: "show" },
    );
    const top = p.events[0].body[0];
    assert.strictEqual(top.kind, "if");
    if (top.kind === "if") {
      const fvr = top.thenBody[0];
      assert.strictEqual(fvr.kind, "forever");
      if (fvr.kind === "forever") {
        assert.strictEqual(fvr.body.length, 1);
        assert.strictEqual(fvr.body[0].kind, "show");
      }
    }
  });

  it("updateStmt patches by id at any nesting depth", () => {
    let p = addEventHandler(emptyScriptProgram(), { kind: "on-tick" });
    const evtId = p.events[0].id;
    const path = { eventId: evtId, parents: [] };
    p = appendStmt(p, path, { id: "a", kind: "show" });
    p = updateStmt(p, "a", (_s) => ({ id: "a", kind: "hide" }));
    assert.strictEqual(p.events[0].body[0].kind, "hide");
  });

  it("removeEventHandler drops by id", () => {
    let p = emptyScriptProgram();
    p = addEventHandler(p, { kind: "on-tick" });
    p = addEventHandler(p, { kind: "on-level-mount" });
    const targetId = p.events[0].id;
    p = removeEventHandler(p, targetId);
    assert.strictEqual(p.events.length, 1);
    assert.strictEqual(p.events[0].event.kind, "on-level-mount");
  });

  it("addVariable + removeVariable + duplicate-add guard", () => {
    let p = emptyScriptProgram();
    p = addVariable(p, "score", 0);
    p = addVariable(p, "score", 99); // duplicate — should no-op
    assert.strictEqual(p.variables.length, 1);
    assert.strictEqual(p.variables[0].initial, 0);
    p = removeVariable(p, "score");
    assert.strictEqual(p.variables.length, 0);
  });

  it("emptyExpr returns a literal-num 0 — the default for a fresh slot", () => {
    const e = emptyExpr();
    assert.strictEqual(e.kind, "literal-num");
    if (e.kind === "literal-num") assert.strictEqual(e.value, 0);
  });

  it("updateEventHandler can rewire the event-kind in place + survives type narrowing", () => {
    let p = addEventHandler(emptyScriptProgram(), { kind: "on-tick" });
    const evtId = p.events[0].id;
    p = updateEventHandler(p, evtId, (evt) => ({
      ...evt,
      event: { kind: "on-key-press", key: "ArrowRight" },
    }));
    assert.strictEqual(p.events[0].event.kind, "on-key-press");
    if (p.events[0].event.kind === "on-key-press") {
      assert.strictEqual(p.events[0].event.key, "ArrowRight");
    }
  });
});
