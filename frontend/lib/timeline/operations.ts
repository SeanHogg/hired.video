/**
 * Pure Timeline mutation helpers.
 *
 * Every editor surface that needs to add/trim/split/move a clip MUST go
 * through these functions. TimelineCanvas, sidebar media drops, trim
 * handles, split shortcuts, and any future macro tool all call into
 * the same primitives. Per the standing DRY rule, no caller builds a
 * clip insert/trim inline.
 *
 * All functions are pure: they take a Timeline + arguments and return
 * a new Timeline. Callers wrap the result with onTimelineChange().
 */

import {
  clipsOverlap,
  type Clip,
  type MulticamAngle,
  type MulticamGroup,
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
 *
 * Nested-timeline clips: pass `nestedTimelineId` to reference another
 * studio_projects row as a compound clip. `sourceId` is left empty in
 * that case — the renderer reads `nestedTimelineId` first and skips
 * the source lookup.
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
    nestedTimelineId?: string;
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
    ...(insertion.nestedTimelineId ? { nestedTimelineId: insertion.nestedTimelineId } : {}),
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
 * Create a multicam group from N synced sources. Returns the new
 * Timeline AND the group id so callers can immediately bind a clip to
 * it. Sync offsets default to 0; callers refine via auto-sync (audio
 * waveform / timecode) in a follow-up.
 */
export function createMulticamGroup(
  timeline: Timeline,
  spec: { label: string; angles: Array<Omit<MulticamAngle, "syncOffsetFrames"> & { syncOffsetFrames?: number }> },
): { timeline: Timeline; groupId: string } {
  const id = newClipId();
  const group: MulticamGroup = {
    id,
    label: spec.label,
    angles: spec.angles.map((a) => ({
      sourceId: a.sourceId,
      label: a.label,
      syncOffsetFrames: a.syncOffsetFrames ?? 0,
    })),
  };
  return {
    timeline: {
      ...timeline,
      multicamGroups: [...(timeline.multicamGroups ?? []), group],
    },
    groupId: id,
  };
}

/**
 * Switch the active multicam angle of a clip at the playhead. Splits
 * the clip at `frame` if the playhead is mid-clip, then assigns
 * `angleIndex` to the right-hand side. When the playhead is at the
 * clip's start, no split happens — the assignment lands on the whole
 * clip. The standard angle-switch workflow in pro NLEs.
 *
 * Single source of truth: every UI surface that switches angles (the
 * future angle-switcher overlay, keyboard shortcuts 1..9, batch
 * macros) flows through this one function.
 */
export function switchMulticamAngle(
  timeline: Timeline,
  clipId: string,
  frame: number,
  angleIndex: number,
): Timeline {
  const found = findClip(timeline, clipId);
  if (!found) return timeline;
  const clip = found.clip;
  if (!clip.multicamGroupId) return timeline;
  const group = timeline.multicamGroups?.find((g) => g.id === clip.multicamGroupId);
  if (!group) return timeline;
  const safeIdx = Math.max(0, Math.min(group.angles.length - 1, angleIndex));

  // Same-angle no-op — keeps the timeline stable when the user spams
  // the active angle.
  if ((clip.multicamAngleIndex ?? 0) === safeIdx) return timeline;

  // Whole-clip switch when the playhead sits at (or before) the clip's
  // start — no split needed.
  if (frame <= clip.startFrame) {
    return updateClip(timeline, clipId, { multicamAngleIndex: safeIdx });
  }
  // Mid-clip: split at the playhead, then assign the new angle to the
  // right-hand half. The split helper preserves all other clip fields
  // (sourceId, multicamGroupId, effects, gain, etc.).
  const split = splitClipAt(timeline, clipId, frame);
  if (!split) return timeline;
  return updateClip(split.timeline, split.rightId, { multicamAngleIndex: safeIdx });
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

/**
 * Append an effect to a clip's effects array. Effects compose in array
 * order — later effects see the result of earlier ones. The editor's
 * "add effect" picker AND any preset/template that pre-bakes effects
 * onto a clip both go through here so ordering and id assignment stay
 * consistent.
 */
export function addClipEffect(
  timeline: Timeline,
  clipId: string,
  effect: { kind: string; params: Record<string, unknown> },
): Timeline {
  const found = findClip(timeline, clipId);
  if (!found) return timeline;
  const next = [...(found.clip.effects ?? []), { kind: effect.kind, params: effect.params }];
  return updateClip(timeline, clipId, { effects: next });
}

/** Remove the effect at the given index. No-op when out of range. */
export function removeClipEffect(
  timeline: Timeline,
  clipId: string,
  effectIndex: number,
): Timeline {
  const found = findClip(timeline, clipId);
  if (!found) return timeline;
  const effects = found.clip.effects ?? [];
  if (effectIndex < 0 || effectIndex >= effects.length) return timeline;
  const next = effects.filter((_, i) => i !== effectIndex);
  return updateClip(timeline, clipId, { effects: next });
}

/** Patch a single param on an existing effect. The slider/number/colour
 *  input handlers in the effects panel all call this — they don't
 *  rebuild the effects array inline. */
export function patchClipEffectParam(
  timeline: Timeline,
  clipId: string,
  effectIndex: number,
  paramKey: string,
  paramValue: unknown,
): Timeline {
  const found = findClip(timeline, clipId);
  if (!found) return timeline;
  const effects = found.clip.effects ?? [];
  if (effectIndex < 0 || effectIndex >= effects.length) return timeline;
  const next = effects.map((eff, i) =>
    i === effectIndex
      ? { ...eff, params: { ...eff.params, [paramKey]: paramValue } }
      : eff,
  );
  return updateClip(timeline, clipId, { effects: next });
}

/** Reorder an effect within a clip. Position is the new array index;
 *  values out of range clamp. Used by drag-to-reorder in the panel. */
export function reorderClipEffect(
  timeline: Timeline,
  clipId: string,
  fromIndex: number,
  toIndex: number,
): Timeline {
  const found = findClip(timeline, clipId);
  if (!found) return timeline;
  const effects = found.clip.effects ?? [];
  if (fromIndex < 0 || fromIndex >= effects.length) return timeline;
  const clampedTo = Math.max(0, Math.min(effects.length - 1, toIndex));
  if (clampedTo === fromIndex) return timeline;
  const next = effects.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(clampedTo, 0, moved);
  return updateClip(timeline, clipId, { effects: next });
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
