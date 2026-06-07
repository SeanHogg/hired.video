/**
 * Beat detection for the sizzle-reel magic UI.
 *
 * Takes a decoded `AudioBuffer` (typically the music bed the user
 * selected) and returns an array of onset times in seconds. The sizzle
 * builder then slices/aligns clip cuts to those onsets so the reel
 * "lands" on the beat.
 *
 * Algorithm: spectral-flux onset detection.
 *   1. Slide a Hann-windowed FFT over the signal at 1024-sample hops.
 *   2. Sum the positive-going spectral changes between frames.
 *   3. Normalise by a moving median; pick peaks above a threshold and
 *      separated by a 130 ms minimum (≈460 BPM ceiling, comfortably
 *      faster than any music likely on the platform).
 *
 * Single source of truth for "where are the beats?" — the sizzle
 * builder, the timeline marker importer, and any future audio-reactive
 * effect all call this. No caller re-implements onset detection.
 */

const FFT_SIZE = 1024;
const HOP_SIZE = 512;
const MIN_BEAT_INTERVAL_SEC = 0.13;
// Multiple of the local median below which a flux peak is rejected as
// noise rather than a real onset.
const PEAK_THRESHOLD_RATIO = 1.6;

export function detectBeats(audio: AudioBuffer): number[] {
  if (audio.length === 0) return [];
  const sampleRate = audio.sampleRate;
  // Mix to mono first — beats are global; we don't gain anything by
  // running the analysis on each channel.
  const mono = mixToMono(audio);

  const window = hannWindow(FFT_SIZE);
  const flux: number[] = [];
  let prevMagnitude: Float32Array | null = null;

  for (let i = 0; i + FFT_SIZE <= mono.length; i += HOP_SIZE) {
    const frame = new Float32Array(FFT_SIZE);
    for (let j = 0; j < FFT_SIZE; j++) frame[j] = mono[i + j] * window[j];
    const magnitude = magnitudeSpectrum(frame);
    if (prevMagnitude) {
      let sum = 0;
      for (let k = 0; k < magnitude.length; k++) {
        const diff = magnitude[k] - prevMagnitude[k];
        if (diff > 0) sum += diff;
      }
      flux.push(sum);
    } else {
      flux.push(0);
    }
    prevMagnitude = magnitude;
  }

  // Normalise the flux by a sliding median to make the threshold work
  // across a wide dynamic range (quiet intros + loud drops on the same
  // track).
  const medians = slidingMedian(flux, 11);
  const beats: number[] = [];
  const minHopGap = Math.ceil((MIN_BEAT_INTERVAL_SEC * sampleRate) / HOP_SIZE);
  let lastBeatHop = -Infinity;

  for (let h = 1; h < flux.length - 1; h++) {
    const here = flux[h];
    if (here <= flux[h - 1] || here <= flux[h + 1]) continue; // not a peak
    const med = medians[h] || 1e-6;
    if (here < med * PEAK_THRESHOLD_RATIO) continue;
    if (h - lastBeatHop < minHopGap) continue;
    lastBeatHop = h;
    const seconds = (h * HOP_SIZE) / sampleRate;
    beats.push(seconds);
  }

  return beats;
}

function mixToMono(audio: AudioBuffer): Float32Array {
  const out = new Float32Array(audio.length);
  for (let ch = 0; ch < audio.numberOfChannels; ch++) {
    const data = audio.getChannelData(ch);
    for (let i = 0; i < data.length; i++) out[i] += data[i];
  }
  const denom = Math.max(1, audio.numberOfChannels);
  for (let i = 0; i < out.length; i++) out[i] /= denom;
  return out;
}

function hannWindow(n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return out;
}

/**
 * In-place radix-2 FFT for power-of-two input. Returns the magnitude
 * of the first N/2 bins (the unique half).
 */
function magnitudeSpectrum(time: Float32Array): Float32Array {
  const n = time.length;
  const re = new Float32Array(time);
  const im = new Float32Array(n);
  fft(re, im);
  const half = n / 2;
  const mag = new Float32Array(half);
  for (let k = 0; k < half; k++) mag[k] = Math.hypot(re[k], im[k]);
  return mag;
}

function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // Bit-reverse permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j |= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const angle = (-2 * Math.PI) / size;
    const wR = Math.cos(angle);
    const wI = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let curR = 1;
      let curI = 0;
      for (let k = 0; k < half; k++) {
        const aR = re[start + k];
        const aI = im[start + k];
        const bR = re[start + k + half] * curR - im[start + k + half] * curI;
        const bI = re[start + k + half] * curI + im[start + k + half] * curR;
        re[start + k] = aR + bR;
        im[start + k] = aI + bI;
        re[start + k + half] = aR - bR;
        im[start + k + half] = aI - bI;
        const nextR = curR * wR - curI * wI;
        const nextI = curR * wI + curI * wR;
        curR = nextR;
        curI = nextI;
      }
    }
  }
}

function slidingMedian(values: number[], windowSize: number): number[] {
  const half = Math.floor(windowSize / 2);
  const out: number[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length, i + half + 1);
    const slice = values.slice(lo, hi).sort((a, b) => a - b);
    out[i] = slice[Math.floor(slice.length / 2)];
  }
  return out;
}

/**
 * Decode a Blob/File into an AudioBuffer. Convenience wrapper so callers
 * don't repeat the arrayBuffer + decodeAudioData boilerplate.
 *
 * Uses an `OfflineAudioContext` rather than a live `AudioContext`: decoding
 * needs no audio device, and opening a device-backed context just to decode
 * grabs (and, on some browsers, leaks) an output-device handle that re-emits
 * "The AudioContext encountered an error from the audio device or the WebAudio
 * renderer" — see live-audio-context.ts. `decodeAudioData` resamples to the
 * context's sampleRate, which is harmless here since `detectBeats` derives all
 * onset times in seconds from `audio.sampleRate`. Same decode-only idiom as
 * audio-mixer.ts.
 */
export async function decodeAudioToBuffer(blob: Blob): Promise<AudioBuffer> {
  const Offline =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  // length/sampleRate are placeholders — decodeAudioData ignores the host
  // context's buffer geometry and decodes the full source.
  const ctx = new Offline(1, 1, 44100);
  const arr = await blob.arrayBuffer();
  return await ctx.decodeAudioData(arr.slice(0));
}
