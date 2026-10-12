// synth-graph.ts — Tone.js realisation of a SynthPatch.
//
// One module owns BOTH play paths so the live preview and the exported
// WAV are guaranteed to sound identical (the recurring hazard called
// out in synth-engine: "the contract has to stay identical across
// surfaces or the music sounds different depending on which interface
// produced it"):
//
//   • LiveSynth          — interactive keyboard preview against the
//                          shared live Tone context. Held notes keep
//                          ringing while you tweak the racks; continuous
//                          params ramp in place, structural changes
//                          (add/remove/retype a filter or effect)
//                          rebuild only the post-voice chain.
//   • renderPatchToWavBlob — deterministic offline bounce of recorded
//                          notes through the SAME buildChain/buildVoice
//                          helpers via Tone.Offline → 16-bit WAV Blob,
//                          ready for the music lane (onMusicReady).
//
// Effects use Tone.js (Reverb / FeedbackDelay / Chorus) per the product
// decision to add the dep rather than hand-roll convolution.

import * as Tone from "tone";
import { audioBufferToWav } from "./wav";
import type { PlayedNote } from "./synth-engine";
import {
  dbToGain,
  type EffectSpec,
  type SynthPatch,
} from "./synth-patch";

// Per-oscillator headroom so a full stack at gain 1.0 doesn't clip the
// master before the user even touches a slider.
const OSC_HEADROOM = 0.3;
// Ramp time for live continuous-param changes — short enough to feel
// instant, long enough to avoid zipper noise on a slider drag.
const PARAM_RAMP = 0.03;

type ToneEffect = Tone.Reverb | Tone.FeedbackDelay | Tone.Chorus;

interface EffectHandle {
  node: ToneEffect;
  /** Resolves once the effect is renderable (reverb IR generation). */
  ready: Promise<void>;
}

function createEffect(spec: EffectSpec): EffectHandle {
  switch (spec.type) {
    case "reverb": {
      // Decay scales with mix so a wetter reverb also tails longer.
      const node = new Tone.Reverb({ decay: 1.2 + spec.mix * 3, preDelay: 0.01, wet: spec.mix });
      return { node, ready: node.ready };
    }
    case "delay": {
      const node = new Tone.FeedbackDelay({ delayTime: 0.3, feedback: 0.35, wet: spec.mix });
      return { node, ready: Promise.resolve() };
    }
    case "chorus": {
      const node = new Tone.Chorus({ frequency: 2, delayTime: 3.5, depth: 0.7, wet: spec.mix }).start();
      return { node, ready: Promise.resolve() };
    }
  }
}

interface Chain {
  /** Voices connect here; this node is stable for a chain's lifetime. */
  input: Tone.Gain;
  filters: Map<string, { filter: Tone.Filter; drive: Tone.Gain }>;
  effects: Map<string, ToneEffect>;
  master: Tone.Gain;
  /** All effect-readiness promises (reverb IR generation). */
  ready: Promise<void>;
  dispose(): void;
}

/** Build the post-voice signal path: voiceBus → [drive→filter]* →
 *  [effect]* → master → destination. Enabled stages only. */
function buildChain(patch: SynthPatch, destination: Tone.ToneAudioNode): Chain {
  const input = new Tone.Gain(1);
  let node: Tone.ToneAudioNode = input;

  const filters = new Map<string, { filter: Tone.Filter; drive: Tone.Gain }>();
  for (const f of patch.filters) {
    if (!f.enabled) continue;
    const drive = new Tone.Gain(dbToGain(f.drive));
    const filter = new Tone.Filter({ type: f.type, frequency: f.cutoff, Q: f.resonance });
    node.connect(drive);
    drive.connect(filter);
    node = filter;
    filters.set(f.id, { filter, drive });
  }

  const effects = new Map<string, ToneEffect>();
  const readies: Promise<void>[] = [];
  for (const e of patch.effects) {
    if (!e.enabled) continue;
    const handle = createEffect(e);
    node.connect(handle.node);
    node = handle.node;
    effects.set(e.id, handle.node);
    readies.push(handle.ready);
  }

  const master = new Tone.Gain(patch.master.gain);
  node.connect(master);
  master.connect(destination);

  const dispose = () => {
    master.disconnect();
    master.dispose();
    effects.forEach((fx) => fx.dispose());
    filters.forEach(({ filter, drive }) => {
      filter.dispose();
      drive.dispose();
    });
    input.dispose();
  };

  return { input, filters, effects, master, ready: Promise.all(readies).then(() => undefined), dispose };
}

