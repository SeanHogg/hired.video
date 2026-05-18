/**
 * Audio ducking — single source of truth for "split this music timeline
 * into gain segments that drop under voiceover."
 *
 * Used by both the preview path (`canvas-state-to-clips.ts` slices the
 * music AudioClip into N AudioClips with different volumes) AND the
 * emit path (`timeline-emit.ts` slices the A1 music Clip into N Clips
 * with different gain). Same algorithm both surfaces — the auto-duck
 * sound a user hears in preview is what the export emits.
 *
 * The algorithm is interval-arithmetic, not DSP: we union every active
 * voiceover window into a coverage mask, then walk `0..totalSec` and
 * emit a segment whenever the coverage flag flips. A segment is either
 * "ducked" (gain × duckAmount) or "open" (gain × 1).
 *
 * `null` config / `false` toggle / zero voiceovers → one segment
 * covering the whole composition at full gain. Callers don't have to
 * branch on "is ducking on?" — they just pass the same input through.
 */
import { DEFAULT_DUCK_AMOUNT } from "./canvas-state";

export interface DuckingInterval {
  startSec: number;
  endSec: number;
}

export interface DuckingSegment {
  startSec: number;
  endSec: number;
  /** Gain multiplier to apply to the underlying lane gain. 1 = open,
   *  `duckAmount` = ducked. */
  gainMultiplier: number;
}

export interface DuckingConfig {
  enabled: boolean;
  /** Fraction of un-ducked gain to play under voiceover (0..1). When
   *  undefined, falls back to `DEFAULT_DUCK_AMOUNT`. */
  duckAmount?: number;
}

/** Merge overlapping / touching intervals into a sorted disjoint list.
 *  Empty or zero-length intervals are dropped so callers can pass raw
 *  voiceover ranges (which may overlap when two clips share an anchor). */
function mergeIntervals(raw: DuckingInterval[]): DuckingInterval[] {
  const filtered = raw
    .filter((iv) => iv.endSec > iv.startSec)
    .sort((a, b) => a.startSec - b.startSec);
  const out: DuckingInterval[] = [];
  for (const iv of filtered) {
    const last = out[out.length - 1];
    if (last && iv.startSec <= last.endSec) {
      last.endSec = Math.max(last.endSec, iv.endSec);
    } else {
      out.push({ startSec: iv.startSec, endSec: iv.endSec });
    }
  }
  return out;
}

/** Compute the gain-segment timeline for a single music lane spanning
 *  `0..totalSec`. Returns at least one segment when `totalSec > 0`.
 *  Each segment is contiguous with the next; adjacent equal-multiplier
 *  segments are collapsed so consumers don't get noise. */
export function computeDuckingSegments(
  totalSec: number,
  voiceoverIntervals: DuckingInterval[],
  config: DuckingConfig,
): DuckingSegment[] {
  if (totalSec <= 0) return [];
  const duckMultiplier =
    config.duckAmount ?? DEFAULT_DUCK_AMOUNT;
  // Disabled / no overlap → one open segment covering the full span.
  if (!config.enabled || voiceoverIntervals.length === 0) {
    return [{ startSec: 0, endSec: totalSec, gainMultiplier: 1 }];
  }
  const merged = mergeIntervals(voiceoverIntervals);
  const segments: DuckingSegment[] = [];
  let cursor = 0;
  for (const iv of merged) {
    const start = Math.max(0, iv.startSec);
    const end = Math.min(totalSec, iv.endSec);
    if (start >= totalSec) break;
    if (start > cursor) {
      segments.push({ startSec: cursor, endSec: start, gainMultiplier: 1 });
    }
    segments.push({
      startSec: Math.max(cursor, start),
      endSec: end,
      gainMultiplier: duckMultiplier,
    });
    cursor = end;
    if (cursor >= totalSec) break;
  }
  if (cursor < totalSec) {
    segments.push({ startSec: cursor, endSec: totalSec, gainMultiplier: 1 });
  }
  // Collapse adjacent segments that ended up with the same multiplier
  // (e.g. zero-length voiceovers at the boundary) so a downstream
  // splitter doesn't emit a clip per millisecond.
  const collapsed: DuckingSegment[] = [];
  for (const seg of segments) {
    if (seg.startSec >= seg.endSec) continue;
    const last = collapsed[collapsed.length - 1];
    if (last && last.gainMultiplier === seg.gainMultiplier && last.endSec === seg.startSec) {
      last.endSec = seg.endSec;
    } else {
      collapsed.push({ ...seg });
    }
  }
  return collapsed;
}
