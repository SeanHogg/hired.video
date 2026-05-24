/**
 * Animation state spec — the canonical JSON shape for
 * `mediaKind: "animation"` studio projects (frame-by-frame raster
 * animation, Phase 5 of the studio media-kinds plan and net-new
 * closures for Consolidated Gap Register #1002 + #1003).
 *
 * Parallel to `shared/timeline.ts` (Timeline runtime),
 * `shared/game-state.ts` (Game runtime) and `shared/image-state.ts`
 * (Image runtime) — each canvas runtime owns its own state model per
 * PRD §1.2 canvas-runtime extensibility.
 *
 * STATE MODEL — a strip of frames + onion-skin depth + fps. Each frame
 * carries its raster pixels as a base64 PNG dataURL (`pixelsDataUrl`)
 * mirroring `ImageLayer.pixelsDataUrl` so the project round-trips
 * cleanly through JSONB without an out-of-band blob store. Onion-skin
 * is rendered by the editor from the previous N frames' dataURLs; the
 * shape carries no per-frame layer stack today (multi-layer per frame
 * is a roadmap follow-on if users ask for it).
 *
 * EXPORT — `outputProfilesFor("animation")` returns GIF / WebP / APNG /
 * MP4-alpha; the runtime emits a frame iterator that each encoder
 * strategy reads sequentially. See [frontend/lib/timeline/gif-render.ts]
 * for the GIF89a encoder strategy.
 *
 * Versioning: `schemaVersion` is bumped on any breaking change. Don't
 * delete or rename existing fields — add new ones with defaults and
 * migrate readers. The first version covers the MVP (frames + brush +
 * onion-skin + GIF export); follow-on tools (per-frame layers, vector
 * shape interpolation, lottie import) layer onto the same shape.
 *
 * Persistence: `studio_projects.animation_state` jsonb column
 * (migration 0106). The editor's `<CanvasRouter mediaKind/>` mounts
 * `<AnimationStage>` when the project is animation-kind and the stage
 * reads / writes this shape via the standard save-draft endpoint.
 */

export const ANIMATION_STATE_SCHEMA_VERSION = 1;

/** A single frame in the animation strip. Frames render in array order
 *  at the project's fps; `pixelsDataUrl` is the raster pixels at the
 *  project's width/height (an empty frame paints the project's
 *  background fill behind any prior-frame onion-skin overlay). */
export interface AnimationFrame {
  /** Stable id so the editor can update / delete a frame in place
   *  without re-keying the React list. */
  id: string;
  /** Per-frame raster pixels as a base64 PNG dataURL, sized to the
   *  project's canvas dimensions. Null for a blank frame. */
  pixelsDataUrl: string | null;
  /** Optional per-frame hold count — `1` (default) plays the frame
   *  for one tick at the project fps. `>1` holds the frame for that
   *  many ticks (the "exposure sheet" / "X-sheet" convention from
   *  hand-drawn animation: a "2s" exposure holds a drawing for 2
   *  frames at 24fps = ~83ms). The runtime + every encoder reads
   *  this so the playback + export honour holds without duplicating
   *  pixel data. */
  hold?: number;
}

/** Background fill behind every frame. Mirrors `image-state.ts`'s
 *  CanvasBackground so the two runtimes share a vocabulary — a future
 *  consolidation could lift this into a `shared/canvas-types.ts`. */
export type AnimationBackground =
  | { kind: "transparent" }
  | { kind: "color"; color: string };

