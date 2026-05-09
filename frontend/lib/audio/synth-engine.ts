// Shared synthesis primitives consumed by every Studio music surface.
// Lifted (without modification) from C:\code\hired\synth — full 88-key
// frequency table, Web-Audio-only ADSR voice, no Tone.js dep.
//
// Both `OriginalMusicComposer` (step sequencer) and `PianoComposer`
// (live-played keyboard) call `schedulePitchedNote` so the timbre,
// envelope, and ADSR-on-truncated-notes math live in ONE place. Don't
// inline this into a single composer — the contract has to stay
// identical across surfaces or the music sounds different depending
// on which interface produced it.

export type Waveform = "sine" | "triangle" | "square" | "sawtooth";

export const WAVEFORMS: Waveform[] = ["sine", "triangle", "square", "sawtooth"];
export const WAVEFORM_LABEL: Record<Waveform, string> = {
  sine: "∿ Sine",
  triangle: "△ Tri",
  square: "▭ Square",
  sawtooth: "◢ Saw",
};

export interface ADSR {
  attack: number;   // seconds
  decay: number;    // seconds
  sustain: number;  // 0..1 level multiplier on peak
  release: number;  // seconds
}

export const DEFAULT_ADSR: ADSR = {
  attack: 0.01,
  decay: 0.05,
  sustain: 0.6,
  release: 0.08,
};

// 88-key piano: A0 (27.5 Hz) to C8 (4186 Hz). Lifted verbatim from
// C:\code\hired\synth\client\components\Piano.tsx so the two surfaces
// agree on tuning to the cent.
export const NOTE_FREQUENCIES: Record<string, number> = {
  C0: 16.35, "C#0": 17.32, D0: 18.35, "D#0": 19.45, E0: 20.6,
  F0: 21.83, "F#0": 23.12, G0: 24.5, "G#0": 25.96, A0: 27.5,
  "A#0": 29.14, B0: 30.87,
  C1: 32.7, "C#1": 34.65, D1: 36.71, "D#1": 38.89, E1: 41.2,
  F1: 43.65, "F#1": 46.25, G1: 49, "G#1": 51.91, A1: 55,
  "A#1": 58.27, B1: 61.74,
  C2: 65.41, "C#2": 69.3, D2: 73.42, "D#2": 77.78, E2: 82.41,
  F2: 87.31, "F#2": 92.5, G2: 98, "G#2": 103.83, A2: 110,
  "A#2": 116.54, B2: 123.47,
  C3: 130.81, "C#3": 138.59, D3: 146.83, "D#3": 155.56, E3: 164.81,
  F3: 174.61, "F#3": 185, G3: 196, "G#3": 207.65, A3: 220,
  "A#3": 233.08, B3: 246.94,
  C4: 261.63, "C#4": 277.18, D4: 293.66, "D#4": 311.13, E4: 329.63,
  F4: 349.23, "F#4": 369.99, G4: 392, "G#4": 415.3, A4: 440,
  "A#4": 466.16, B4: 493.88,
  C5: 523.25, "C#5": 554.37, D5: 587.33, "D#5": 622.25, E5: 659.25,
  F5: 698.46, "F#5": 739.99, G5: 783.99, "G#5": 830.61, A5: 880,
  "A#5": 932.33, B5: 987.77,
  C6: 1046.5, "C#6": 1108.73, D6: 1174.66, "D#6": 1244.51, E6: 1318.51,
  F6: 1396.91, "F#6": 1479.98, G6: 1567.98, "G#6": 1661.22, A6: 1760,
  "A#6": 1864.66, B6: 1975.53,
  C7: 2093, "C#7": 2217.46, D7: 2349.32, "D#7": 2489.02, E7: 2637.02,
  F7: 2793.83, "F#7": 2959.96, G7: 3135.96, "G#7": 3322.44, A7: 3520,
  "A#7": 3729.31, B7: 3951.07,
  C8: 4186.01,
};

/**
 * One ADSR-driven pitched note. Works against both `AudioContext`
 * (live play) and `OfflineAudioContext` (render to WAV) — same
 * BaseAudioContext interface.
 *
 * `noteDur` is the time between key-down and key-up (or step length
 * for sequencers). Release tail extends past `noteDur` so trails work
 * without truncation.
 */
export function schedulePitchedNote(
  ctx: BaseAudioContext,
  startTime: number,
  freq: number,
  waveform: Waveform,
  peak: number,
  adsr: ADSR,
  noteDur: number,
  dest: AudioNode,
): void {
  const t = startTime;
  const safeDur = Math.max(0.02, noteDur);
  const noteOff = t + safeDur;
  const sustainLevel = peak * adsr.sustain;

  const osc = ctx.createOscillator();
  osc.type = waveform;
  osc.frequency.setValueAtTime(freq, t);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  // Attack: 0 → peak (clamped so attack can't exceed note duration).
  const aEnd = t + Math.min(adsr.attack, safeDur);
  gain.gain.linearRampToValueAtTime(peak, aEnd);
  // Decay: peak → sustain (clamped to noteOff).
  const dEnd = Math.min(aEnd + adsr.decay, noteOff);
  gain.gain.linearRampToValueAtTime(sustainLevel, dEnd);
  // Sustain: hold at sustainLevel until noteOff.
  gain.gain.setValueAtTime(sustainLevel, noteOff);
  // Release: sustain → 0 starting at noteOff.
  gain.gain.linearRampToValueAtTime(0, noteOff + adsr.release);

  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(noteOff + adsr.release + 0.01);
}

// ── Recorded notes → WAV pipeline ───────────────────────────────────────────
//
// PianoComposer stores live-played notes as `{ freq, startSec, durationSec }`.
// This helper renders them offline into a WAV Blob so the music lane can
// consume them. Step-sequencer rendering stays in OriginalMusicComposer
// because it has its own scheduling loop + drum lanes — only the piano
// uses this exact shape.

export interface PlayedNote {
  freq: number;
  startSec: number;
  durationSec: number;
}

export interface RenderPlayedNotesOpts {
  notes: PlayedNote[];
  /** Render duration in seconds. Should be ≥ last note end + release tail. */
  durationSec: number;
  waveform: Waveform;
  adsr: ADSR;
  /** Master low-pass cutoff in Hz. */
  filterCutoff: number;
  /** Per-note peak gain (0..1). */
  peak?: number;
  sampleRate?: number;
}

export async function renderPlayedNotesToBuffer(
  opts: RenderPlayedNotesOpts,
): Promise<AudioBuffer> {
  const sampleRate = opts.sampleRate ?? 44100;
  const ctx = new OfflineAudioContext(
    2,
    Math.ceil(opts.durationSec * sampleRate),
    sampleRate,
  );
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = opts.filterCutoff;
  filter.Q.value = 0.7;
  filter.connect(ctx.destination);

  const peak = opts.peak ?? 0.18;
  for (const n of opts.notes) {
    if (n.startSec >= opts.durationSec) continue;
    schedulePitchedNote(
      ctx,
      n.startSec,
      n.freq,
      opts.waveform,
      peak,
      opts.adsr,
      n.durationSec,
      filter,
    );
  }

  return ctx.startRendering();
}
