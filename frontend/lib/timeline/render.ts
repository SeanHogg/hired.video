/**
 * Timeline render facade.
 *
 * The single entry point every editor surface uses to turn a Timeline
 * into an MP4 Blob. Per the standing DRY rule, callers MUST NOT branch
 * on which engine to use — this module owns that decision via
 * pickRenderEngine() from shared/timeline.ts.
 *
 * Three engines today (the export CODEC drives the choice, not the size):
 *   - WebCodecs:   the default — H.264 / HEVC / VP9 at any size up to 4K
 *                  (lib/timeline/export-codec.ts maps the codec + frame
 *                  size to the encoder settings). Per-clip effects
 *                  (color grading, masks, keying) are painted by the
 *                  frame compositor before the encoder sees the frame,
 *                  so they stay on this path too.
 *   - ffmpeg.wasm: only what the browser encoder can't produce — a
 *                  ProRes / DNxHD export codec, or advanced transitions
 *                  that need filter_complex. Lazy-loaded via dynamic
 *                  import so a typical export never downloads ffmpeg.
 *   - audio-only:  timelines with no video-track clips.
 *
 * Every engine implements the RenderStrategy interface below. New
 * engines (e.g. a hypothetical hardware-accelerated path) plug in by
 * implementing the interface and being added to the dispatch.
 */

import {
  pickRenderEngine,
  isRenderable,
  type RenderEngineId,
  type RenderJob,
  type Timeline,
  type MediaSource,
} from "../../../shared/timeline.js";
import type { NestedTimelineResolver } from "./frame-renderer";
import type { PlatformExportProfile } from "./export-profiles";

export interface RenderOptions {
  /** Called periodically with progress 0..1. Render runs to completion regardless. */
  onProgress?: (progress: number) => void;
  /** Aborts the render if signalled. Engine throws AbortError on the next checkpoint. */
  signal?: AbortSignal;
  /** When provided, the engine logs RenderJob updates here so the editor can update its UI. */
  onJobUpdate?: (job: RenderJob) => void;
  /** Resolver for nested-timeline (compound) clips. The render facade
   *  passes this through to the strategy so a Timeline that references
   *  another studio_projects row composes correctly. Caller-supplied
   *  because DB / API access lives outside the render module. */
  resolveNestedTimeline?: NestedTimelineResolver;
  /** When true, the encoder paints the hired.video corner watermark on
   *  every frame — the SAME pill the on-screen renderer mounts via
   *  `<BrandWatermark/>`. Caller resolves the branding-policy decision
   *  (free vs Pro-opted-out) via `shouldShowBranding({ isPro,
   *  removeBrandingFlag })` and threads the answer through here.
   *  Defaulting to false would mean a free-user export skips branding,
   *  so callers MUST pass the resolved boolean explicitly. */
  includeBranding?: boolean;
  /** Optional platform / social export profile override (#342, #343).
   *  When provided, the strategy uses the profile's resolution / fps /
   *  codec / bitrate instead of the Timeline's native shape. Used by
   *  the batch facade so the same Timeline can produce a YouTube
   *  1080p60 master AND a TikTok 9:16 vertical from one click. */
  platformProfile?: PlatformExportProfile;
  /** Caller's resolved Pro entitlement. Required to export a `proOnly`
   *  platform profile (`youtube-4k60` / `vimeo-prores-master` /
   *  `broadcast-1080i`). The picker UI greys these out for free users,
   *  but the facade enforces it too so a programmatic / batch caller
   *  can't slip a Pro-only master past the paywall (#1803). Defaults to
   *  false — callers MUST pass the resolved boolean to unlock Pro
   *  profiles. */
  isPro?: boolean;
}

/**
 * Thrown by the render facade when a `proOnly` platform profile is
 * requested without Pro entitlement (#1803). Carries a stable `code` so
 * the export UI can show an upgrade prompt rather than a generic error.
 */
export class RenderEntitlementError extends Error {
  readonly code = "PRO_REQUIRED" as const;
  constructor(profileId: string) {
    super(`Export profile '${profileId}' requires a Pro subscription.`);
    this.name = "RenderEntitlementError";
  }
}

export interface RenderResult {
  blob: Blob;
  /** MIME type, e.g. "video/mp4". */
  mime: string;
  /** Final encoded duration in seconds. */
  durationSeconds: number;
  /** Which engine handled this render. */
  engine: RenderEngineId;
}

export interface RenderStrategy {
  id: RenderEngineId;
  /** Returns true when the strategy can run in this environment. Caller
   *  uses this to surface an error before kicking off a long render. */
  isAvailable(): Promise<boolean>;
  render(
    timeline: Timeline,
    sources: Record<string, MediaSource>,
    opts: RenderOptions,
  ): Promise<RenderResult>;
}

/**
 * Resolve and lazy-load the strategy for an engine id. Each strategy
 * lives in its own module so the heavy ffmpeg.wasm bundle isn't pulled
 * into the WebCodecs fast path, and vice versa.
 */
