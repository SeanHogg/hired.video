/**
 * clip-scheduler.ts — schedule a list of music clips onto a Web Audio
 * destination, starting from a given timeline offset.
 *
 * Per the standing DRY rule this is the ONE live music-mixing path — every
 * play surface reaches it through `useMusicScheduler`. The export mixes the
 * same clips offline (`lib/timeline/audio-mixer.ts`); both apply the shared
 * gain envelope (`gain-envelope.ts`) so gain + fades sound the same (#476).
 *
 * Two phases so a seek doesn't re-fetch or re-decode anything (#479):
 *   prepareClipSchedule  fetch + decode every URL clip once (cached per
 *                        AudioContext, so a pause → play reuses buffers)
 *   prepared.start       wire the clips from a timeline offset; the handle's
 *                        `restartFrom` re-anchors them at a new offset.
 *
 * URL clips play through an `AudioBufferSourceNode` (sample-accurate, honours
 * the clip's trim). Preset clips (legacy V1 preset keys) ride on
 * `AmbientPlayer` instances bracketed by `setTimeout` start/stop —
 * millisecond-accurate, which is fine for grid-snapped music starts.
 */
import type { AudioClip } from "@/types/video-script";
import { AmbientPlayer } from "./ambient-player";
import { scheduleGainEnvelope, type GainEnvelope } from "./gain-envelope";
import { isUrlTrack } from "./normalize-clips";

export interface ClipScheduleHandle {
  stop: () => void;
  /** Re-anchor every clip at a new timeline offset — no re-fetch, no
   *  re-decode. Used to resync after a seek discontinuity (#479). */
  restartFrom: (startFromSec: number) => void;
  /** The timeline second the schedule is playing right now (anchor offset +
   *  elapsed context time). Compared against the visual playhead to detect
   *  seeks / drift. */
  position: () => number;
}

export interface PreparedClipSchedule {
  start: (destination: AudioNode, startFromSec: number) => ClipScheduleHandle;
}

// Decoded buffers per context + URL. A context is the shared live one, so
// buffers survive a pause → play and only die with the context itself.
const decodeCache = new WeakMap<BaseAudioContext, Map<string, Promise<AudioBuffer | null>>>();

function loadBuffer(ctx: BaseAudioContext, url: string): Promise<AudioBuffer | null> {
  let perCtx = decodeCache.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    decodeCache.set(ctx, perCtx);
  }
  const cached = perCtx.get(url);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const res = await fetch(url);
      const arr = await res.arrayBuffer();
      return await ctx.decodeAudioData(arr);
    } catch (e) {
      console.warn("[clip-scheduler] failed to load URL clip", url, e);
      // Don't pin the failure — the next prepare retries the URL.
      perCtx?.delete(url);
      return null;
    }
  })();
  perCtx.set(url, pending);
  return pending;
}

function envelopeFor(clip: AudioClip): GainEnvelope {
  return {
    gain: clip.volume ?? 1,
    durationSec: clip.endSec - clip.startSec,
    fadeInSec: clip.fadeInSec,
    fadeOutSec: clip.fadeOutSec,
  };
}

/** Fetch + decode every URL clip, then return a starter. */
export async function prepareClipSchedule(
  clips: AudioClip[],
  ctx: AudioContext,
): Promise<PreparedClipSchedule> {
  const buffers = new Map<string, AudioBuffer | null>();
  const urls = [...new Set(clips.filter((c) => isUrlTrack(c.track)).map((c) => c.track))];
  await Promise.all(
    urls.map(async (url) => {
      buffers.set(url, await loadBuffer(ctx, url));
    }),
  );

  return {
    start(destination, startFromSec) {
      let cleanups: Array<() => void> = [];
      let anchor = { ctxTime: ctx.currentTime, timelineSec: startFromSec };

      const startAt = (fromSec: number) => {
        anchor = { ctxTime: ctx.currentTime, timelineSec: fromSec };
        for (const clip of clips) {
          if (clip.endSec <= fromSec) continue;
          const cleanup = isUrlTrack(clip.track)
            ? startUrlClip(clip, buffers.get(clip.track) ?? null, ctx, destination, fromSec)
            : startPresetClip(clip, ctx, destination, fromSec);
          if (cleanup) cleanups.push(cleanup);
        }
      };
      const stopAll = () => {
        for (const c of cleanups) c();
        cleanups = [];
      };

      startAt(startFromSec);
      return {
        stop: stopAll,
        restartFrom(fromSec) {
          stopAll();
          startAt(fromSec);
        },
        position: () => anchor.timelineSec + (ctx.currentTime - anchor.ctxTime),
      };
    },
  };
}

function startUrlClip(
  clip: AudioClip,
  buf: AudioBuffer | null,
  ctx: AudioContext,
  destination: AudioNode,
  startFromSec: number,
): (() => void) | null {
  if (!buf) return null;
  const offsetIntoClip = Math.max(0, startFromSec - clip.startSec);
  const remainingDur = clip.endSec - clip.startSec - offsetIntoClip;
  if (remainingDur <= 0) return null;
  const sourceOffset = (clip.trimStartSec ?? 0) + offsetIntoClip;
  // Cap the play window to the clip's remaining duration AND the buffer's
  // natural length — start() throws if the offset is past the buffer.
  const dur = Math.min(remainingDur, buf.duration - sourceOffset);
  if (dur <= 0) return null;

  const whenInCtx = ctx.currentTime + Math.max(0, clip.startSec - startFromSec);
  const clipGain = ctx.createGain();
  scheduleGainEnvelope(clipGain.gain, envelopeFor(clip), whenInCtx - offsetIntoClip, offsetIntoClip);
  clipGain.connect(destination);
  const source = ctx.createBufferSource();
  source.buffer = buf;
  source.connect(clipGain);
  source.start(whenInCtx, sourceOffset, dur);
  return () => {
    try { source.stop(); } catch { /* already stopped */ }
    source.disconnect();
    clipGain.disconnect();
  };
}

function startPresetClip(
  clip: AudioClip,
  ctx: AudioContext,
  destination: AudioNode,
  startFromSec: number,
): () => void {
  const offsetIntoClip = Math.max(0, startFromSec - clip.startSec);
  const whenInCtx = ctx.currentTime + Math.max(0, clip.startSec - startFromSec);
  const clipGain = ctx.createGain();
  scheduleGainEnvelope(clipGain.gain, envelopeFor(clip), whenInCtx - offsetIntoClip, offsetIntoClip);
  clipGain.connect(destination);

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