/** Push current continuous-param values into an existing chain without
 *  rebuilding it (so held notes don't glitch on a slider drag). */
function applyContinuous(chain: Chain, patch: SynthPatch): void {
  for (const f of patch.filters) {
    const ref = chain.filters.get(f.id);
    if (!ref) continue;
    ref.filter.frequency.rampTo(f.cutoff, PARAM_RAMP);
    ref.filter.Q.rampTo(f.resonance, PARAM_RAMP);
    ref.drive.gain.rampTo(dbToGain(f.drive), PARAM_RAMP);
  }
  for (const e of patch.effects) {
    const fx = chain.effects.get(e.id);
    if (fx) fx.wet.rampTo(e.mix, PARAM_RAMP);
  }
  chain.master.gain.rampTo(patch.master.gain, PARAM_RAMP);
}

interface Voice {
  oscs: Tone.Oscillator[];
  env: Tone.AmplitudeEnvelope;
  sum: Tone.Gain;
  dispose(): void;
}

/** Instantiate the full enabled oscillator stack for one note, summed
 *  through the shared ADSR envelope, ready to connect into a chain. */
function buildVoice(patch: SynthPatch, freq: number): Voice {
  const sum = new Tone.Gain(1);
  const env = new Tone.AmplitudeEnvelope({
    attack: patch.adsr.attack,
    decay: patch.adsr.decay,
    sustain: patch.adsr.sustain,
    release: patch.adsr.release,
  });
  sum.connect(env);

  const oscs: Tone.Oscillator[] = [];
  for (const o of patch.oscillators) {
    if (!o.enabled) continue;
    const osc = new Tone.Oscillator({ type: o.waveform, frequency: freq });
    osc.detune.value = o.detuneSemis * 100 + o.detuneCents + patch.master.detuneCents;
    const gain = new Tone.Gain(o.gain * OSC_HEADROOM);
    const panner = new Tone.Panner(o.pan);
    osc.connect(gain);
    gain.connect(panner);
    panner.connect(sum);
    oscs.push(osc);
  }

  const dispose = () => {
    oscs.forEach((o) => {
      try {
        o.dispose();
      } catch {
        /* already disposed */
      }
    });
    env.dispose();
    sum.dispose();
  };

  return { oscs, env, sum, dispose };
}

// Structural key — anything that changes the post-voice node topology
// (count / type / enabled of filters + effects). Continuous params are
// NOT in the key; they ramp in place. A change here triggers a rebuild.
function structureKey(patch: SynthPatch): string {
  const f = patch.filters.map((x) => `${x.id}:${x.type}:${x.enabled ? 1 : 0}`).join(",");
  const e = patch.effects.map((x) => `${x.id}:${x.type}:${x.enabled ? 1 : 0}`).join(",");
  return `F[${f}]E[${e}]`;
}

/**
 * Interactive preview synth bound to the live Tone context. Construct
 * once, drive with noteOn/noteOff from the keyboard, and call setPatch
 * on every patch edit. dispose() on unmount.
 */
export class LiveSynth {
  private patch: SynthPatch;
  private voiceBus: Tone.Gain | null = null;
  private chain: Chain | null = null;
  private chainKey = "";
  private voices = new Map<number, Voice>();
  private started = false;

