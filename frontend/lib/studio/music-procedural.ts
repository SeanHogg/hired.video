/**
 * Procedural music generation for the stock catalog.
 *
 * The v1 build referenced `/audio/*.mp3` files that were never bundled
 * with the SPA — the picker preview button and the v2 preview-playback
 * both produced silent `Audio` elements. Rather than ship copyrighted
 * MP3s, every catalog entry is rendered procedurally via the same
 * synth primitives (`schedulePitchedNote` + the drum/bass/melody
 * scheduling math from `OriginalMusicComposer`) so the catalog stays a
 * single source of truth — adding a track is one entry here AND one
 * entry in `MUSIC_TRACKS`.
 *
 * Generation is lazy + cached: the first call for a given id renders
 * an OfflineAudioContext to a WAV blob and returns its blob URL; every
 * subsequent call reuses the same URL. Callers (`MusicPicker` preview,
 * `usePreviewPlayback` composition music) just `await` this once.
 */

import { audioBufferToWav } from "@/lib/audio/wav";
import {
  schedulePitchedNote,
  DEFAULT_ADSR,
  type ADSR,
  type Waveform,
} from "@/lib/audio/synth-engine";

// C major one-octave scale (C4..C5), same indices the OriginalMusicComposer
// uses — kept identical so a step-pattern reads the same here.
const SCALE_FREQS = [
  261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25,
];

const STEPS = 16;

type Lane = "kick" | "snare" | "hat" | "bass" | "melody";

interface ProceduralPreset {
  bpm: number;
  durationSec: number;
  filterCutoff: number;
  adsr: ADSR;
  waveformBass: Waveform;
  waveformMelody: Waveform;
  pattern: Record<Lane, number[]>;
}

