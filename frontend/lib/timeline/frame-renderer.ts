/**
 * Per-frame compositor for the Timeline render path.
 *
 * `renderTimelineFrame()` paints one frame of the composition onto a
 * canvas. Both render strategies (WebCodecs and ffmpeg.wasm) call into
 * this function — they only differ in what they do with the rendered
 * canvas after (encode to H.264 vs feed raw RGBA into ffmpeg). Per the
 * standing DRY rule, there is no parallel "render frame for ffmpeg" /
 * "render frame for WebCodecs" — one function, two consumers.
 *
 * Performance posture (M1):
 *   - Image clips: trivial drawImage from a cached HTMLImageElement.
 *   - Video clips: seek-and-draw via HTMLVideoElement. Slow (each frame
 *     waits on a seeked event) but correct. The intended M3 upgrade is
 *     to pre-decode each video source via VideoDecoder once, then index
 *     by frame for O(1) per-frame access. Until then, expect render
 *     time roughly equal to source playback time on a fast machine.
 *   - Audio: NOT mixed by this function. The render strategies handle
 *     audio separately (WebCodecs strategy will encode AAC via
 *     AudioEncoder + AudioContext mix; ffmpeg.wasm uses filter_complex).
 *
 * Renderer state — a per-render cache that lives in the strategy and is
 * threaded into every per-frame call so we don't recreate <video>/<img>
 * elements 30 times per second.
 */

import type { Clip, MediaSource, Timeline } from "@shared/timeline";
import { applyEffects } from "./effects";

/**
 * Resolves a nested-timeline reference to its Timeline + MediaSource
 * map. Caller-supplied because DB / API access lives outside this
 * module — editor preview and the render facade both inject one.
 */
export type NestedTimelineResolver = (
  id: string,
) => Promise<{ timeline: Timeline; sources: Record<string, MediaSource> } | null>;

export interface RendererState {
  /** Cached HTMLVideoElement / HTMLImageElement per sourceId. */
  media: Map<string, HTMLVideoElement | HTMLImageElement>;
  /** Resolved MediaSource map — same shape the render facade receives. */
  sources: Record<string, MediaSource>;
  /**
   * When true, video elements are loaded from `MediaSource.proxyUrl`
   * (when present) instead of `url`. The editor preview path turns
   * this on so scrubbing 4K masters stays responsive; the export
   * path leaves it false so the encoded MP4 carries master pixels.
   * Per #341.
   */
  useProxies: boolean;
  /** Optional resolver for nested-timeline clips. When absent, nested
   *  clips render as the canvas background colour (blank) so missing
   *  resolvers fail soft rather than crashing the whole render. */
  resolveNestedTimeline?: NestedTimelineResolver;
  /** Cache of nested renderer states keyed by timeline id. Re-using a
   *  state across frames avoids re-loading sources every tick. */
  nestedStates: Map<string, RendererState>;
  /** Cache of resolved nested timelines so we don't refetch each frame. */
  nestedTimelines: Map<string, Timeline>;
  /** OffscreenCanvas pool keyed by `${width}x${height}` — recycled
   *  across nested renders at matching resolutions. */
  nestedCanvases: Map<string, OffscreenCanvas>;
  /** Cycle guard — timeline ids currently mid-render. A clip pointing
   *  at any id in this set is skipped (and a warning logged) to prevent
   *  infinite recursion. */
  inFlight: Set<string>;
}

/**
 * Build a fresh renderer state. Strategies should call this ONCE per
 * render job and dispose() once they're done so cached <video>s are
 * cleaned up.
 */
export function createRendererState(
  sources: Record<string, MediaSource>,
  opts: {
    resolveNestedTimeline?: NestedTimelineResolver;
    /** Editor preview path turns this on; render path leaves it off. */
    useProxies?: boolean;
  } = {},
): RendererState {
  return {
    media: new Map(),
    sources,
    useProxies: opts.useProxies ?? false,
    resolveNestedTimeline: opts.resolveNestedTimeline,
    nestedStates: new Map(),
    nestedTimelines: new Map(),
    nestedCanvases: new Map(),
    inFlight: new Set(),
  };
}

