/**
 * Music track — the video's ONE music layer as the strip's Music row draws
 * and edits it (Advanced): where the clip sits on the video's clock, how
 * much of it plays, and its fades; and what a drag on one of its handles
 * asks of the plan. The result goes through `mixMusicTiming` (music-mix.ts),
 * which clamps to the schema's bounds.
 *
 *   move     the whole clip later / earlier  → startOffsetSec
 *   start    the left edge (trim the head)   → trimStartSec (+ startOffsetSec,
 *            so the audio under the edge stays put)
 *   end      the right edge (trim the tail)  → trimEndSec
 *   fadeIn   the fade-in handle              → fadeInSec
 *   fadeOut  the fade-out handle             → fadeOutSec
 */
import type { AudioLayer, CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { MUSIC_LAYER_ID, type MusicTimingPatch } from "./music-mix";

export type MusicHandle = "move" | "start" | "end" | "fadeIn" | "fadeOut";

/** The part of the music layer the row draws and edits. */
export type MusicClip = Pick<AudioLayer, "durationSeconds" | "startOffsetSec" | "trimStartSec" | "trimEndSec" | "fadeInSec" | "fadeOutSec">;

/** Seconds of the track that always stay playable, whatever the trims. */
export const MUSIC_MIN_PLAYABLE_SECONDS = 0.5;

/** The derived video's music layer, or null (a silent video). */
export function musicClipOf(canvas: CanvasState | null): MusicClip | null {
  return canvas?.audioLayers.find((l) => l.id === MUSIC_LAYER_ID) ?? null;
}

/** Seconds of the clip that play (the source minus both trims). */
export function playableSeconds(clip: MusicClip): number {
  return Math.max(0, clip.durationSeconds - clip.trimStartSec - clip.trimEndSec);
}

/** `left` / `width` / fade widths as % of the video's length. */
export function musicClipStyle(clip: MusicClip, totalSeconds: number) {
  const total = Math.max(0.1, totalSeconds);
  const pct = (s: number) => Math.max(0, Math.min(100, (s / total) * 100));
  const left = pct(clip.startOffsetSec);
  const width = Math.min(100 - left, pct(playableSeconds(clip)));
  const play = Math.max(0.1, playableSeconds(clip));
  return {
    left: `${left}%`,
    width: `${width}%`,
    /** Fades as % of the clip's own width. */
    fadeIn: `${Math.min(100, (clip.fadeInSec / play) * 100)}%`,
    fadeOut: `${Math.min(100, (clip.fadeOutSec / play) * 100)}%`,
  };
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const ms = (n: number) => Math.round(n * 1000) / 1000;

/** A drag of `deltaSeconds` on one handle of the clip as it was when the
 *  drag began → the timing patch to store. */
export function dragMusicHandle(clip: MusicClip, handle: MusicHandle, deltaSeconds: number): MusicTimingPatch {
  const d = Number.isFinite(deltaSeconds) ? deltaSeconds : 0;
  const room = Math.max(0, clip.durationSeconds - MUSIC_MIN_PLAYABLE_SECONDS);
  const play = playableSeconds(clip);
  switch (handle) {
    case "move":
      return { startOffsetSec: ms(Math.max(0, clip.startOffsetSec + d)) };
    case "start": {
      // Never before the source's own start, nor past the clip's end.
      const trim = clamp(clip.trimStartSec + d, Math.max(0, clip.trimStartSec - clip.startOffsetSec), room - clip.trimEndSec);
      const shift = trim - clip.trimStartSec;
      return { trimStartSec: ms(Math.max(0, trim)), startOffsetSec: ms(Math.max(0, clip.startOffsetSec + shift)) };
    }
    case "end":
      return { trimEndSec: ms(clamp(clip.trimEndSec - d, 0, Math.max(0, room - clip.trimStartSec))) };
    case "fadeIn":
      return { fadeInSec: ms(clamp(clip.fadeInSec + d, 0, Math.max(0, play - clip.fadeOutSec))) };
    case "fadeOut":
      return { fadeOutSec: ms(clamp(clip.fadeOutSec - d, 0, Math.max(0, play - clip.fadeInSec))) };
  }
}