// Per-id presets — chosen so each genre roughly matches the catalog
// label. Loops every 4 beats (16 steps) for a short, tidy preview that
// covers the full composition during long compositions via re-render.
const PRESETS: Record<string, ProceduralPreset> = {
  "corporate-inspire": {
    bpm: 110,
    durationSec: 28,
    filterCutoff: 6000,
    adsr: { attack: 0.02, decay: 0.08, sustain: 0.7, release: 0.15 },
    waveformBass: "triangle",
    waveformMelody: "sine",
    pattern: {
      kick:   pat([0, 4, 8, 12]),
      snare:  pat([4, 12]),
      hat:    pat([0, 2, 4, 6, 8, 10, 12, 14]),
      bass:   pitched([[0, 1], [4, 1], [8, 5], [12, 5]]),
      melody: pitched([[0, 5], [2, 7], [4, 8], [6, 7], [8, 5], [10, 3], [12, 1], [14, 3]]),
    },
  },
  "tech-ambient": {
    bpm: 100,
    durationSec: 24,
    filterCutoff: 4500,
    adsr: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 0.4 },
    waveformBass: "sawtooth",
    waveformMelody: "triangle",
    pattern: {
      kick:   pat([0, 8]),
      snare:  pat([]),
      hat:    pat([2, 6, 10, 14]),
      bass:   pitched([[0, 1], [6, 4], [8, 5], [14, 4]]),
      melody: pitched([[0, 8], [4, 5], [8, 8], [12, 6]]),
    },
  },
  "upbeat-career": {
    bpm: 128,
    durationSec: 24,
    filterCutoff: 8000,
    adsr: { attack: 0.01, decay: 0.05, sustain: 0.6, release: 0.1 },
    waveformBass: "square",
    waveformMelody: "sawtooth",
    pattern: {
      kick:   pat([0, 4, 8, 12]),
      snare:  pat([4, 12]),
      hat:    pat([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
      bass:   pitched([[0, 1], [3, 1], [4, 5], [8, 1], [12, 5]]),
      melody: pitched([[0, 5], [2, 8], [4, 7], [6, 5], [8, 3], [10, 5], [12, 8], [14, 5]]),
    },
  },
  "cinematic-rise": {
    bpm: 90,
    durationSec: 32,
    filterCutoff: 5000,
    adsr: { attack: 0.1, decay: 0.3, sustain: 0.5, release: 0.6 },
    waveformBass: "triangle",
    waveformMelody: "triangle",
    pattern: {
      kick:   pat([0, 8]),
      snare:  pat([8]),
      hat:    pat([]),
      bass:   pitched([[0, 1], [4, 3], [8, 5], [12, 6]]),
      melody: pitched([[0, 5], [4, 7], [8, 8], [12, 7], [14, 8]]),
    },
  },
  "minimal-focus": {
    bpm: 95,
    durationSec: 24,
    filterCutoff: 3500,
    adsr: { attack: 0.05, decay: 0.1, sustain: 0.5, release: 0.3 },
    waveformBass: "sine",
    waveformMelody: "sine",
    pattern: {
      kick:   pat([0]),
      snare:  pat([]),
      hat:    pat([4, 12]),
      bass:   pitched([[0, 1], [8, 3]]),
      melody: pitched([[0, 5], [4, 6], [8, 8], [12, 6]]),
    },
  },
};

function pat(active: number[]): number[] {
  const arr = new Array(STEPS).fill(0);
  for (const i of active) arr[i] = 1;
  return arr;
}

function pitched(notes: Array<[step: number, degree: number]>): number[] {
  const arr = new Array(STEPS).fill(0);
  for (const [s, d] of notes) arr[s] = d;
  return arr;
}

// Module-level cache so the same blob URL is reused across the
// MusicPicker preview, usePreviewPlayback, and any future music
// consumer. Promise-keyed so concurrent callers share one render.
const cache = new Map<string, Promise<string>>();

export function hasProceduralMusic(trackId: string): boolean {
  return trackId in PRESETS;
}

export function getProceduralMusicUrl(trackId: string): Promise<string> {
  const cached = cache.get(trackId);
  if (cached) return cached;
  const preset = PRESETS[trackId];
  if (!preset) return Promise.reject(new Error(`Unknown procedural track: ${trackId}`));
  const pending = renderToBlobUrl(preset);
  cache.set(trackId, pending);
  return pending;
}

async function renderToBlobUrl(preset: ProceduralPreset): Promise<string> {
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(
    2,
    Math.ceil(preset.durationSec * sampleRate),
    sampleRate,
  );

  const masterFilter = ctx.createBiquadFilter();
  masterFilter.type = "lowpass";
  masterFilter.frequency.value = preset.filterCutoff;
  masterFilter.Q.value = 0.7;
  masterFilter.connect(ctx.destination);

  const stepDur = 60 / preset.bpm / 4;
  const loopDur = STEPS * stepDur;
  const loops = Math.ceil(preset.durationSec / loopDur);

  for (let loop = 0; loop < loops; loop++) {
    for (let step = 0; step < STEPS; step++) {
      const t = loop * loopDur + step * stepDur;
      if (t >= preset.durationSec) break;
      scheduleLane("kick",   preset, t, step, stepDur, masterFilter, ctx);
      scheduleLane("snare",  preset, t, step, stepDur, masterFilter, ctx);
      scheduleLane("hat",    preset, t, step, stepDur, masterFilter, ctx);
      scheduleLane("bass",   preset, t, step, stepDur, masterFilter, ctx);
      scheduleLane("melody", preset, t, step, stepDur, masterFilter, ctx);
    }
  }

  const buf = await ctx.startRendering();
  const wav = audioBufferToWav(buf);
  const blob = new Blob([wav], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

function scheduleLane(
  lane: Lane,
  preset: ProceduralPreset,
  t: number,
  step: number,
  stepDur: number,
  dest: AudioNode,
  ctx: OfflineAudioContext,
): void {
  const value = preset.pattern[lane][step];
  if (!value) return;

  if (lane === "kick") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    gain.gain.setValueAtTime(1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + 0.2);
    return;
  }
  if (lane === "snare") {
    const dur = 0.12;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1500;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(hp).connect(gain).connect(dest);
    src.start(t);
    src.stop(t + dur);
    return;
  }
  if (lane === "hat") {
    const dur = 0.05;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(hp).connect(gain).connect(dest);
    src.start(t);
    src.stop(t + dur);
    return;
  }
  if (value < 1 || value > 8) return;
  const freq =
    lane === "bass"
      ? SCALE_FREQS[value - 1] / 2
      : SCALE_FREQS[value - 1];
  schedulePitchedNote(
    ctx,
    t,
    freq,
    lane === "bass" ? preset.waveformBass : preset.waveformMelody,
    lane === "bass" ? 0.25 : 0.18,
    preset.adsr ?? DEFAULT_ADSR,
    stepDur * 0.9,
    dest,
  );
}
