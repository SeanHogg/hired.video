/**
 * Timeline JSON spec — the single source of truth for video composition
 * across hired.video. Both the power-user NLE and the future magic-template
 * editors (sizzle reel, podcast episode, audition reel) serialize to this
 * shape. ONE render facade consumes it. There is no "NLE render path" vs
 * "template render path" — only `Timeline → output media`.
 *
 * Storage: persisted as `studio_projects.timeline_spec` jsonb when
 * `studio_projects.kind = 'nle'`. The legacy scene-based editor continues
 * to use `studio_projects.storyboard` for `kind = 'scene'`. Migration
 * 0067 adds both columns.
 *
 * Versioning: `schemaVersion` is bumped on any breaking change. Migrations
 * for prior versions live in `frontend/lib/timeline/migrations.ts` (added
 * when needed). Do NOT delete or rename existing fields — add new ones
 * with defaults and migrate readers.
 */

export const TIMELINE_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------------

export interface Timeline {
  schemaVersion: number;
  /** Frames per second the timeline composes at. Output render is in this rate. */
  fps: number;
  /** Output frame width in pixels. */
  width: number;
  /** Output frame height in pixels. */
  height: number;
  /** Solid background fill when no video clip occupies a frame. */
  backgroundColor: string;
  /** Tracks ordered top-to-bottom. Higher index = composited on top for video; channel order doesn't affect audio mix. */
  tracks: Track[];
  /** Optional named markers for chapter/cue points. */
  markers?: Marker[];
  /** Multicam groups — N angles of the same take, sync-aligned. A clip
   *  with `multicamGroupId` plays whichever angle the clip's
   *  `multicamAngleIndex` selects; cutting between angles is just
   *  splitting + bumping the index. Empty / undefined = no multicam. */
  multicamGroups?: MulticamGroup[];
}

export interface MulticamGroup {
  id: string;
  label: string;
  /** Per-angle source binding. The renderer composites whichever entry
   *  the active clip's `multicamAngleIndex` points at. */
  angles: MulticamAngle[];
}

export interface MulticamAngle {
  sourceId: string;
  /** Frame offset added to the clip's source-time lookup so that all
   *  angles of the same take align against a common timeline-zero
   *  reference. Negative offsets shift the angle later, positive earlier. */
  syncOffsetFrames: number;
  label: string;
}

export interface Marker {
  id: string;
  /** Position in frames from timeline start. */
  frame: number;
  label: string;
  /** Hex color for the marker pin in the editor. */
  color?: string;
}

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

export type TrackKind = "video" | "audio";

export interface Track {
  id: string;
  kind: TrackKind;
  label: string;
  /** Linear gain applied to every audio clip on the track. Ignored for video tracks. Range: 0..2. */
  gain: number;
  /** Stereo balance. -1 = full left, 0 = center, +1 = full right. Audio only. */
  pan: number;
  muted: boolean;
  solo: boolean;
  /** When true, the track ignores edit operations from the editor surface. Render still composites it. */
  locked: boolean;
  clips: Clip[];
  /**
   * Track-level effects rack. For audio tracks, kinds prefixed with
   * `audio-` (eq, compressor, limiter, gate) are dispatched through
   * the audio-effect registry during mixdown. Visual tracks ignore
   * this field today; reserved for future track-wide visual ops
   * (e.g. uniform LUT across an entire B-roll track).
   */
  effects?: ClipEffect[];
  /**
   * Overlay track — clips on this track may share frames. The renderer
   * iterates `activeClipsAt` and paints every visible clip in
   * clip-array order (= z-order). Set `true` on the canvas-state
   * widget pool (`v2`) per the #840 unification; default `false`
   * everywhere else (sequential tracks: bg / scene-post / music /
   * voiceover). Honoured by `isRenderable` + `insertClip`.
   */
  allowsOverlap?: boolean;
}

// ---------------------------------------------------------------------------
// Clips
// ---------------------------------------------------------------------------

