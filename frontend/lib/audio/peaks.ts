/**
 * Audio peaks — single source of truth for waveform-shaped data the
 * editor renders.
 *
 * Per the DRY rule, no consumer rolls its own bucketing — they call
 * `syntheticPeaks` below. A real `audioPeaks(AudioBuffer, …)` lands
 * alongside the chapter editor (#907) once a consumer actually needs
 * to decode buffers; for now the only consumer is the thumbnail
 * fallback (#914) which generates synthetic peaks from the project id.
 */

/**
 * Deterministic pseudo-random peaks from a string seed — used when the
 * thumbnail surface doesn't have a real AudioBuffer (the project's
 * audio isn't decoded yet, or this is a card in a long grid where
 * decoding every project would be wasteful). The seed makes the pattern
 * stable across renders so a given project always renders the same
 * waveform shape.
 *
 * Values are biased toward a speech-y envelope: low average level with
 * occasional spikes, so the result reads as "voice" rather than
 * "white noise".
 */
export function syntheticPeaks(seed: string, bucketCount: number): number[] {
  if (bucketCount <= 0) return [];
  let state = hashSeed(seed);
  const peaks = new Array<number>(bucketCount).fill(0);
  for (let i = 0; i < bucketCount; i++) {
    // Mulberry32-style step — fast, good-enough distribution for visual
    // randomness. No crypto goals here.
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = (((t ^ (t >>> 14)) >>> 0) % 1000) / 1000;
    // Bias: speech-shaped envelope. Base level 0.15-0.4 plus occasional
    // spikes (when r > 0.85) into the 0.7-0.95 range. Makes the
    // waveform read as "voice" not "white noise".
    if (r > 0.85) peaks[i] = 0.7 + (r - 0.85) * 1.6; // 0.7..0.94
    else peaks[i] = 0.15 + r * 0.3;                  // 0.15..0.4
  }
  return peaks;
}

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
