// synth-preset.ts — JSON save / load for a SynthPatch.
//
// The "JSON preset save/load" leg of the APEX synth (deferred in gap
// #457). Pure data in / out — no audio or DOM imports beyond the file
// download/upload glue — so it stays testable and the patch model is
// the single serialised shape (no parallel DTO).
//
// Versioned so future patch-shape changes can migrate rather than
// silently mis-parse an old file.

import {
  makeDefaultPatch,
  type EffectSpec,
  type FilterSpec,
  type OscillatorSpec,
  type SynthPatch,
} from "./synth-patch";

const PRESET_VERSION = 1;

export interface SynthPreset {
  kind: "studio-synth-preset";
  version: number;
  name: string;
  /** ISO timestamp the preset was exported. */
  savedAt: string;
  patch: SynthPatch;
}

export function serializeSynthPreset(name: string, patch: SynthPatch): SynthPreset {
  return {
    kind: "studio-synth-preset",
    version: PRESET_VERSION,
    name: name.trim() || "Untitled patch",
    savedAt: new Date().toISOString(),
    patch,
  };
}

/** Trigger a browser download of the preset as a .synth.json file. */
export function downloadSynthPreset(preset: SynthPreset): void {
  const json = JSON.stringify(preset, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safe = preset.name.replace(/[^a-z0-9-_ ]/gi, "").trim() || "patch";
  link.href = url;
  link.download = `${safe}.synth.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── parsing / validation ────────────────────────────────────────────────────
//
// Defensive: a hand-edited or older preset must never crash the editor.
// Anything missing falls back to the default patch's value so a partial
// file still loads into a playable instrument.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function coerceOscillator(raw: unknown, fallback: OscillatorSpec): OscillatorSpec {
  if (!isRecord(raw)) return fallback;
  return {
    id: asString(raw.id, fallback.id),
    waveform: (["sine", "triangle", "square", "sawtooth"] as const).includes(
      raw.waveform as OscillatorSpec["waveform"],
    )
      ? (raw.waveform as OscillatorSpec["waveform"])
      : fallback.waveform,
    detuneSemis: asNumber(raw.detuneSemis, fallback.detuneSemis),
    detuneCents: asNumber(raw.detuneCents, fallback.detuneCents),
    gain: asNumber(raw.gain, fallback.gain),
    pan: asNumber(raw.pan, fallback.pan),
    enabled: asBool(raw.enabled, fallback.enabled),
  };
}

function coerceFilter(raw: unknown, fallback: FilterSpec): FilterSpec {
  if (!isRecord(raw)) return fallback;
  return {
    id: asString(raw.id, fallback.id),
    type: (["lowpass", "highpass", "bandpass"] as const).includes(
      raw.type as FilterSpec["type"],
    )
      ? (raw.type as FilterSpec["type"])
      : fallback.type,
    cutoff: asNumber(raw.cutoff, fallback.cutoff),
    resonance: asNumber(raw.resonance, fallback.resonance),
    drive: asNumber(raw.drive, fallback.drive),
    enabled: asBool(raw.enabled, fallback.enabled),
  };
}

function coerceEffect(raw: unknown, fallback: EffectSpec): EffectSpec {
  if (!isRecord(raw)) return fallback;
  return {
    id: asString(raw.id, fallback.id),
    type: (["reverb", "delay", "chorus"] as const).includes(
      raw.type as EffectSpec["type"],
    )
      ? (raw.type as EffectSpec["type"])
      : fallback.type,
    mix: asNumber(raw.mix, fallback.mix),
    enabled: asBool(raw.enabled, fallback.enabled),
  };
}

/** Coerce an arbitrary parsed object into a valid SynthPatch, filling
 *  gaps from the default patch. Always returns a playable instrument. */
export function coercePatch(raw: unknown): SynthPatch {
  const def = makeDefaultPatch();
  if (!isRecord(raw)) return def;

  const oscillators = Array.isArray(raw.oscillators) && raw.oscillators.length
    ? raw.oscillators.map((o) => coerceOscillator(o, def.oscillators[0]))
    : def.oscillators;
  const filters = Array.isArray(raw.filters)
    ? raw.filters.map((f) => coerceFilter(f, def.filters[0]))
    : def.filters;
  const effects = Array.isArray(raw.effects)
    ? raw.effects.map((e) => coerceEffect(e, def.effects[0]))
    : def.effects;

  const masterRaw = isRecord(raw.master) ? raw.master : {};
  const adsrRaw = isRecord(raw.adsr) ? raw.adsr : {};

  return {
    oscillators,
    filters,
    effects,
    master: {
      gain: asNumber(masterRaw.gain, def.master.gain),
      detuneCents: asNumber(masterRaw.detuneCents, def.master.detuneCents),
    },
    adsr: {
      attack: asNumber(adsrRaw.attack, def.adsr.attack),
      decay: asNumber(adsrRaw.decay, def.adsr.decay),
      sustain: asNumber(adsrRaw.sustain, def.adsr.sustain),
      release: asNumber(adsrRaw.release, def.adsr.release),
    },
  };
}

export interface ParsedPreset {
  name: string;
  patch: SynthPatch;
}

/** Read a user-selected .json preset File into a name + validated patch. */
export function parseSynthPresetFile(file: File): Promise<ParsedPreset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(String(e.target?.result ?? "")) as unknown;
        const root = isRecord(parsed) ? parsed : {};
        const patchSource = isRecord(root.patch) ? root.patch : root;
        resolve({
          name: asString(root.name, "Imported patch"),
          patch: coercePatch(patchSource),
        });
      } catch {
        reject(new Error("That file isn't a valid synth preset."));
      }
    };
    reader.onerror = () => reject(new Error("Couldn't read the preset file."));
    reader.readAsText(file);
  });
}