export interface Clip {
  id: string;
  /** Foreign key into MediaSource[]. Set to the empty string when the
   *  clip is a nested timeline (see `nestedTimelineId`); the renderer
   *  reads `nestedTimelineId` first and skips the source lookup. */
  sourceId: string;
  /**
   * When set, the clip renders the referenced studio_projects row
   * (kind='nle') as a nested timeline (compound clip). The render
   * facade resolves the id to a Timeline + MediaSource map at render
   * time and recursively composites it. Cycles are guarded — a
   * timeline that references itself, directly or transitively, fails
   * loud rather than recurring forever.
   */
  nestedTimelineId?: string;
  /** Multicam binding. When set, the renderer resolves the active
   *  source via `Timeline.multicamGroups[multicamGroupId].angles[multicamAngleIndex]`
   *  instead of `sourceId`. Splitting a clip and changing the index is
   *  the standard angle-switch workflow. */
  multicamGroupId?: string;
  /** Index into the resolved multicam group's angles array. Defaults
   *  to 0 when omitted. */
  multicamAngleIndex?: number;
  /** Position on the track in frames (0 = timeline start). */
  startFrame: number;
  /** Duration the clip occupies on the track, in frames. */
  durationFrames: number;
  /** In-point on the source media in frames. Allows trimming the head.
   *  For nested-timeline clips this is the offset INTO the nested
   *  timeline at which playback begins. */
  sourceInFrame: number;
  /** Per-clip audio gain multiplier on top of the track gain. Audio clips only. */
  gain?: number;
  /** Reserved for M2+. Color, key, mask, blend mode, etc. Empty array = no effects. */
  effects?: ClipEffect[];
  /** Transition applied at the OUT edge of this clip into the next clip on the same track. */
  outTransition?: Transition;
}

export type TransitionKind = "cut" | "cross-dissolve" | "fade-to-black";

export interface Transition {
  kind: TransitionKind;
  /** Transition duration in frames. `cut` MUST be 0. */
  durationFrames: number;
}

/**
 * Reserved for M2 (color grading, keyframes, green-screen). Each effect is
 * `{ kind, params }` where `kind` selects a renderer-side handler. Adding a
 * new effect is one entry in the effect-renderer registry — no fork in the
 * Timeline spec itself.
 */