  constructor(patch: SynthPatch) {
    this.patch = patch;
  }

  /** Resume the audio context (must follow a user gesture) and lazily
   *  build the persistent voice bus + chain. */
  async ensureStarted(): Promise<void> {
    if (!this.started) {
      await Tone.start();
      this.started = true;
    }
    if (!this.voiceBus) {
      this.voiceBus = new Tone.Gain(1);
    }
    this.ensureChain();
  }

  private ensureChain(): void {
    if (!this.voiceBus) return;
    const key = structureKey(this.patch);
    if (this.chain && key === this.chainKey) return;
    const old = this.chain;
    // Detach the bus from the old chain head; held voices feed the bus
    // and keep ringing through the new chain after we reconnect.
    this.voiceBus.disconnect();
    const next = buildChain(this.patch, Tone.getDestination());
    this.voiceBus.connect(next.input);
    this.chain = next;
    this.chainKey = key;
    // Tear the old chain down on the next tick so any in-flight buffer
    // drains rather than clicking off mid-sample.
    if (old) window.setTimeout(() => old.dispose(), 250);
  }

  setPatch(patch: SynthPatch): void {
    this.patch = patch;
    if (!this.chain) return;
    this.ensureChain();
    applyContinuous(this.chain, patch);
  }

  noteOn(freq: number): void {
    if (!this.voiceBus || !this.chain) return;
    if (this.voices.has(freq)) return; // already held
    const voice = buildVoice(this.patch, freq);
    voice.env.connect(this.voiceBus);
    const now = Tone.now();
    voice.oscs.forEach((o) => o.start(now));
    voice.env.triggerAttack(now);
    this.voices.set(freq, voice);
  }

  noteOff(freq: number): void {
    const voice = this.voices.get(freq);
    if (!voice) return;
    this.voices.delete(freq);
    const t = Tone.now();
    voice.env.triggerRelease(t);
    const stopAt = t + this.patch.adsr.release + 0.1;
    voice.oscs.forEach((o) => {
      try {
        o.stop(stopAt);
      } catch {
        /* already scheduled to stop */
      }
    });
    window.setTimeout(() => voice.dispose(), (this.patch.adsr.release + 0.4) * 1000);
  }

  dispose(): void {
    this.voices.forEach((v) => v.dispose());
    this.voices.clear();
    this.chain?.dispose();
    this.chain = null;
    this.voiceBus?.dispose();
    this.voiceBus = null;
  }
}

/**
 * Offline-render recorded notes through the patch to a 16-bit WAV Blob.
 * Uses the SAME buildChain/buildVoice helpers as the live preview, so
 * the bounce matches what the user heard. Returns the Blob ready to
 * hand to `onMusicReady`.
 */
export async function renderPatchToWavBlob(
  patch: SynthPatch,
  notes: PlayedNote[],
  durationSec: number,
  sampleRate = 44100,
): Promise<Blob> {
  const toneBuffer = await Tone.Offline(
    async () => {
      const chain = buildChain(patch, Tone.getDestination());
      // Reverb IRs must be generated before the bounce or the wet path
      // is silent.
      await chain.ready;
      for (const n of notes) {
        if (n.startSec >= durationSec) continue;
        const voice = buildVoice(patch, n.freq);
        voice.env.connect(chain.input);
        voice.oscs.forEach((o) => o.start(n.startSec));
        voice.env.triggerAttackRelease(Math.max(0.02, n.durationSec), n.startSec);
        const stopAt = n.startSec + n.durationSec + patch.adsr.release + 0.1;
        voice.oscs.forEach((o) => o.stop(stopAt));
      }
    },
    durationSec,
    2,
    sampleRate,
  );

  const audioBuffer = toneBuffer.get();
  if (!audioBuffer) throw new Error("Offline synth render produced no buffer");
  const wav = audioBufferToWav(audioBuffer);
  return new Blob([wav], { type: "audio/wav" });
}
