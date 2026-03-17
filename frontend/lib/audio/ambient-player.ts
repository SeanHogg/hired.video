/**
 * ambient-player.ts
 * Web Audio API-based ambient background music player.
 * No external audio files needed — generates music programmatically
 * from note patterns and oscillator synthesis.
 */

// ─── Preset definitions ────────────────────────────────────────────────────

type WaveType = "sine" | "triangle" | "sawtooth" | "square";

interface PresetDef {
  /** Base frequency in Hz (root note) */
  baseHz: number;
  /** Chord intervals in semitones layered as a pad */
  padIntervals: number[];
  /** Melody note sequence: semitone offsets from base, length must be a power of 2 */
  melody: number[];
  /** Seconds per melody step */
  stepSec: number;
  /** Pad oscillator waveform */
  padWave: WaveType;
  /** Melody oscillator waveform */
  melodyWave: WaveType;
  /** Overall master gain (0–1) */
  masterGain: number;
  /** Melody note attack (s) */
  attack: number;
  /** Melody note release (s) */
  release: number;
}

/** Frequency of MIDI note 0 = C-1 = 8.175 Hz.  semToHz(n) = 8.175 * 2^(n/12) */
function hz(semitone: number): number {
  return 8.175799 * Math.pow(2, semitone / 12);
}

/** A4 = semitone 69 */
const A3 = 57;  // 220 Hz
const E3 = 52;  // 164 Hz
const D3 = 50;  // 147 Hz
const G3 = 55;  // 196 Hz

const PRESETS: Record<string, PresetDef> = {
  "corporate-inspire": {
    baseHz: hz(A3),
    padIntervals:  [0, 7, 12, 16],        // A-E-A-C# (Amaj pad)
    melody:        [0, 4, 7, 12, 7, 4, 0, 4, 7, 16, 12, 7, 4, 7, 12, 7],
    stepSec:       0.45,
    padWave:       "sine",
    melodyWave:    "sine",
    masterGain:    0.28,
    attack:        0.12,
    release:       0.30,
  },
  "tech-ambient": {
    baseHz: hz(E3),
    padIntervals:  [0, 5, 10, 17],        // E-A-D-B (wide open voicing)
    melody:        [0, 7, 12, 7, 5, 12, 17, 12, 7, 5, 0, 5, 7, 12, 7, 5],
    stepSec:       0.6,
    padWave:       "triangle",
    melodyWave:    "triangle",
    masterGain:    0.22,
    attack:        0.18,
    release:       0.45,
  },
  "upbeat-career": {
    baseHz: hz(D3),
    padIntervals:  [0, 4, 7, 11],         // Dmaj7
    melody:        [0, 4, 7, 12, 11, 7, 4, 7, 12, 16, 14, 12, 11, 7, 4, 0],
    stepSec:       0.3,
    padWave:       "sine",
    melodyWave:    "sine",
    masterGain:    0.30,
    attack:        0.08,
    release:       0.20,
  },
  "cinematic-rise": {
    baseHz: hz(G3),
    padIntervals:  [0, 7, 12, 19],        // G-D-G-D (open fifth, two octaves)
    melody:        [0, 7, 12, 7, 19, 12, 7, 12, 19, 24, 19, 12, 7, 12, 19, 24],
    stepSec:       0.7,
    padWave:       "triangle",
    melodyWave:    "sine",
    masterGain:    0.26,
    attack:        0.25,
    release:       0.60,
  },
  "minimal-focus": {
    baseHz: hz(A3),
    padIntervals:  [0, 12],               // A-A (pure octave drone)
    melody:        [0, 0, 7, 0, 12, 0, 7, 0, 0, 12, 7, 0, 12, 7, 0, 7],
    stepSec:       0.8,
    padWave:       "sine",
    melodyWave:    "sine",
    masterGain:    0.18,
    attack:        0.20,
    release:       0.65,
  },
};

// ─── Player ────────────────────────────────────────────────────────────────

