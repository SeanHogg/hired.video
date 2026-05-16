/**
 * CTA hot-zone extraction — turn the saved Timeline JSON into a list of
 * `{ time-range, fractional bbox, destination URL }` rectangles that
 * the public player overlays as clickable anchors on top of the baked
 * MP4. Single source of truth so the API DTO and any client-side
 * interactive previews compute identical zones from the same input.
 *
 * The Timeline can hold many widget kinds — only `canvas-v2:cta`
 * effects with a non-empty `ctaUrl` produce hot-zones. Everything else
 * is silently ignored.
 */

import type { Timeline } from "./timeline.js";

export interface CtaHotzone {
  /** First second (inclusive) the hot-zone is visible / clickable. */
  startSec: number;
  /** Last second (exclusive) the hot-zone is visible / clickable. */
  endSec: number;
  /** Fractional left edge (0..1 of the player's rendered width). */
  x: number;
  /** Fractional top edge (0..1 of the player's rendered height). */
  y: number;
  /** Fractional width (0..1 of the player's rendered width). */
  w: number;
  /** Fractional height (0..1 of the player's rendered height). */
  h: number;
  /** Destination URL. The renderer opens this in a new tab. */
  url: string;
}

/** Pull every CTA hot-zone out of a Timeline. Returns an empty array
 *  when the timeline is missing / malformed / has no CTA widgets,
 *  so callers can spread the result into props unconditionally. */
export function extractCtaHotzones(
  timeline: Timeline | null | undefined,
): CtaHotzone[] {
  if (!timeline || !Array.isArray(timeline.tracks)) return [];
  const fps = typeof timeline.fps === "number" && timeline.fps > 0 ? timeline.fps : 30;
  const out: CtaHotzone[] = [];
  for (const track of timeline.tracks) {
    if (track.kind !== "video") continue;
    for (const clip of track.clips ?? []) {
      const startFrame = Number(clip.startFrame) || 0;
      const durFrames = Number(clip.durationFrames) || 0;
      if (durFrames <= 0) continue;
      for (const effect of clip.effects ?? []) {
        if (effect.kind !== "canvas-v2:cta") continue;
        const params = (effect.params ?? {}) as Record<string, unknown>;
        const url = typeof params.ctaUrl === "string" ? params.ctaUrl.trim() : "";
        if (!url) continue;
        out.push({
          startSec: startFrame / fps,
          endSec: (startFrame + durFrames) / fps,
          x: numberOr(params.x, 0),
          y: numberOr(params.y, 0),
          w: numberOr(params.width, 1),
          h: numberOr(params.height, 0.2),
          url,
        });
      }
    }
  }
  return out;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