export interface AnimationState {
  schemaVersion: number;
  /** Canvas width in pixels. Defaults to 480 (animator-friendly social
   *  GIF dimension); capped at 1920 for round-trip payload sanity. */
  width: number;
  /** Canvas height in pixels. Defaults to 480. */
  height: number;
  /** Playback / export frame rate. 12 fps is the traditional hand-drawn
   *  "on 2s" rate; 24 fps "on 1s" is film-standard. Stop-motion typically
   *  ships at 12 or 15. The runtime treats this as the encoder's input
   *  fps and the editor's playback interval. */
  fps: number;
  /** Background fill behind layer pixels. Drives both the editor's
   *  checker-vs-color rendering and the encoder's first-paint clear. */
  background: AnimationBackground;
  /** Frame strip in playback order. Index 0 is the FIRST frame. The
   *  editor's frame rail shows the same order left-to-right. */
  frames: AnimationFrame[];
  /** Which frame is currently active in the editor (selection state).
   *  Must match a `frames[].id`. The editor enforces "there is always
   *  an active frame" — the constraint lives client-side. */
  activeFrameId: string;
  /** How many previous frames to render at reduced opacity behind the
   *  active frame as onion-skin reference. 0 disables onion-skin; 1–3
   *  is the typical workflow. The runtime reads this per-paint. */
  onionSkinDepth: number;
  /** Loop count on export — `0` is "loop forever" (the GIF browser
   *  default), `1` plays once and stops. Most animators ship looping
   *  GIFs; the field is here so a future "play once" CTA loop can opt
   *  out without a schema change. */
  loopCount: number;
}

// ─── Factory + helpers (single source — every caller routes through here) ──

export const DEFAULT_ANIMATION_WIDTH = 480;
export const DEFAULT_ANIMATION_HEIGHT = 480;
export const DEFAULT_ANIMATION_FPS = 12;
export const DEFAULT_ANIMATION_ONION_DEPTH = 1;

/** Build a blank animation state with one empty frame. Used by the
 *  StudioEditorV2 hydration path when a fresh `mediaKind: 'animation'`
 *  project loads with `animation_state IS NULL`. */
export function createBlankAnimationState(
  width: number = DEFAULT_ANIMATION_WIDTH,
  height: number = DEFAULT_ANIMATION_HEIGHT,
  background: AnimationBackground = { kind: "color", color: "#ffffff" },
  fps: number = DEFAULT_ANIMATION_FPS,
): AnimationState {
  const frameId = makeFrameId();
  return {
    schemaVersion: ANIMATION_STATE_SCHEMA_VERSION,
    width,
    height,
    fps,
    background,
    frames: [{ id: frameId, pixelsDataUrl: null, hold: 1 }],
    activeFrameId: frameId,
    onionSkinDepth: DEFAULT_ANIMATION_ONION_DEPTH,
    loopCount: 0,
  };
}

/** Stable id helper — used for frame insertion + duplication so the
 *  editor's React keys don't churn. */
export function makeFrameId(): string {
  return `frame-${Math.random().toString(36).slice(2, 10)}`;
}

/** Resolve a frame by id. Returns null when the id doesn't match — the
 *  editor falls back to the first frame in that case. */
export function findFrame(state: AnimationState, frameId: string): AnimationFrame | null {
  return state.frames.find((f) => f.id === frameId) ?? null;
}

/** Return the frame index for the given id, or -1 when not found. */
export function frameIndex(state: AnimationState, frameId: string): number {
  return state.frames.findIndex((f) => f.id === frameId);
}

/** Pick the first frame with pixel content for thumbnail surfaces
 *  (`<VideoProjectThumbnail>`, kind-aware preview cards). Mirrors
 *  `firstLayerPixels` in image-state.ts. */
export function firstFramePixels(
  state: AnimationState | null | undefined,
): string | null {
  if (!state) return null;
  for (const f of state.frames) {
    if (f.pixelsDataUrl != null) return f.pixelsDataUrl;
  }
  return null;
}

/** Total playback duration in seconds, honouring per-frame `hold` ticks.
 *  Used by the encoder to size GIF/WebP/APNG delays and by the editor
 *  to show the playback timeline. */
export function totalDurationSec(state: AnimationState): number {
  if (state.fps <= 0) return 0;
  const ticks = state.frames.reduce((acc, f) => acc + Math.max(1, f.hold ?? 1), 0);
  return ticks / state.fps;
}

// ─── Pure mutation helpers ─────────────────────────────────────────────────
// These mirror `game-state-edit.ts`'s structural-share pattern so the
// editor's history wrapper can diff cheaply.

/** Replace a frame's pixels in place. Returns a new state with the
 *  target frame's `pixelsDataUrl` updated; other frames are
 *  reference-equal. */