export interface ClipEffect {
  kind: string;
  params: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Media sources
// ---------------------------------------------------------------------------
//
// MediaSources are stored separately from the Timeline (in their own
// table, joined at edit time) because they're large, deduplicated by
// content hash, and reused across timelines. The Timeline holds only the
// stable `sourceId`. The editor and render facade resolve sources to URLs
// at the boundary.

export type MediaKind = "video" | "audio" | "image";

export interface MediaSource {
  id: string;
  kind: MediaKind;
  /** R2 URL of the original upload. */
  url: string;
  /**
   * R2 URL of the proxy (downsampled video, e.g. 720p H.264) used by the
   * editor for fast scrubbing. The render facade always uses `url`, never
   * the proxy. Null until the proxy job completes.
   */
  proxyUrl: string | null;
  /** Total duration of the source media in frames at the timeline fps. */
  durationFrames: number;
  /** Native frame rate of the source (used to translate sourceInFrame across fps). */
  fps: number;
  /** Native dimensions. Null for audio sources. */
  width: number | null;
  height: number | null;
  filename: string;
  uploadedAt: string;
}

// ---------------------------------------------------------------------------
// Render jobs
// ---------------------------------------------------------------------------
//
// Render runs entirely client-side (ffmpeg.wasm or WebCodecs) — no
// server-side queue table is needed. The client tracks job state in
// memory and uploads the finished MP4 to R2, then updates
// `studio_projects.video_id` to point at the new `videos` row. The
// RenderJob shape below is for the in-memory editor state, not the DB.

export type RenderEngineId = "webcodecs" | "ffmpeg-wasm" | "audio-only";

export type RenderStatus = "queued" | "running" | "done" | "failed";

export interface RenderJob {
  id: string;
  timelineId: string;
  engine: RenderEngineId;
  status: RenderStatus;
  /** Progress 0..1. */
  progress: number;
  /** When status='done', the R2 URL of the rendered MP4. */
  outputUrl?: string;
  /** When status='done', the videos.id row created from the upload. */
  videoId?: string;
  /** When status='failed', the human-readable error. */
  error?: string;
  startedAt: string;
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// Validation predicates — single source of truth, per the DRY rule
// ---------------------------------------------------------------------------
//
// Every consumer that needs to know "is this Timeline renderable?" or "is
// this clip valid?" calls these functions. Editors must NOT re-implement
// these checks inline — that's how branching gates drift across files.

/**
 * Build a fresh Timeline with sensible defaults. Seeds the five
 * universal tracks every composition uses:
 *
 *   v1   — background (one bg clip per scene authored by canvas-state)
 *   v2   — widget overlays (all canvas-v2:* widget clips, z-sorted)
 *   v3   — scene-post effects (sourceless clips whose effects apply to
 *          the fully composited frame: blur / glow / vignette / etc.)
 *   a1   — music
 *   a2   — voiceover
 *
 * Single source of truth — every "new film" entry point calls this and
 * `canvasStateToTimeline` emits exactly this same five-track shape on
 * every save. No legacy/new variants; no per-widget tracks.
 *
 * Callers that explicitly want an empty timeline pass
 * `seedTracks: false`.
 */
export function emptyTimeline(opts: {
  fps?: number;
  width?: number;
  height?: number;
  seedTracks?: boolean;
} = {}): Timeline {
  const seed = opts.seedTracks !== false;
  const tracks: Track[] = seed
    ? [
        defaultTrack({ id: "v1", kind: "video", label: "Background" }),
        defaultTrack({ id: "v2", kind: "video", label: "Widgets", allowsOverlap: true }),
        defaultTrack({ id: "v3", kind: "video", label: "Scene post" }),
        defaultTrack({ id: "a1", kind: "audio", label: "Music" }),
        defaultTrack({ id: "a2", kind: "audio", label: "Voiceover" }),
      ]
    : [];
  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    fps: opts.fps ?? 30,
    width: opts.width ?? 1920,
    height: opts.height ?? 1080,
    backgroundColor: "#000000",
    tracks,
    markers: [],
  };
}

/** Build a track with default mix settings. Used by emptyTimeline() and
 *  the editor's "+ Add track" action so every new track starts the same. */
export function defaultTrack(opts: {
  id: string;
  kind: TrackKind;
  label: string;
  allowsOverlap?: boolean;
}): Track {
  return {
    id: opts.id,
    kind: opts.kind,
    label: opts.label,
    gain: 1,
    pan: 0,
    muted: false,
    solo: false,
    locked: false,
    clips: [],
    ...(opts.allowsOverlap ? { allowsOverlap: true } : {}),
  };
}

/** Total duration of a track in frames (last clip's startFrame + durationFrames). */
export function trackDurationFrames(track: Track): number {
  let max = 0;
  for (const clip of track.clips) {
    const end = clip.startFrame + clip.durationFrames;
    if (end > max) max = end;
  }
  return max;
}

/** Total duration of the timeline in frames (max of all track durations). */
export function timelineDurationFrames(timeline: Timeline): number {
  let max = 0;
  for (const track of timeline.tracks) {
    const td = trackDurationFrames(track);
    if (td > max) max = td;
  }
  return max;
}

/** Convert a frame count to seconds at the timeline fps. */
export function framesToSeconds(frames: number, fps: number): number {
  return frames / fps;
}

/** Convert seconds to a whole-frame count at the given fps. */
export function secondsToFrames(seconds: number, fps: number): number {
  return Math.round(seconds * fps);
}

/**
 * Two clips on the same track overlap when one starts before the other
 * ends. Used by the editor to refuse drops that would create overlap and
 * by the render facade to assert invariants before encoding.
 */
export function clipsOverlap(a: Clip, b: Clip): boolean {
  const aEnd = a.startFrame + a.durationFrames;
  const bEnd = b.startFrame + b.durationFrames;
  return a.startFrame < bEnd && b.startFrame < aEnd;
}

/** True when no two clips on the same sequential track overlap. Tracks
 *  flagged `allowsOverlap` (the canvas-state widget pool on `v2` per the
 *  #840 unification) are skipped — multiple simultaneous widgets are the
 *  design, not an error. The legacy `v2` id is grandfathered in for
 *  stored timelines that pre-date the flag so the renderer keeps
 *  accepting them. */
export function tracksHaveNoOverlap(timeline: Timeline): boolean {
  for (const track of timeline.tracks) {
    if (isOverlapAllowedTrack(track)) continue;
    for (let i = 0; i < track.clips.length; i++) {
      for (let j = i + 1; j < track.clips.length; j++) {
        if (clipsOverlap(track.clips[i], track.clips[j])) return false;
      }
    }
  }
  return true;
}

/** A track that is permitted to carry overlapping clips. Either the
 *  explicit `allowsOverlap` flag, or the canonical canvas-state widget
 *  pool id (`v2`) — the architectural contract from #840 + #844. */
export function isOverlapAllowedTrack(track: Track): boolean {
  return track.allowsOverlap === true || track.id === "v2";
}

/**
 * A timeline is renderable when it has at least one track with at least
 * one clip, and no track has overlapping clips. Used by the render button
 * (disabled until true) AND by the render facade as a precondition. ONE
 * predicate, two consumers — neither re-implements the check.
 */
export function isRenderable(timeline: Timeline): boolean {
  const hasContent = timeline.tracks.some((t) => t.clips.length > 0);
  return hasContent && tracksHaveNoOverlap(timeline);
}

/** True when the Timeline has zero clips on any video track. Used by
 *  the render facade to route audio-only projects (podcasts, voice
 *  templates) to the audio-only strategy without paying for the video
 *  compositor. Single source of truth — both the engine picker and the
 *  editor's preview chrome read this. */
export function isAudioOnly(timeline: Timeline): boolean {
  const hasAnyVideoContent = timeline.tracks.some(
    (t) => t.kind === "video" && t.clips.length > 0,
  );
  return !hasAnyVideoContent;
}

/**
 * Pick the right render engine for a Timeline. Single source of truth so
 * the editor, the render button, and the render facade all agree.
 *
 * Routing rule:
 *   1. If the timeline has no video-track clips, route to the audio-only
 *      strategy — emits MP3 / M4A / WAV without invoking the video
 *      compositor. Driven by Timeline shape, not by `mediaKind`, so a
 *      video project the user emptied of v-tracks still falls through to
 *      the right path.
 *   2. Otherwise: stay on WebCodecs as long as the per-frame compositor
 *      can handle the work and the output codec is H.264/AAC. Per-clip
 *      effects (color grading, masks, chroma key, etc.) modify canvas
 *      pixels BEFORE the encoder consumes them, so they don't need
 *      ffmpeg — the compositor in `frame-renderer.ts` runs the registry
 *      pass and the encoder ingests the resulting bitmap.
 *   3. Routes to ffmpeg.wasm only when the encoder itself can't produce
 *      the required output: ProRes / DNxHR exports, 4K-and-above where
 *      WebCodecs support is patchy across browsers, advanced transitions
 *      that need ffmpeg's filter_complex (the M5 catalog), and explicit
 *      codec asks via Timeline.exportProfile (M5 custom-format support).
 */
export function pickRenderEngine(timeline: Timeline): RenderEngineId {
  if (isAudioOnly(timeline)) return "audio-only";
  const hasComplexTransition = timeline.tracks.some((t) =>
    t.clips.some(
      (c) =>
        c.outTransition &&
        c.outTransition.kind !== "cut" &&
        c.outTransition.kind !== "cross-dissolve" &&
        c.outTransition.kind !== "fade-to-black",
    ),
  );
  const isHighRes = timeline.width > 1920 || timeline.height > 1080;
  if (hasComplexTransition || isHighRes) return "ffmpeg-wasm";
  return "webcodecs";
}
