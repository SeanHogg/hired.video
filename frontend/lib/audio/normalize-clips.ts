/**
 * normalize-clips.ts — single source of truth for "what music clips
 * does this project have?".
 *
 * Per the standing DRY rule, every consumer that needs to enumerate
 * the music timeline (NLETimeline lane segments, VideoPreview live
 * playback, video-exporter render mixer) goes through
 * `normalizeAudioClips` rather than reading the legacy `audio.track`
 * field directly. That keeps:
 *   1. Back-compat with saved projects that pre-date the multi-clip
 *      model — the legacy single-track shape hoists into one
 *      full-duration clip, transparent to callers.
 *   2. Branch logic ("is this a URL or a preset?") in one place
 *      (`isUrlTrack`) so playback / export can't drift.
 */
import type { AudioClip, VideoAudio } from "@/types/video-script";

export function normalizeAudioClips(
  audio: VideoAudio | undefined | null,
  totalDuration: number,
): AudioClip[] {
  if (!audio) return [];
  if (audio.clips && audio.clips.length > 0) return audio.clips;
  if (audio.track && audio.track !== "none") {
    return [
      {
        id: "legacy-music",
        track: audio.track,
        label: audio.label || audio.track,
        startSec: 0,
        endSec: totalDuration,
        volume: audio.volume,
      },
    ];
  }
  return [];
}

/** A clip's `track` is a hosted/blob/data URL (vs a preset key). */
export function isUrlTrack(track: string): boolean {
  return /^(https?:|blob:|data:)/i.test(track);
}

/** Stable id helper for new clips. */
export function newClipId(): string {
  return `clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
