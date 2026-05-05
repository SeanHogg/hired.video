/**
 * Audio FX pack — closes #353. Adds parametric EQ, dynamics
 * compressor, brick-wall limiter, and noise gate. All four register
 * into the shared audio-effect registry.
 *
 * EQ / compressor / limiter ride the Web Audio graph as native nodes
 * (BiquadFilterNode and DynamicsCompressorNode); the gate runs as a
 * buffer-stage pre-processor with attack/release envelope smoothing.
 *
 * Maps to the M2 baseline audio-FX row in `project_nle_decision.md`.
 * Advanced multi-band / de-esser / multi-tap variants stay in M5.
 */

import { registerAudioEffect } from "./audio-registry";

// ── Parametric EQ ─────────────────────────────────────────────────────
//
// Three-band: low shelf, mid peaking, high shelf. Editor exposes
// frequency / gain (dB) per band — Q is fixed for the shelves and
// adjustable for the peaking band. Three bands cover the common
// voice-cleanup / music-tilt asks without bloating the param panel.

const EQ_BAND_DEFAULTS = {
  lowFreq: 120,
  lowGainDb: 0,
  midFreq: 1000,
  midGainDb: 0,
  midQ: 1,
  highFreq: 8000,
  highGainDb: 0,
};

registerAudioEffect({
  kind: "audio-eq",
  label: "Parametric EQ",
  category: "audio",
  proOnly: true,
  defaults: EQ_BAND_DEFAULTS,
  paramHints: {
    lowFreq: { type: "number", min: 20, max: 500, step: 1 },
    lowGainDb: { type: "number", min: -24, max: 24, step: 0.5 },
    midFreq: { type: "number", min: 200, max: 8000, step: 10 },
    midGainDb: { type: "number", min: -24, max: 24, step: 0.5 },
    midQ: { type: "number", min: 0.1, max: 8, step: 0.1 },
    highFreq: { type: "number", min: 1000, max: 20000, step: 50 },
    highGainDb: { type: "number", min: -24, max: 24, step: 0.5 },
  },
  connect(effect, input, { ctx }) {
    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = numberOr(effect.params.lowFreq, 120);
    low.gain.value = numberOr(effect.params.lowGainDb, 0);

    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = numberOr(effect.params.midFreq, 1000);
    mid.Q.value = numberOr(effect.params.midQ, 1);
    mid.gain.value = numberOr(effect.params.midGainDb, 0);

    const high = ctx.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = numberOr(effect.params.highFreq, 8000);
    high.gain.value = numberOr(effect.params.highGainDb, 0);

    input.connect(low);
    low.connect(mid);
    mid.connect(high);
    return high;
  },
});

// ── Compressor ────────────────────────────────────────────────────────
//
// Direct mapping onto DynamicsCompressorNode — the browser's built-in
// is a feed-forward compressor with all the standard params.

registerAudioEffect({
  kind: "audio-compressor",
  label: "Compressor",
  category: "audio",
  proOnly: true,
  defaults: {
    thresholdDb: -24,
    kneeDb: 30,
    ratio: 4,
    attackMs: 3,
    releaseMs: 250,
    makeupDb: 0,
  },
  paramHints: {
    thresholdDb: { type: "number", min: -60, max: 0, step: 0.5 },
    kneeDb: { type: "number", min: 0, max: 40, step: 0.5 },
    ratio: { type: "number", min: 1, max: 20, step: 0.1 },
    attackMs: { type: "number", min: 0, max: 500, step: 1 },
    releaseMs: { type: "number", min: 10, max: 2000, step: 10 },
    makeupDb: { type: "number", min: -12, max: 24, step: 0.5 },
  },
  connect(effect, input, { ctx }) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = numberOr(effect.params.thresholdDb, -24);
    comp.knee.value = numberOr(effect.params.kneeDb, 30);
    comp.ratio.value = numberOr(effect.params.ratio, 4);
    comp.attack.value = numberOr(effect.params.attackMs, 3) / 1000;
    comp.release.value = numberOr(effect.params.releaseMs, 250) / 1000;
    input.connect(comp);
    const makeupDb = numberOr(effect.params.makeupDb, 0);
    if (makeupDb === 0) return comp;
    const makeup = ctx.createGain();
    makeup.gain.value = dbToLinear(makeupDb);
    comp.connect(makeup);
    return makeup;
  },
});

