/**
 * clip-scheduler.ts — schedule a list of music clips onto a Web Audio
 * destination, starting from a given timeline offset.
 *
 * Per the standing DRY rule this is the ONE music-mixing path:
 *   - VideoPreview (live playback) calls it with startFromSec = playhead
 *   - video-exporter (render) calls it with startFromSec = 0
 *
 * URL clips decode once via `decodeAudioData` and play through an
 * `AudioBufferSourceNode` (sample-accurate scheduling, supports offset
 * + duration). Preset clips ride on `AmbientPlayer` instances bracketed
 * by `setTimeout` start/stop — millisecond-accurate, which is fine for
 * music starts that are already grid-snapped to clip boundaries.
 */
import type { AudioClip } from "@/types/video-script";
import { AmbientPlayer } from "./ambient-player";
import { isUrlTrack } from "./normalize-clips";

export interface ClipScheduleHandle {
  stop: () => void;
}

export async function scheduleClipsToDestination(
  clips: AudioClip[],
  ctx: AudioContext,
  destination: AudioNode,
  startFromSec: number,
): Promise<ClipScheduleHandle> {
  const cleanups: Array<() => void> = [];

  for (const clip of clips) {
    if (clip.endSec <= startFromSec) continue;
    const offsetIntoClip = Math.max(0, startFromSec - clip.startSec);
    const remainingDur = clip.endSec - clip.startSec - offsetIntoClip;
    if (remainingDur <= 0) continue;

    const clipGain = ctx.createGain();
    clipGain.gain.value = clip.volume ?? 1;
    clipGain.connect(destination);

    if (isUrlTrack(clip.track)) {
      cleanups.push(await scheduleUrlClip(clip, ctx, clipGain, startFromSec, offsetIntoClip, remainingDur));
    } else {
      cleanups.push(schedulePresetClip(clip, ctx, clipGain, startFromSec));
    }
  }

  return {
    stop: () => {
      for (const c of cleanups) c();
    },
  };
}

async function scheduleUrlClip(
  clip: AudioClip,
  ctx: AudioContext,
  clipGain: GainNode,
  startFromSec: number,
  offsetIntoClip: number,
  remainingDur: number,
): Promise<() => void> {
  const whenInCtx = ctx.currentTime + Math.max(0, clip.startSec - startFromSec);
  try {
    const res = await fetch(clip.track);
    const arr = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr);
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(clipGain);
    // Cap the play window to the clip's actual remaining duration AND
    // the buffer's natural length — start() throws if duration > buffer.
    const dur = Math.min(remainingDur, Math.max(0, buf.duration - offsetIntoClip));
    source.start(whenInCtx, offsetIntoClip, dur);
    return () => {
      try { source.stop(); } catch { /* already stopped */ }
      clipGain.disconnect();
    };
  } catch (e) {
    console.warn("[clip-scheduler] failed to load URL clip", clip.track, e);
    clipGain.disconnect();
    return () => { /* nothing to clean — load failed */ };
  }
}

function schedulePresetClip(
  clip: AudioClip,
  ctx: AudioContext,
  clipGain: GainNode,
  startFromSec: number,
): () => void {
  const player = new AmbientPlayer();
  const startDelayMs = Math.max(0, (clip.startSec - startFromSec) * 1000);
  const stopDelayMs = Math.max(0, (clip.endSec - startFromSec) * 1000);

  const startTimer = setTimeout(() => {
    player.playToDestination(clip.track, 1, ctx, clipGain);
  }, startDelayMs);
  const stopTimer = setTimeout(() => {
    player.stop();
  }, stopDelayMs);

  return () => {
    clearTimeout(startTimer);
    clearTimeout(stopTimer);
    player.stop();
    clipGain.disconnect();
  };
}