async function loadStrategy(id: RenderEngineId): Promise<RenderStrategy> {
  if (id === "webcodecs") {
    const mod = await import("./webcodecs-render");
    return mod.webcodecsStrategy;
  }
  if (id === "ffmpeg-wasm") {
    const mod = await import("./ffmpeg-render");
    return mod.ffmpegWasmStrategy;
  }
  if (id === "audio-only") {
    const mod = await import("./audio-only-render");
    return mod.audioOnlyStrategy;
  }
  throw new Error(`Unknown render engine: ${id satisfies never}`);
}

/**
 * Render a Timeline to a Blob. Single entry point — the editor's
 * "Export" button calls this. The function picks the engine, loads it
 * lazily, and runs the render. Caller doesn't know or care which engine
 * handled it.
 *
 * Sources are passed alongside the Timeline because the Timeline holds
 * only stable `sourceId` references; the editor resolves these to URLs
 * at the boundary so the render facade isn't coupled to fetch / R2.
 */
export async function renderTimeline(
  timeline: Timeline,
  sources: Record<string, MediaSource>,
  opts: RenderOptions = {},
): Promise<RenderResult> {
  if (!isRenderable(timeline)) {
    throw new Error(
      "Timeline is not renderable — empty, or has overlapping clips on a track.",
    );
  }
  // #1803 — enforce Pro-only export profiles at the facade, not just in
  // the picker UI. Batch renders flow through here per-profile (with
  // `...opts` carrying isPro), so this single guard covers both paths.
  if (opts.platformProfile?.proOnly && !opts.isPro) {
    throw new RenderEntitlementError(opts.platformProfile.id);
  }
  const engineId = pickRenderEngine(timeline);
  const strategy = await loadStrategy(engineId);
  const available = await strategy.isAvailable();
  if (!available) {
    throw new Error(`Render engine '${engineId}' is not available in this browser.`);
  }
  return strategy.render(timeline, sources, opts);
}

export interface BatchRenderOptions extends RenderOptions {
  /** Called when a single profile completes (success or failure). The
   *  facade keeps going on failures so the caller still gets partial
   *  results. */
  onProfileComplete?: (
    index: number,
    result: { ok: true; result: RenderResult } | { ok: false; error: Error },
  ) => void;
}

export interface BatchRenderResult {
  /** One entry per input profile, in the same order. */
  results: Array<
    | { ok: true; profile: PlatformExportProfile; result: RenderResult }
    | { ok: false; profile: PlatformExportProfile; error: Error }
  >;
}

/**
 * Render a Timeline to N output profiles in one call (#343). Each
 * profile is a different (resolution, codec, bitrate, fps) bundle, so
 * the caller can ship the same project as a YouTube 1080p master, a
 * TikTok 9:16 vertical, and an Instagram square in one click instead
 * of running renderTimeline three times.
 *
 * Failures of one profile do NOT abort the batch — the caller still
 * gets results for every other profile and per-result `ok: false`
 * error entries for what failed. Overall onProgress reports the
 * weighted average across all profiles.
 *
 * The actual format-specific override (overriding codec/width/height/
 * fps from the Timeline shape) lives in the strategy — the strategy
 * sees the profile in opts.platformProfile and adapts. Older strategies
 * that don't know the field render at the Timeline's native shape;
 * the batch facade is forward-compatible.
 */
export async function renderTimelineBatch(
  timeline: Timeline,
  sources: Record<string, MediaSource>,
  profiles: PlatformExportProfile[],
  opts: BatchRenderOptions = {},
): Promise<BatchRenderResult> {
  if (profiles.length === 0) {
    throw new Error("renderTimelineBatch needs at least one profile");
  }
  if (!isRenderable(timeline)) {
    throw new Error(
      "Timeline is not renderable — empty, or has overlapping clips on a track.",
    );
  }
  const results: BatchRenderResult["results"] = [];
  const perProfileProgress = new Array<number>(profiles.length).fill(0);
  const aggregateProgress = () => {
    if (!opts.onProgress) return;
    const sum = perProfileProgress.reduce((a, b) => a + b, 0);
    opts.onProgress(sum / profiles.length);
  };
  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];
    try {
      const result = await renderTimeline(timeline, sources, {
        ...opts,
        platformProfile: profile,
        onProgress: (p) => {
          perProfileProgress[i] = p;
          aggregateProgress();
        },
      });
      results.push({ ok: true, profile, result });
      opts.onProfileComplete?.(i, { ok: true, result });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      results.push({ ok: false, profile, error });
      opts.onProfileComplete?.(i, { ok: false, error });
    }
    // Force per-profile progress to 1 in case the strategy didn't tick
    // it (graceful pause-on-error path).
    perProfileProgress[i] = 1;
    aggregateProgress();
  }
  return { results };
}

/**
 * Convenience predicate for the editor — when the export button should be
 * enabled. Re-exports isRenderable so editor code has one import path
 * for everything render-related.
 */
export { isRenderable, pickRenderEngine };