export class AmbientPlayer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private padOscillators: OscillatorNode[] = [];
  private padGains: GainNode[] = [];
  private schedulerTimer: ReturnType<typeof setTimeout> | null = null;
  private stepIndex = 0;
  private preset: PresetDef | null = null;
  private volume = 0.6;
  private _playing = false;
  private _ownsContext = true;

  get playing() { return this._playing; }

  // ── Start / stop ──────────────────────────────────────────────────────────

  play(trackKey: string, volume = 0.6) {
    this.stop();
    const def = PRESETS[trackKey];
    if (!def) return;
    this.preset = def;
    this.volume = volume;
    this._playing = true;
    this._ownsContext = true;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = def.masterGain * volume;
    this.masterGain.connect(this.ctx.destination);
    this.startPad(def);
    this.scheduleMelody(def);
  }

  /**
   * Play to an external AudioContext and destination node (for export audio capture).
   * The caller owns the AudioContext and is responsible for closing it.
   */
  playToDestination(trackKey: string, volume: number, ctx: AudioContext, dest: AudioNode) {
    this.stop();
    const def = PRESETS[trackKey];
    if (!def) return;
    this.preset = def;
    this.volume = volume;
    this._playing = true;
    this._ownsContext = false;
    this.ctx = ctx;
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = def.masterGain * volume;
    this.masterGain.connect(dest);
    this.startPad(def);
    this.scheduleMelody(def);
  }

  stop() {
    this._playing = false;
    if (this.schedulerTimer) { clearTimeout(this.schedulerTimer); this.schedulerTimer = null; }
    this.padOscillators.forEach((o) => { try { o.stop(); } catch {} });
    this.padOscillators = [];
    this.padGains = [];
    if (this.masterGain) { this.masterGain.disconnect(); this.masterGain = null; }
    if (this.ctx && this._ownsContext) { this.ctx.close().catch(() => {}); }
    this.ctx = null;
    this._ownsContext = true;
    this.stepIndex = 0;
    this.preset = null;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.masterGain && this.preset) {
      this.masterGain.gain.setTargetAtTime(this.preset.masterGain * v, this.ctx!.currentTime, 0.05);
    }
  }

  destroy() { this.stop(); }

  // ── Pad layer (sustained chords) ──────────────────────────────────────────

  private startPad(def: PresetDef) {
    if (!this.ctx || !this.masterGain) return;
    const padGain = this.ctx.createGain();
    padGain.gain.value = 0.4;
    padGain.connect(this.masterGain);

    // Add gentle chorus-like effect by layering slightly detuned oscillators
    for (const interval of def.padIntervals) {
      for (const detune of [0, -3, 3]) {
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = def.padWave;
        osc.frequency.value = def.baseHz * Math.pow(2, interval / 12);
        osc.detune.value = detune;
        oscGain.gain.value = detune === 0 ? 0.5 : 0.15;
        osc.connect(oscGain);
        oscGain.connect(padGain);
        osc.start();
        this.padOscillators.push(osc);
        this.padGains.push(oscGain);
      }
    }

    // Slow LFO for gentle tremolo
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 0.15;
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain);
    lfoGain.connect(padGain.gain);
    lfo.start();
    this.padOscillators.push(lfo);
    this.padGains.push(lfoGain as unknown as GainNode);
  }

  // ── Melody sequencer ──────────────────────────────────────────────────────

  private scheduleMelody(def: PresetDef) {
    if (!this._playing || !this.ctx || !this.masterGain) return;

    const melodyGain = this.ctx.createGain();
    melodyGain.gain.value = 0.55;
    melodyGain.connect(this.masterGain);

    const now = this.ctx.currentTime;
    const semitones = def.melody[this.stepIndex % def.melody.length];
    const freq = def.baseHz * Math.pow(2, semitones / 12);

    const osc = this.ctx.createOscillator();
    const noteGain = this.ctx.createGain();
    osc.type = def.melodyWave;
    osc.frequency.value = freq;

    // Envelope
    noteGain.gain.setValueAtTime(0, now);
    noteGain.gain.linearRampToValueAtTime(0.7, now + def.attack);
    noteGain.gain.setTargetAtTime(0, now + def.attack, def.release * 0.5);

    osc.connect(noteGain);
    noteGain.connect(melodyGain);
    osc.start(now);
    osc.stop(now + def.stepSec);

    this.stepIndex = (this.stepIndex + 1) % def.melody.length;

    this.schedulerTimer = setTimeout(
      () => this.scheduleMelody(def),
      def.stepSec * 1000,
    );
  }
}

// ─── Singleton for preview use ─────────────────────────────────────────────

let _instance: AmbientPlayer | null = null;

export function getAmbientPlayer(): AmbientPlayer {
  if (!_instance) _instance = new AmbientPlayer();
  return _instance;
}
