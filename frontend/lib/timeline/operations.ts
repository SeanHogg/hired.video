/**
 * Pure Timeline mutation helpers.
 *
 * Every editor surface that needs to add/trim/split/move a clip MUST go
 * through these functions. The TimelineCanvas, SourcePanel drop
 * handler, trim handles, split shortcut, and any future macro tool all
 * call into the same primitives. Per the standing DRY rule, no caller
 * builds a clip insert/trim inline.
 *
 * All functions are pure: they take a Timeline + arguments and return
 * a new Timeline. Callers wrap the result with onTimelineChange().
 */

import {
  clipsOverlap,
  type Clip,
  type Timeline,
  type Track,
} from "@shared/timeline";

/** Generate a fresh clip id. Wraps crypto.randomUUID so test code can stub. */
function newClipId(): string {
  return (crypto as Crypto).randomUUID();
}

/** Find a track by id; throws when absent so callers don't silently no-op. */
function trackById(timeline: Timeline, trackId: string): Track {
  const t = timeline.tracks.find((x) => x.id === trackId);
  if (!t) throw new Error(`Track ${trackId} not found`);
  return t;
}

/**
 * Find the (trackId, clip) pair for a clip id. Returns null when the
 * clip isn't on any track — callers treat null as a no-op.
 */
export function findClip(
  timeline: Timeline,
  clipId: string,
): { trackId: string; clip: Clip } | null {
  for (const t of timeline.tracks) {
    const c = t.clips.find((x) => x.id === clipId);
    if (c) return { trackId: t.id, clip: c };
  }
  return null;
}

/**
 * Insert a clip on the given track at the requested startFrame.
 * Refuses to insert if the new clip would overlap an existing clip on
 * that track. Returns the new Timeline AND the newly-created clip id
 * (callers may want to select it).
 */
export function insertClip(
  timeline: Timeline,
  trackId: string,
  insertion: {
    sourceId: string;
    startFrame: number;
    durationFrames: number;
    sourceInFrame?: number;
    gain?: number;
  },
): { timeline: Timeline; clipId: string } {
  const track = trackById(timeline, trackId);
  const newClip: Clip = {
    id: newClipId(),
    sourceId: insertion.sourceId,
    startFrame: Math.max(0, Math.round(insertion.startFrame)),
    durationFrames: Math.max(1, Math.round(insertion.durationFrames)),
    sourceInFrame: insertion.sourceInFrame ?? 0,
    ...(insertion.gain !== undefined ? { gain: insertion.gain } : {}),
  };
  for (const existing of track.clips) {
    if (clipsOverlap(newClip, existing)) {
      throw new Error("Clip would overlap an existing clip on this track");
    }
  }
  return {
    timeline: replaceTrack(timeline, trackId, {
      ...track,
      clips: [...track.clips, newClip].sort((a, b) => a.startFrame - b.startFrame),
    }),
    clipId: newClip.id,
  };
}

/**
 * Remove a clip by id. No-op when the id isn't present anywhere.
 */
export function deleteClip(timeline: Timeline, clipId: string): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((t) => ({
      ...t,
      clips: t.clips.filter((c) => c.id !== clipId),
    })),
  };
}

/**
 * Trim a clip's left edge — moves the in-point on the source AND the
 * timeline start by the same delta so the right edge stays put. Clamps
 * to source bounds and to the previous clip's right edge on the same
 * track (no overlaps).
 */
export function trimLeftEdge(
  timeline: Timeline,
  clipId: string,
  newStartFrame: number,
): Timeline {
  const found = findClip(timeline, clipId);
  if (!found) return timeline;
  const track = trackById(timeline, found.trackId);
  const clip = found.clip;
  const rightEdge = clip.startFrame + clip.durationFrames;
  const prev = track.clips
    .filter((c) => c.id !== clipId && c.startFrame + c.durationFrames <= clip.startFrame)
    .sort((a, b) => b.startFrame - a.startFrame)[0];
  const minStart = prev ? prev.startFrame + prev.durationFrames : 0;
  const minSourceIn = 0;
  const delta = Math.max(minStart - clip.startFrame, minSourceIn - clip.sourceInFrame, newStartFrame - clip.startFrame);
  const clampedStart = clip.startFrame + delta;
  if (clampedStart >= rightEdge) return timeline; // refuses zero-width clip
  return updateClip(timeline, clipId, {
    startFrame: clampedStart,
    durationFrames: rightEdge - clampedStart,
    sourceInFrame: clip.sourceInFrame + delta,
  });
}

/**
 * Trim a clip's right edge — extends/shrinks `durationFrames`. Clamps
 * to the next clip's left edge on the same track and refuses zero
 * width.
 */
export function trimRightEdge(
  timeline: Timeline,
  clipId: string,
  newEndFrame: number,
): Timeline {
  const found = findClip(timeline, clipId);
  if (!found) return timeline;
  const track = trackById(timeline, found.trackId);
  const clip = found.clip;
  const next = track.clips
    .filter((c) => c.id !== clipId && c.startFrame >= clip.startFrame + clip.durationFrames)
    .sort((a, b) => a.startFrame - b.startFrame)[0];
  const maxEnd = next ? next.startFrame : Number.POSITIVE_INFINITY;
  const clamped = Math.min(maxEnd, Math.max(clip.startFrame + 1, newEndFrame));
  return updateClip(timeline, clipId, {
    durationFrames: clamped - clip.startFrame,
  });
}

/**
 * Split a clip into two at the given timeline frame. The frame must
 * lie strictly inside the clip's range; otherwise no-op. Returns the
 * two halves' ids so the caller can update selection.
 */
export function splitClipAt(
  timeline: Timeline,
  clipId: string,
  frame: number,
): { timeline: Timeline; leftId: string; rightId: string } | null {
  const found = findClip(timeline, clipId);
  if (!found) return null;
  const clip = found.clip;
  if (frame <= clip.startFrame || frame >= clip.startFrame + clip.durationFrames) {
    return null;
  }
  const offset = frame - clip.startFrame;
  const left: Clip = { ...clip, durationFrames: offset };
  const right: Clip = {
    ...clip,
    id: newClipId(),
    startFrame: frame,
    durationFrames: clip.durationFrames - offset,
    sourceInFrame: clip.sourceInFrame + offset,
  };
  const track = trackById(timeline, found.trackId);
  return {
    timeline: replaceTrack(timeline, found.trackId, {
      ...track,
      clips: track.clips
        .flatMap((c) => (c.id === clipId ? [left, right] : [c]))
        .sort((a, b) => a.startFrame - b.startFrame),
    }),
    leftId: left.id,
    rightId: right.id,
  };
}

/**
 * Set or clear the out-edge transition on a clip. Single helper so the
 * timeline canvas's transition picker AND any future "apply to all
 * clips" macro both go through the same code path.
 */
export function setOutTransition(
  timeline: Timeline,
  clipId: string,
  transition: Clip["outTransition"] | null,
): Timeline {
  return updateClip(timeline, clipId, {
    outTransition: transition ?? undefined,
  } as Partial<Clip>);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function replaceTrack(timeline: Timeline, trackId: string, next: Track): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((t) => (t.id === trackId ? next : t)),
  };
}

function updateClip(
  timeline: Timeline,
  clipId: string,
  patch: Partial<Clip>,
): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
    })),
  };
}