/** Tear down cached media elements at end of render. Recurses into
 *  nested renderer states so a deep compound timeline cleans up fully. */
export function disposeRendererState(state: RendererState): void {
  for (const el of state.media.values()) {
    if (el instanceof HTMLVideoElement) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
  }
  state.media.clear();
  for (const nested of state.nestedStates.values()) {
    disposeRendererState(nested);
  }
  state.nestedStates.clear();
  state.nestedTimelines.clear();
  state.nestedCanvases.clear();
}

/**
 * Pre-load every source the timeline references. Returns once each
 * media element has reached HAVE_METADATA so per-frame seeks won't
 * race against initial load. Strategies should call this once before
 * the encode loop starts.
 */
export async function preloadSources(
  timeline: Timeline,
  state: RendererState,
): Promise<void> {
  const ids = new Set<string>();
  const nestedIds = new Set<string>();
  for (const t of timeline.tracks) {
    for (const c of t.clips) {
      if (c.nestedTimelineId) {
        nestedIds.add(c.nestedTimelineId);
        continue;
      }
      if (c.multicamGroupId) {
        // Preload every angle in the group so angle-switching at edit
        // time doesn't trigger a fresh fetch each switch.
        const group = timeline.multicamGroups?.find((g) => g.id === c.multicamGroupId);
        if (group) for (const a of group.angles) ids.add(a.sourceId);
      } else {
        ids.add(c.sourceId);
      }
    }
  }
  await Promise.all([
    ...Array.from(ids).map(async (id) => {
      const src = state.sources[id];
      if (!src) return;
      const el = await createMediaElement(src, state.useProxies);
      state.media.set(id, el);
    }),
    ...Array.from(nestedIds).map(async (id) => {
      await preloadNested(id, state);
    }),
  ]);
}

/**
 * Resolve a nested timeline (with cycle guard), preload its sources
 * recursively, and cache the renderer state for re-use across frames.
 * Cached on first hit so reseek doesn't refetch the project.
 */
async function preloadNested(id: string, parent: RendererState): Promise<void> {
  if (parent.nestedStates.has(id)) return;
  if (!parent.resolveNestedTimeline) return;
  if (parent.inFlight.has(id)) {
    console.warn(`[nle] nested-timeline cycle detected for ${id}; skipping.`);
    return;
  }
  parent.inFlight.add(id);
  try {
    const resolved = await parent.resolveNestedTimeline(id);
    if (!resolved) return;
    const child = createRendererState(resolved.sources, {
      resolveNestedTimeline: parent.resolveNestedTimeline,
      useProxies: parent.useProxies,
    });
    // Propagate the parent's cycle set so deep recursion stays bounded.
    for (const seen of parent.inFlight) child.inFlight.add(seen);
    await preloadSources(resolved.timeline, child);
    parent.nestedTimelines.set(id, resolved.timeline);
    parent.nestedStates.set(id, child);
  } finally {
    parent.inFlight.delete(id);
  }
}

/**
 * Composite one frame of the Timeline onto the given canvas.
 *
 * Order:
 *   1. Fill background.
 *   2. For each VIDEO track in array order (lower index = drawn first =
 *      under), find the active clip at this frame and draw it.
 *   3. Audio tracks are ignored — they're rendered via a parallel audio
 *      path in the strategy.
 *
 * Cross-dissolve and fade-to-black transitions are honoured by reading
 * the outgoing clip's `outTransition` and blending against the next
 * clip on the same track for `durationFrames` of overlap.
 */
