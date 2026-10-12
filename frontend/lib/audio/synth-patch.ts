// synth-patch.ts — serializable data model for the full Studio synth
// (the "sound mixer" half of the APEX port, gap #457).
//
// A SynthPatch is the complete description of an instrument: a stack of
// oscillators, a serial filter rack, a serial effect rack, master
// output, and a shared ADSR envelope. It is pure data — no Web Audio /
// Tone.js imports — so it round-trips to JSON (preset save/load) and is
// consumed identically by the live preview graph and the offline WAV
// renderer in `synth-graph.ts`.
//
// Reuses the shared `Waveform` + `ADSR` primitives from `synth-engine`
// so the synth, the step sequencer, and the simple piano all agree on
// timbre vocabulary. The richer per-voice routing (multi-osc stacks,
// filter/effect racks) lives here; the single-note envelope math stays
// in synth-engine.

import { DEFAULT_ADSR, type ADSR, type Waveform } from "./synth-engine";

export type FilterType = "lowpass" | "highpass" | "bandpass";
export type EffectType = "reverb" | "delay" | "chorus";

export const FILTER_TYPES: FilterType[] = ["lowpass", "highpass", "bandpass"];
export const EFFECT_TYPES: EffectType[] = ["reverb", "delay", "chorus"];

export const FILTER_TYPE_LABEL: Record<FilterType, string> = {
  lowpass: "Low-pass",
  highpass: "High-pass",
  bandpass: "Band-pass",
};

export const EFFECT_TYPE_LABEL: Record<EffectType, string> = {
  reverb: "Reverb",
  delay: "Delay",
  chorus: "Chorus",
};

/** One oscillator in the voice stack. Every played note instantiates
 *  the full enabled stack, summed before the shared envelope. */
export interface OscillatorSpec {
  id: string;
  waveform: Waveform;
  /** Whole-semitone offset from the played note (e.g. -12 = octave down, +7 = fifth). */
  detuneSemis: number;
  /** Fine detune in cents (-100..100) for unison/chorus-style thickening. */
  detuneCents: number;
  /** Level 0..1 (mixed against the other oscillators). */
  gain: number;
  /** Stereo pan -1 (L) .. 1 (R). */
  pan: number;
  enabled: boolean;
}

/** One filter in the serial rack. Disabled filters are skipped in the
 *  signal chain (not bypassed-in-place) so CPU is only spent on active
 *  stages. */
export interface FilterSpec {
  id: string;
  type: FilterType;
  /** Cutoff frequency in Hz (20..20000). */
  cutoff: number;
  /** Resonance / Q (0..20). */
  resonance: number;
  /** Pre-filter drive in dB (-12..12). */
  drive: number;
  enabled: boolean;
}

/** One effect in the serial rack. `mix` is the wet amount 0..1. */
export interface EffectSpec {
  id: string;
  type: EffectType;
  mix: number;
  enabled: boolean;
}

export interface MasterSpec {
  /** Output gain 0..1. */
  gain: number;
  /** Global tuning offset in cents (-100..100), added to every oscillator. */
  detuneCents: number;
}

export interface SynthPatch {
  oscillators: OscillatorSpec[];
  filters: FilterSpec[];
  effects: EffectSpec[];
  master: MasterSpec;
  adsr: ADSR;
}

// ── id + math helpers ───────────────────────────────────────────────────────

let _idSeq = 0;
/** Stable-enough unique id for a patch element. Patch elements need
 *  stable ids so React lists + the live-graph node maps key correctly
 *  across re-renders (per the studio's "section items need stable ids"
 *  rule). */
export function nextPatchId(prefix: string): string {
  _idSeq += 1;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${_idSeq}-${rand}`;
}

/** dB → linear gain multiplier. Shared by the filter-drive stage in
 *  both the live graph and the offline renderer. */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

// ── factories ───────────────────────────────────────────────────────────────

export function makeOscillator(overrides: Partial<OscillatorSpec> = {}): OscillatorSpec {
  return {
    id: nextPatchId("osc"),
    waveform: "triangle",
    detuneSemis: 0,
    detuneCents: 0,
    gain: 0.8,
    pan: 0,
    enabled: true,
    ...overrides,
  };
}

export function makeFilter(overrides: Partial<FilterSpec> = {}): FilterSpec {
  return {
    id: nextPatchId("flt"),
    type: "lowpass",
    cutoff: 8000,
    resonance: 1,
    drive: 0,
    enabled: true,
    ...overrides,
  };
}

export function makeEffect(overrides: Partial<EffectSpec> = {}): EffectSpec {
  return {
    id: nextPatchId("fx"),
    type: "reverb",
    mix: 0.25,
    enabled: true,
    ...overrides,
  };
}

/** A musically useful starting patch — a detuned two-oscillator stack
 *  (triangle + saw an octave-ish apart), a low-pass to tame the saw,
 *  and a touch of reverb. Showcases every rack without being noisy. */
export function makeDefaultPatch(): SynthPatch {
  return {
    oscillators: [
      makeOscillator({ waveform: "triangle", gain: 0.8 }),
      makeOscillator({ waveform: "sawtooth", gain: 0.35, detuneCents: 8, pan: 0.15 }),
    ],
    filters: [makeFilter({ type: "lowpass", cutoff: 6500, resonance: 1.2 })],
    effects: [makeEffect({ type: "reverb", mix: 0.22 })],
    master: { gain: 0.85, detuneCents: 0 },
    adsr: { ...DEFAULT_ADSR },
  };
}
