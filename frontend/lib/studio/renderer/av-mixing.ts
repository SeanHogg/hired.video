/**
 * #292 — A/V mixing helper for the offline mix pass. Extracts the
 * audio stream from every video clip in the timeline and schedules
 * each segment onto the OfflineAudioContext alongside the dedicated
 * audio tracks. Wraps a single AudioBuffer per video so the mixer
 * sees the same shape whether the source was a video or a wav clip.
 *
 * Caller wiring:
 *
 *   const decoded = await decodeVideoAudio(videoBlob, audioCtx);
 *   if (decoded) audioBuffers.push({ buffer: decoded, startSec, endSec });
 *
 * Returns null when the source has no audio track (silent video, or a
 * still-image source); caller falls back to whatever it was doing
 * before (typically: just leave the audio bed alone).
 */

export interface VideoAudioDecodeResult {
  buffer: AudioBuffer;
  /** Source duration; useful to clamp the schedule. */
  durationSec: number;
}

/**
 * Decode the audio stream of a video Blob. Reuses the browser's
 * audio decoder via `AudioContext.decodeAudioData` — works for every
 * codec the page can already play (so anything that played in the
 * editor preview decodes here too).
 */
export async function decodeVideoAudio(
  blob: Blob,
  audioCtx: BaseAudioContext,
): Promise<VideoAudioDecodeResult | null> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    if (buffer.duration === 0) return null;
    return { buffer, durationSec: buffer.duration };
  } catch (err) {
    console.warn("[av-mixing] decode failed, treating clip as silent:", err);
    return null;
  }
}

export interface ScheduledAudioClip {
  buffer: AudioBuffer;
  startSec: number;
  /** Buffer offset to start playing from (skip past trimmed-in head). */
  bufferOffsetSec: number;
  /** Effective clip duration on the timeline. */
  durationSec: number;
  /** Gain (0..1). */
  gain?: number;
}

/**
 * Schedule a list of audio clips against an OfflineAudioContext +
 * connect them through a per-clip GainNode. Returns the master gain
 * node so the caller can route it to the destination.
 */
export function scheduleAudioClips(
  ctx: OfflineAudioContext,
  clips: ScheduledAudioClip[],
  masterGain = 1,
): GainNode {
  const master = ctx.createGain();
  master.gain.value = masterGain;
  for (const clip of clips) {
    const source = ctx.createBufferSource();
    source.buffer = clip.buffer;
    const clipGain = ctx.createGain();
    clipGain.gain.value = Math.max(0, Math.min(1, clip.gain ?? 1));
    source.connect(clipGain).connect(master);
    const offset = Math.max(0, clip.bufferOffsetSec);
    const duration = Math.max(0, clip.durationSec);
    source.start(Math.max(0, clip.startSec), offset, duration);
  }
  master.connect(ctx.destination);
  return master;
}