export async function renderTimelineFrame(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  timeline: Timeline,
  state: RendererState,
  frame: number,
): Promise<void> {
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("2D canvas context unavailable");

  // Background fill — Timeline-owned colour, NEVER inferred.
  ctx.fillStyle = timeline.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const track of timeline.tracks) {
    if (track.kind !== "video") continue;
    const active = activeClipAt(track.clips, frame);
    if (!active) continue;
    await drawClip(ctx, canvas, active, frame, timeline, state);

    // Cross-dissolve: when the active clip's out-transition overlaps
    // the next clip's in-frame, draw the next clip on top with alpha
    // proportional to how far we are through the transition.
    const next = nextClipAfter(track.clips, active);
    const tr = active.outTransition;
    if (next && tr && tr.kind === "cross-dissolve" && tr.durationFrames > 0) {
      const transitionStart = active.startFrame + active.durationFrames - tr.durationFrames;
      if (frame >= transitionStart) {
        const t = (frame - transitionStart) / tr.durationFrames;
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = Math.max(0, Math.min(1, t));
        await drawClip(ctx, canvas, next, frame, timeline, state);
        ctx.globalAlpha = prevAlpha;
      }
    }
    if (tr && tr.kind === "fade-to-black" && tr.durationFrames > 0) {
      const transitionStart = active.startFrame + active.durationFrames - tr.durationFrames;
      if (frame >= transitionStart) {
        const t = (frame - transitionStart) / tr.durationFrames;
        ctx.fillStyle = "rgba(0,0,0," + Math.max(0, Math.min(1, t)) + ")";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Resolve a clip's effective source: for multicam clips, look up the
 * timeline's multicamGroups + active angle and return that angle's
 * sourceId + syncOffset. For everything else, the clip's own sourceId
 * with a zero offset. Single source of truth so the audio mixer, the
 * preview compositor, and the WebCodecs strategy all agree.
 */
export function resolveClipSource(
  clip: Clip,
  timeline: Timeline,
): { sourceId: string; syncOffsetFrames: number } {
  if (!clip.multicamGroupId) {
    return { sourceId: clip.sourceId, syncOffsetFrames: 0 };
  }
  const group = timeline.multicamGroups?.find((g) => g.id === clip.multicamGroupId);
  if (!group || group.angles.length === 0) {
    return { sourceId: clip.sourceId, syncOffsetFrames: 0 };
  }
  const idx = clip.multicamAngleIndex ?? 0;
  const safeIdx = Math.max(0, Math.min(group.angles.length - 1, idx));
  const angle = group.angles[safeIdx];
  return { sourceId: angle.sourceId, syncOffsetFrames: angle.syncOffsetFrames };
}

/** Find the clip that contains `frame`, or null. Clips are sorted. */
function activeClipAt(clips: Clip[], frame: number): Clip | null {
  for (const c of clips) {
    if (frame >= c.startFrame && frame < c.startFrame + c.durationFrames) return c;
  }
  return null;
}

function nextClipAfter(clips: Clip[], clip: Clip): Clip | null {
  const after = clips.filter(
    (c) => c.id !== clip.id && c.startFrame >= clip.startFrame + clip.durationFrames,
  );
  after.sort((a, b) => a.startFrame - b.startFrame);
  return after[0] ?? null;
}

async function drawClip(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  clip: Clip,
  timelineFrame: number,
  timeline: Timeline,
  state: RendererState,
): Promise<void> {
  // Nested-timeline clips dispatch through the recursive compositor
  // and short-circuit the source/media lookup. The translation from
  // timelineFrame → nested frame mirrors the video case (offset +
  // sourceIn) so trimming a compound clip works the same way.
  if (clip.nestedTimelineId) {
    await drawNestedClip(ctx, canvas, clip, timelineFrame, state);
  } else {
    // Multicam clips resolve their effective source through the
    // timeline's multicamGroups map instead of the clip's sourceId.
    // Single dispatch point — the renderer never branches on multicam
    // mode anywhere else.
    const resolved = resolveClipSource(clip, timeline);
    const src = state.sources[resolved.sourceId];
    const el = state.media.get(resolved.sourceId);
    if (!src || !el) return;

    if (el instanceof HTMLImageElement) {
      drawCovering(ctx, el, canvas.width, canvas.height);
    } else {
      // Video: seek to source time, await seeked, draw current frame.
      // The source-time conversion accounts for the source's native fps
      // potentially differing from the timeline fps — we go through seconds
      // so a 60fps source on a 30fps timeline plays at 1× speed.
      const offsetFrames =
        timelineFrame - clip.startFrame + clip.sourceInFrame + resolved.syncOffsetFrames;
      const sourceSeconds = (offsetFrames / timeline.fps);
      await seekTo(el as HTMLVideoElement, sourceSeconds);
      drawCovering(ctx, el as HTMLVideoElement, canvas.width, canvas.height);
    }
  }

  // Run per-clip effects against the freshly-drawn pixels. The compositor
  // never branches on effect kind — applyEffects() dispatches through the
  // registry. Adding an effect kind is one registerEffect() call elsewhere.
  applyEffects(clip.effects, {
    ctx,
    canvas,
    timelineFrame,
    clipFrame: timelineFrame - clip.startFrame,
    clipDurationFrames: clip.durationFrames,
    fps: timeline.fps,
  });
}

async function drawNestedClip(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  clip: Clip,
  timelineFrame: number,
  state: RendererState,
): Promise<void> {
  const id = clip.nestedTimelineId!;
  // Preload-on-demand if the parent didn't preload (single-frame paint
  // paths like editor preview may skip the global preload).
  if (!state.nestedStates.has(id)) await preloadNested(id, state);
  const child = state.nestedStates.get(id);
  const childTimeline = state.nestedTimelines.get(id);
  if (!child || !childTimeline) return;

  const key = `${canvas.width}x${canvas.height}`;
  let off = state.nestedCanvases.get(key);
  if (!off) {
    off = new OffscreenCanvas(canvas.width, canvas.height);
    state.nestedCanvases.set(key, off);
  }
  // The nested timeline composes at its own resolution; we letterbox by
  // matching the parent canvas dimensions, then drawCovering picks up
  // the result.
  state.inFlight.add(id);
  try {
    const childFrame = timelineFrame - clip.startFrame + clip.sourceInFrame;
    await renderTimelineFrame(off, childTimeline, child, childFrame);
  } finally {
    state.inFlight.delete(id);
  }
  ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
}

/** Draw an image/video centred and covering the canvas (preserves aspect ratio). */
function drawCovering(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  cw: number,
  ch: number,
): void {
  // Pull source dimensions; HTMLVideoElement exposes videoWidth/Height,
  // HTMLImageElement uses naturalWidth/Height.
  let sw = 0, sh = 0;
  if (source instanceof HTMLVideoElement) {
    sw = source.videoWidth;
    sh = source.videoHeight;
  } else if (source instanceof HTMLImageElement) {
    sw = source.naturalWidth;
    sh = source.naturalHeight;
  }
  if (!sw || !sh) {
    ctx.drawImage(source, 0, 0, cw, ch);
    return;
  }
  const sourceRatio = sw / sh;
  const canvasRatio = cw / ch;
  let dw: number, dh: number, dx: number, dy: number;
  if (sourceRatio > canvasRatio) {
    dh = ch;
    dw = ch * sourceRatio;
    dx = (cw - dw) / 2;
    dy = 0;
  } else {
    dw = cw;
    dh = cw / sourceRatio;
    dx = 0;
    dy = (ch - dh) / 2;
  }
  ctx.drawImage(source, dx, dy, dw, dh);
}

async function createMediaElement(
  src: MediaSource,
  useProxy: boolean,
): Promise<HTMLVideoElement | HTMLImageElement> {
  if (src.kind === "image") {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Image failed to load: ${src.filename}`));
      img.src = src.url;
    });
    return img;
  }
  // video or audio — but audio is filtered out before drawClip is called.
  // Editor preview path picks the proxy when available; render path
  // always reads the master so the encoded output carries master pixels.
  // Per #341 — single decision point so both paths route through the
  // same fallback (proxy missing → master).
  const playbackUrl = useProxy && src.proxyUrl ? src.proxyUrl : src.url;
  const v = document.createElement("video");
  v.crossOrigin = "anonymous";
  v.muted = true; // we don't play audio from the rendered <video>; audio is mixed separately.
  v.preload = "auto";
  v.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    v.onloadedmetadata = () => resolve();
    v.onerror = () => reject(new Error(`Video failed to load: ${src.filename}`));
    v.src = playbackUrl;
  });
  return v;
}

/**
 * Seek a video element to a target time and resolve when the frame is
 * available. We round to a small epsilon — exact-equal currentTime
 * comparisons sometimes never fire `seeked` because the demuxer can't
 * deliver an exact frame at a non-keyframe boundary.
 */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.max(0, Math.min(video.duration || time, time));
  if (Math.abs(video.currentTime - target) < 1 / 120) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = target;
  });
}
