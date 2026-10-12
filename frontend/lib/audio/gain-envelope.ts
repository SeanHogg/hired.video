/**
 * gain-envelope.ts — the ONE clip gain envelope (gain + fade-in + fade-out)
 * every audio surface schedules (#476).
 *
 *   - Live preview: `clip-scheduler.ts` (via `useMusicScheduler`), starting
 *     mid-clip after a play-from-playhead or a seek.
 *   - Export: the Timeline audio mixer (`lib/timeline/audio-mixer.ts`)
 *     rendering the mix in an OfflineAudioContext.
 *
 * The envelope is piecewise linear — 0 → gain over `fadeInSec` from the clip
 * start, gain → 0 over the last `fadeOutSec` before the clip end. When the
 * two fades overlap (short clip, long fades) the gain is the lower of the two
 * ramps, so the curve peaks where they cross. Both surfaces schedule the same
 * breakpoints, so a mixer tweak sounds identical in preview and in the MP4.
 */

export interface GainEnvelope {
  /** Steady-state gain (0..n) between the fades. */
  gain: number;
  /** Clip length in seconds — the fade-out ends here. */
  durationSec: number;
  fadeInSec?: number;
  fadeOutSec?: number;
}

function clampFade(fadeSec: number | undefined, durationSec: number): number {
  if (!fadeSec || !Number.isFinite(fadeSec) || fadeSec <= 0) return 0;
  return Math.min(fadeSec, durationSec);
}

/** Gain at clip-local time `t` (0 = clip start). */
export function envelopeGainAt(env: GainEnvelope, t: number): number {
  const duration = Math.max(0, env.durationSec);
  const fadeIn = clampFade(env.fadeInSec, duration);
  const fadeOut = clampFade(env.fadeOutSec, duration);
  const local = Math.max(0, Math.min(duration, t));
  let multiplier = 1;
  if (fadeIn > 0) multiplier = Math.min(multiplier, local / fadeIn);
  if (fadeOut > 0) multiplier = Math.min(multiplier, (duration - local) / fadeOut);
  return Math.max(0, env.gain) * Math.max(0, Math.min(1, multiplier));
}

/**
 * Schedule the envelope onto `param` (a GainNode's `gain`).
 *
 * @param clipStartAt context time that corresponds to clip-local 0 (may be in
 *   the past when playback starts mid-clip).
 * @param fromSec clip-local second playback starts at (0 for a full play).
 */
export function scheduleGainEnvelope(
  param: AudioParam,
  env: GainEnvelope,
  clipStartAt: number,
  fromSec = 0,
): void {
  const duration = Math.max(0, env.durationSec);
  const fadeIn = clampFade(env.fadeInSec, duration);
  const fadeOut = clampFade(env.fadeOutSec, duration);
  const from = Math.max(0, Math.min(duration, fromSec));
  const startValue = envelopeGainAt(env, from);
  param.value = startValue;
  param.setValueAtTime(startValue, Math.max(0, clipStartAt + from));
  if (fadeIn === 0 && fadeOut === 0) return;

  const breakpoints = new Set<number>([fadeIn, duration - fadeOut, duration]);
  if (fadeIn > 0 && fadeOut > 0 && fadeIn + fadeOut > duration) {
    // Overlapping fades — the curve peaks where the two ramps cross.
    breakpoints.add((fadeIn * duration) / (fadeIn + fadeOut));
  }
  const ordered = [...breakpoints].filter((t) => t > from && t <= duration).sort((a, b) => a - b);
  for (const t of ordered) {
    param.linearRampToValueAtTime(envelopeGainAt(env, t), Math.max(0, clipStartAt + t));
  }
}
