/**
 * Unit coverage for the synth patch model + JSON preset round-trip
 * (the serialisable half of the APEX synth mixer, gap #457). These are
 * pure-data paths — no Web Audio / Tone.js — so they run in jsdom.
 *
 * The preset parser MUST never throw on a hand-edited or older file:
 * every gap falls back to the default patch so a partial preset still
 * loads into a playable instrument. The garbage/partial fixtures below
 * pin that contract.
 *
 * Run: vitest run lib/audio/__tests__/synth-patch.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  dbToGain,
  makeDefaultPatch,
  makeEffect,
  makeFilter,
  makeOscillator,
  nextPatchId,
} from "../synth-patch";
import {
  coercePatch,
  serializeSynthPreset,
} from "../synth-preset";
import type { SynthPatch } from "../synth-patch";

// Default patch elements get freshly-minted unique ids on every
// makeDefaultPatch() call, so structural comparisons strip ids first.
function withoutIds(patch: SynthPatch) {
  const drop = <T extends { id: string }>(xs: T[]) => xs.map(({ id: _id, ...rest }) => rest);
  return {
    ...patch,
    oscillators: drop(patch.oscillators),
    filters: drop(patch.filters),
    effects: drop(patch.effects),
  };
}

describe("synth-patch model", () => {
  it("default patch is playable — one+ oscillator, valid master gain, full ADSR", () => {
    const p = makeDefaultPatch();
    expect(p.oscillators.length).toBeGreaterThanOrEqual(1);
    expect(p.master.gain).toBeGreaterThan(0);
    expect(p.master.gain).toBeLessThanOrEqual(1);
    expect(p.adsr).toMatchObject({
      attack: expect.any(Number),
      decay: expect.any(Number),
      sustain: expect.any(Number),
      release: expect.any(Number),
    });
  });

  it("factories produce unique ids", () => {
    const ids = new Set([
      makeOscillator().id,
      makeOscillator().id,
      makeFilter().id,
      makeEffect().id,
      nextPatchId("x"),
    ]);
    expect(ids.size).toBe(5);
  });

  it("dbToGain: 0 dB is unity, +6 dB ~doubles, -6 dB ~halves", () => {
    expect(dbToGain(0)).toBeCloseTo(1, 5);
    expect(dbToGain(6)).toBeCloseTo(1.995, 2);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 2);
  });
});

describe("synth preset round-trip", () => {
  it("serialize → coerce preserves a real authored patch", () => {
    const authored = makeDefaultPatch();
    authored.oscillators = [
      makeOscillator({ waveform: "sawtooth", detuneSemis: -12, detuneCents: 7, gain: 0.6, pan: -0.3 }),
      makeOscillator({ waveform: "square", gain: 0.4, pan: 0.3 }),
    ];
    authored.filters = [makeFilter({ type: "highpass", cutoff: 300, resonance: 4.5, drive: 3 })];
    authored.effects = [makeEffect({ type: "delay", mix: 0.4 }), makeEffect({ type: "chorus", mix: 0.2 })];
    authored.master = { gain: 0.7, detuneCents: -5 };
    authored.adsr = { attack: 0.02, decay: 0.1, sustain: 0.5, release: 0.3 };

    const preset = serializeSynthPreset("Lead patch", authored);
    expect(preset.kind).toBe("studio-synth-preset");
    expect(preset.name).toBe("Lead patch");

    const reloaded = coercePatch(JSON.parse(JSON.stringify(preset.patch)));
    expect(reloaded).toEqual(authored);
  });

  it("blank name falls back rather than producing an empty file name", () => {
    expect(serializeSynthPreset("   ", makeDefaultPatch()).name).toBe("Untitled patch");
  });
});

describe("synth preset defensive parsing", () => {
  it("non-object input → full default patch", () => {
    const def = withoutIds(makeDefaultPatch());
    expect(withoutIds(coercePatch(null))).toEqual(def);
    expect(withoutIds(coercePatch("nope"))).toEqual(def);
    expect(withoutIds(coercePatch(42))).toEqual(def);
  });

  it("partial patch (only oscillators) fills the rest from defaults", () => {
    const def = makeDefaultPatch();
    const parsed = coercePatch({
      oscillators: [{ waveform: "sine", gain: 0.5 }],
    });
    expect(parsed.oscillators).toHaveLength(1);
    expect(parsed.oscillators[0].waveform).toBe("sine");
    expect(parsed.oscillators[0].gain).toBe(0.5);
    // Missing osc fields fall back to the default oscillator's values.
    expect(parsed.oscillators[0].pan).toBe(def.oscillators[0].pan);
    // Missing sections come straight from defaults — same values, but
    // freshly-minted (unique) ids, so compare id-agnostically.
    expect(withoutIds(parsed).filters).toEqual(withoutIds(def).filters);
    expect(withoutIds(parsed).effects).toEqual(withoutIds(def).effects);
    expect(parsed.master).toEqual(def.master);
    expect(parsed.adsr).toEqual(def.adsr);
  });

  it("invalid enum values + non-numeric scalars fall back, not crash", () => {
    const def = makeDefaultPatch();
    const parsed = coercePatch({
      oscillators: [{ waveform: "pulse" /* not in 4-waveform set */, gain: "loud" }],
      filters: [{ type: "comb" /* invalid */, cutoff: "open" }],
      effects: [{ type: "flanger" /* invalid */, mix: null }],
      master: { gain: "max" },
      adsr: { attack: "fast" },
    });
    expect(parsed.oscillators[0].waveform).toBe(def.oscillators[0].waveform);
    expect(parsed.oscillators[0].gain).toBe(def.oscillators[0].gain);
    expect(parsed.filters[0].type).toBe(def.filters[0].type);
    expect(parsed.filters[0].cutoff).toBe(def.filters[0].cutoff);
    expect(parsed.effects[0].type).toBe(def.effects[0].type);
    expect(parsed.effects[0].mix).toBe(def.effects[0].mix);
    expect(parsed.master.gain).toBe(def.master.gain);
    expect(parsed.adsr.attack).toBe(def.adsr.attack);
  });

  it("empty oscillator array falls back to default stack (never a silent instrument)", () => {
    const parsed = coercePatch({ oscillators: [] });
    expect(parsed.oscillators.length).toBeGreaterThanOrEqual(1);
  });
});