export function updateFramePixels(
  state: AnimationState,
  frameId: string,
  pixelsDataUrl: string | null,
): AnimationState {
  return {
    ...state,
    frames: state.frames.map((f) =>
      f.id === frameId ? { ...f, pixelsDataUrl } : f,
    ),
  };
}

/** Insert a blank frame immediately AFTER the given frame id. Returns
 *  the new state plus the inserted frame's id so callers can select it. */
export function insertFrameAfter(
  state: AnimationState,
  afterFrameId: string,
): { state: AnimationState; newFrameId: string } {
  const idx = frameIndex(state, afterFrameId);
  const newId = makeFrameId();
  const newFrame: AnimationFrame = { id: newId, pixelsDataUrl: null, hold: 1 };
  const insertAt = idx === -1 ? state.frames.length : idx + 1;
  const next = [...state.frames];
  next.splice(insertAt, 0, newFrame);
  return {
    state: { ...state, frames: next, activeFrameId: newId },
    newFrameId: newId,
  };
}

/** Duplicate the given frame into the slot immediately after it,
 *  copying its pixels. The canonical workflow for "tween by hand":
 *  duplicate the previous frame then nudge a few pixels. */
export function duplicateFrame(
  state: AnimationState,
  frameId: string,
): { state: AnimationState; newFrameId: string } {
  const idx = frameIndex(state, frameId);
  if (idx === -1) return { state, newFrameId: state.activeFrameId };
  const src = state.frames[idx];
  const newId = makeFrameId();
  const dup: AnimationFrame = {
    id: newId,
    pixelsDataUrl: src.pixelsDataUrl,
    hold: src.hold,
  };
  const next = [...state.frames];
  next.splice(idx + 1, 0, dup);
  return {
    state: { ...state, frames: next, activeFrameId: newId },
    newFrameId: newId,
  };
}

/** Remove a frame; if it was the active frame, selection falls back to
 *  the previous frame (or the next when removing index 0). The strip
 *  always keeps at least one frame — removing the last is a no-op. */
export function removeFrame(state: AnimationState, frameId: string): AnimationState {
  if (state.frames.length <= 1) return state;
  const idx = frameIndex(state, frameId);
  if (idx === -1) return state;
  const next = state.frames.filter((f) => f.id !== frameId);
  let nextActive = state.activeFrameId;
  if (state.activeFrameId === frameId) {
    const fallbackIdx = Math.max(0, idx - 1);
    nextActive = next[fallbackIdx]?.id ?? next[0].id;
  }
  return { ...state, frames: next, activeFrameId: nextActive };
}

/** Reorder a frame to a new index (e.g. drag-to-reorder on the strip).
 *  Out-of-bounds destination indices clamp to the strip. */
export function reorderFrame(
  state: AnimationState,
  frameId: string,
  destIndex: number,
): AnimationState {
  const idx = frameIndex(state, frameId);
  if (idx === -1) return state;
  const clamped = Math.max(0, Math.min(state.frames.length - 1, destIndex));
  if (clamped === idx) return state;
  const next = [...state.frames];
  const [moved] = next.splice(idx, 1);
  next.splice(clamped, 0, moved);
  return { ...state, frames: next };
}

/** Update the project-level settings (width / height / fps / background /
 *  onionSkinDepth / loopCount). The helper exists so the inspector
 *  doesn't reach into the shape directly. */
export function updateAnimationSettings(
  state: AnimationState,
  patch: Partial<Pick<AnimationState, "width" | "height" | "fps" | "background" | "onionSkinDepth" | "loopCount">>,
): AnimationState {
  return { ...state, ...patch };
}

/** Update a frame's hold count. Clamps to [1, 30] so a malformed input
 *  can't freeze playback. */
export function updateFrameHold(
  state: AnimationState,
  frameId: string,
  hold: number,
): AnimationState {
  const clamped = Math.max(1, Math.min(30, Math.round(hold)));
  return {
    ...state,
    frames: state.frames.map((f) =>
      f.id === frameId ? { ...f, hold: clamped } : f,
    ),
  };
}
