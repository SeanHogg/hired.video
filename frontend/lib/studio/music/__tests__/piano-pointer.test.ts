/**
 * #2162 — PianoComposer mobile multi-touch + pointer lifecycle.
 *
 * These tests are the device-emulator stand-in: they drive the same
 * reducer Keyboard.tsx PianoKey must call, with distinct pointerIds
 * the way iOS/Android Pointer Events deliver one id per finger.
 *
 * Run: npx vitest run lib/studio/music/__tests__/piano-pointer.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  emptyPianoKeyPointerState,
  reducePianoKeyPointer,
  type PianoKeyPointerEffect,
  type PianoKeyPointerEvent,
  type PianoKeyPointerState,
} from "../piano-pointer";

function drive(
  events: PianoKeyPointerEvent[],
  initial: PianoKeyPointerState = emptyPianoKeyPointerState(),
): { state: PianoKeyPointerState; effects: PianoKeyPointerEffect[] } {
  let state = initial;
  const effects: PianoKeyPointerEffect[] = [];
  for (const event of events) {
    const result = reducePianoKeyPointer(state, event);
    state = result.state;
    effects.push(...result.effects);
  }
  return { state, effects };
}

function types(effects: PianoKeyPointerEffect[]): PianoKeyPointerEffect["type"][] {
  return effects.map((e) => e.type);
}

describe("reducePianoKeyPointer", () => {
  it("fires note-on on the first pointer down and captures that pointer", () => {
    const { state, effects } = drive([
      { kind: "down", pointerId: 1, pointerType: "touch" },
    ]);
    expect(types(effects)).toEqual(["prevent-default", "capture", "note-on"]);
    expect(state.held.has(1)).toBe(true);
    expect(state.captured.has(1)).toBe(true);
  });

  it("does not re-trigger note-on when a second finger lands on the same key", () => {
    const { state, effects } = drive([
      { kind: "down", pointerId: 1, pointerType: "touch" },
      { kind: "down", pointerId: 2, pointerType: "touch" },
    ]);
    expect(effects.filter((e) => e.type === "note-on")).toHaveLength(1);
    expect(state.held.size).toBe(2);
  });

  it("keeps the note held when the first of two fingers lifts (same key)", () => {
    const { state, effects } = drive([
      { kind: "down", pointerId: 1, pointerType: "touch" },
      { kind: "down", pointerId: 2, pointerType: "touch" },
      { kind: "up", pointerId: 1, pointerType: "touch" },
    ]);
    expect(effects.filter((e) => e.type === "note-off")).toHaveLength(0);
    expect(state.held.has(2)).toBe(true);
    expect(state.held.has(1)).toBe(false);
  });

  it("fires note-off only when the last pointer on the key lifts", () => {
    const { effects } = drive([
      { kind: "down", pointerId: 1, pointerType: "touch" },
      { kind: "down", pointerId: 2, pointerType: "touch" },
      { kind: "up", pointerId: 1, pointerType: "touch" },
      { kind: "up", pointerId: 2, pointerType: "touch" },
    ]);
    expect(effects.filter((e) => e.type === "note-off")).toHaveLength(1);
  });

  it("ignores pointerleave from a touch finger (second finger must not kill a chord)", () => {
    const { state, effects } = drive([
      { kind: "down", pointerId: 1, pointerType: "touch" },
      { kind: "leave", pointerId: 1, pointerType: "touch" },
    ]);
    expect(effects.filter((e) => e.type === "note-off")).toHaveLength(0);
    expect(state.held.has(1)).toBe(true);
  });

  it("ignores mouse pointerleave while the pointer is captured", () => {
    const { state, effects } = drive([
      { kind: "down", pointerId: 1, pointerType: "mouse" },
      { kind: "leave", pointerId: 1, pointerType: "mouse" },
    ]);
    expect(effects.filter((e) => e.type === "note-off")).toHaveLength(0);
    expect(state.held.has(1)).toBe(true);
  });

  it("releases on mouse pointerleave when capture never stuck (stuck-note fallback)", () => {
    // Capture failed (legacy / iOS quirk): held but not in `captured`.
    const failed: PianoKeyPointerState = {
      held: new Set([1]),
      captured: new Set(),
    };
    const { state, effects } = drive(
      [{ kind: "leave", pointerId: 1, pointerType: "mouse" }],
      failed,
    );
    expect(types(effects)).toEqual(["note-off"]);
    expect(state.held.size).toBe(0);
  });

  it("releases on pointercancel (OS gesture / incoming call)", () => {
    const { state, effects } = drive([
      { kind: "down", pointerId: 7, pointerType: "touch" },
      { kind: "cancel", pointerId: 7, pointerType: "touch" },
    ]);
    expect(effects.filter((e) => e.type === "note-off")).toHaveLength(1);
    expect(state.held.size).toBe(0);
  });

  it("ignores up/leave/cancel for a pointerId this key never held", () => {
    const { state, effects } = drive([
      { kind: "down", pointerId: 1, pointerType: "touch" },
      { kind: "up", pointerId: 99, pointerType: "touch" },
      { kind: "leave", pointerId: 99, pointerType: "mouse" },
      { kind: "cancel", pointerId: 99, pointerType: "touch" },
    ]);
    expect(effects.filter((e) => e.type === "note-off")).toHaveLength(0);
    expect(state.held.has(1)).toBe(true);
  });
});

describe("multi-key chord (two independent machines)", () => {
  it("holds a triad: three keys, three pointerIds, three note-ons, no note-offs", () => {
    const c = drive([{ kind: "down", pointerId: 11, pointerType: "touch" }]);
    const e = drive([{ kind: "down", pointerId: 12, pointerType: "touch" }]);
    const g = drive([{ kind: "down", pointerId: 13, pointerType: "touch" }]);

    expect(c.effects.filter((x) => x.type === "note-on")).toHaveLength(1);
    expect(e.effects.filter((x) => x.type === "note-on")).toHaveLength(1);
    expect(g.effects.filter((x) => x.type === "note-on")).toHaveLength(1);
    expect(c.state.held.size).toBe(1);
    expect(e.state.held.size).toBe(1);
    expect(g.state.held.size).toBe(1);

    // A leave on C (the iOS "second finger landed" ghost) must not
    // release C while its pointer is still down.
    const cAfterGhost = drive(
      [{ kind: "leave", pointerId: 11, pointerType: "touch" }],
      c.state,
    );
    expect(cAfterGhost.effects.filter((x) => x.type === "note-off")).toHaveLength(0);
    expect(cAfterGhost.state.held.has(11)).toBe(true);
  });

  it("releases each chord tone independently", () => {
    let c = drive([{ kind: "down", pointerId: 11, pointerType: "touch" }]);
    let e = drive([{ kind: "down", pointerId: 12, pointerType: "touch" }]);
    c = drive([{ kind: "up", pointerId: 11, pointerType: "touch" }], c.state);
    expect(c.effects.filter((x) => x.type === "note-off")).toHaveLength(1);
    expect(e.state.held.has(12)).toBe(true);
    e = drive([{ kind: "up", pointerId: 12, pointerType: "touch" }], e.state);
    expect(e.effects.filter((x) => x.type === "note-off")).toHaveLength(1);
  });
});
