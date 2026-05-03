/**
 * Sizzle reel builder — assembles a `Timeline` from raw source clips +
 * a music bed + detected beats + highlight windows.
 *
 * Per `project_nle_decision.md`, the magic UI emits the SAME Timeline
 * spec the NLE editor consumes. There is no "sizzle render path"
 * separate from the NLE render path — only `Timeline → output`.
 *
 * Algorithm (deterministic — same inputs → same Timeline):
 *   1. Bin highlight windows by source, sort by score descending.
 *   2. Walk the beat list pairwise to produce slot durations
 *      (slot N = beats[N+1] - beats[N], capped at 4s for pacing).
 *   3. Fill slots with the next-best highlight from the round-robin
 *      across sources, slicing each source at the highlight start.
 *   4. The music bed lays end-to-end on the audio track.
 *
 * Beats outside the music bed's first `targetDurationSec` are
 * discarded so the reel ends on a slot edge that aligns to the music.
 */

import {
  defaultTrack,
  emptyTimeline,
  secondsToFrames,
  type MediaSource,
  type Timeline,
  type Clip,
} from "@shared/timeline";
import type { HighlightWindow } from "./highlight-scoring";

export interface SizzleSourceInput {
  source: MediaSource;
  highlights: HighlightWindow[];
}

export interface SizzleBuildOptions {
  sources: SizzleSourceInput[];
  /** The music-bed source (kind === "audio"). Optional — without it
   *  the reel still builds, just slot-paced uniformly. */
  audioBed?: MediaSource | null;
  /** Beat times in seconds, relative to the music bed. */
  beats: number[];
  /** Output video dimensions. Defaults to 1080p landscape. */
  width?: number;
  height?: number;
  /** Output frame rate. Default 30. */
  fps?: number;
  /** Reel target duration in seconds. Default 30. */
  targetDurationSec?: number;
  /** Soft cap on per-slot duration in seconds — prevents long beats
   *  from making the reel feel slow. Default 4. */
  maxSlotSec?: number;
}

export function buildSizzleTimeline(opts: SizzleBuildOptions): Timeline {
  const fps = opts.fps ?? 30;
  const width = opts.width ?? 1920;
  const height = opts.height ?? 1080;
  const targetDurationSec = opts.targetDurationSec ?? 30;
  const maxSlotSec = opts.maxSlotSec ?? 4;

  const slots = computeSlots(opts.beats, targetDurationSec, maxSlotSec);
  const queues = opts.sources.map((s) => ({
    source: s.source,
    highlights: [...s.highlights].sort((a, b) => b.score - a.score),
    cursor: 0,
  }));

  const timeline = emptyTimeline({ fps, width, height, seedTracks: false });
  // V1 = picture-in-picture-friendly base. Audio = music bed. We seed
  // empty so the slot loop owns track creation.
  const videoTrack = defaultTrack({ id: "v1", kind: "video", label: "V1" });
  const audioTrack = defaultTrack({ id: "a1", kind: "audio", label: "A1" });

  let timelineFrame = 0;
  let queueIdx = 0;
  for (const slot of slots) {
    if (queues.length === 0) break;
    const q = queues[queueIdx % queues.length];
    queueIdx++;
    const highlight = q.highlights[q.cursor];
    q.cursor = (q.cursor + 1) % Math.max(1, q.highlights.length);
    const clip = makeClipForSlot(q.source, highlight, slot, timelineFrame, fps);
    if (clip) videoTrack.clips.push(clip);
    timelineFrame += secondsToFrames(slot, fps);
  }

  if (opts.audioBed) {
    audioTrack.clips.push({
      id: cryptoUuid(),
      sourceId: opts.audioBed.id,
      startFrame: 0,
      durationFrames: secondsToFrames(targetDurationSec, fps),
      sourceInFrame: 0,
      gain: 0.9,
    });
  }

  return {
    ...timeline,
    tracks: [videoTrack, audioTrack],
  };
}

function computeSlots(beats: number[], targetDurationSec: number, maxSlotSec: number): number[] {
  if (beats.length < 2) {
    // Fallback: uniform 1.5-second slots when the beat detector found
    // nothing musical. Ensures the magic UI still produces a watchable
    // reel from non-musical audio (or no audio at all).
    const count = Math.max(1, Math.floor(targetDurationSec / 1.5));
    return new Array(count).fill(targetDurationSec / count);
  }
  const slots: number[] = [];
  let consumed = 0;
  for (let i = 0; i + 1 < beats.length; i++) {
    const dur = Math.min(maxSlotSec, beats[i + 1] - beats[i]);
    if (dur <= 0.05) continue;
    if (consumed + dur > targetDurationSec) {
      slots.push(targetDurationSec - consumed);
      return slots;
    }
    slots.push(dur);
    consumed += dur;
  }
  if (consumed < targetDurationSec) {
    slots.push(targetDurationSec - consumed);
  }
  return slots;
}

function makeClipForSlot(
  source: MediaSource,
  highlight: HighlightWindow | undefined,
  slotSec: number,
  timelineStartFrame: number,
  fps: number,
): Clip | null {
  const sourceInSec = highlight?.startSec ?? 0;
  const sourceInFrame = secondsToFrames(sourceInSec, source.fps);
  const durationFrames = secondsToFrames(slotSec, fps);
  const sourceDurationFrames = secondsToFrames(
    Math.max(0, source.durationFrames / source.fps - sourceInSec),
    fps,
  );
  if (sourceDurationFrames <= 0) return null;
  return {
    id: cryptoUuid(),
    sourceId: source.id,
    startFrame: timelineStartFrame,
    durationFrames: Math.min(durationFrames, sourceDurationFrames),
    sourceInFrame,
  };
}

function cryptoUuid(): string {
  return (crypto as Crypto).randomUUID();
}