// ── Brick-wall limiter ────────────────────────────────────────────────
//
// Reuses DynamicsCompressorNode with limiter-preset constants the user
// can't loosen. Surface params: ceiling (threshold) + release. Ratio
// is fixed at 20:1 (effectively a wall), attack at 1 ms.

registerAudioEffect({
  kind: "audio-limiter",
  label: "Limiter",
  category: "audio",
  proOnly: true,
  defaults: { ceilingDb: -1, releaseMs: 50 },
  paramHints: {
    ceilingDb: { type: "number", min: -12, max: 0, step: 0.1 },
    releaseMs: { type: "number", min: 1, max: 500, step: 1 },
  },
  connect(effect, input, { ctx }) {
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = numberOr(effect.params.ceilingDb, -1);
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.001;
    lim.release.value = numberOr(effect.params.releaseMs, 50) / 1000;
    input.connect(lim);
    return lim;
  },
});

// ── Noise gate ────────────────────────────────────────────────────────
//
// Implemented as a buffer-stage pre-processor. We run an envelope
// follower over each channel, then multiply the sample by a smoothed
// gate gain that opens above threshold and closes below. Buffer-stage
// because Web Audio doesn't ship a built-in gate; rolling a graph-stage
// version requires an AudioWorklet (separate JS asset).

registerAudioEffect({
  kind: "audio-gate",
  label: "Noise gate",
  category: "audio",
  proOnly: true,
  defaults: {
    thresholdDb: -50,
    attackMs: 5,
    releaseMs: 100,
    holdMs: 30,
  },
  paramHints: {
    thresholdDb: { type: "number", min: -90, max: 0, step: 0.5 },
    attackMs: { type: "number", min: 0.1, max: 100, step: 0.1 },
    releaseMs: { type: "number", min: 1, max: 1000, step: 1 },
    holdMs: { type: "number", min: 0, max: 500, step: 1 },
  },
  processBuffer(effect, buffer, audioCtx) {
    const thresholdDb = numberOr(effect.params.thresholdDb, -50);
    const attackMs = numberOr(effect.params.attackMs, 5);
    const releaseMs = numberOr(effect.params.releaseMs, 100);
    const holdMs = numberOr(effect.params.holdMs, 30);

    const sr = buffer.sampleRate;
    const threshold = dbToLinear(thresholdDb);
    // Time-constant smoothing: alpha = exp(-1 / (timeMs * sr / 1000)).
    const attackA = timeConstantAlpha(attackMs, sr);
    const releaseA = timeConstantAlpha(releaseMs, sr);
    const holdSamples = Math.max(0, Math.round((holdMs / 1000) * sr));

    const out = audioCtx.createBuffer(buffer.numberOfChannels, buffer.length, sr);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = out.getChannelData(ch);
      let env = 0; // envelope follower (rectified, smoothed)
      let gain = 0; // current gate gain (0 closed, 1 open)
      let holdLeft = 0;
      for (let i = 0; i < src.length; i++) {
        const x = src[i];
        const rect = x < 0 ? -x : x;
        // Envelope: fast attack, slow release on the rectified signal.
        const a = rect > env ? attackA : releaseA;
        env = a * env + (1 - a) * rect;

        const wantOpen = env >= threshold;
        if (wantOpen) {
          holdLeft = holdSamples;
          gain = attackA * gain + (1 - attackA) * 1;
        } else if (holdLeft > 0) {
          holdLeft--;
          gain = attackA * gain + (1 - attackA) * 1;
        } else {
          gain = releaseA * gain + (1 - releaseA) * 0;
        }
        dst[i] = x * gain;
      }
    }
    return out;
  },
});

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

function timeConstantAlpha(timeMs: number, sampleRate: number): number {
  if (timeMs <= 0) return 0;
  const samples = (timeMs / 1000) * sampleRate;
  return Math.exp(-1 / samples);
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
