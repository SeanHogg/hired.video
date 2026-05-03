/**
 * Timeline render facade.
 *
 * The single entry point every editor surface uses to turn a Timeline
 * into an MP4 Blob. Per the standing DRY rule, callers MUST NOT branch
 * on which engine to use — this module owns that decision via
 * pickRenderEngine() from shared/timeline.ts.
 *
 * Two engines today:
 *   - WebCodecs:   fast path for 1080p H.264 with simple transitions and
 *                  no per-clip effects. Existing logic in
 *                  frontend/lib/renderer/video-exporter.ts will be
 *                  ported into webcodecs-render.ts to consume the
 *                  Timeline spec directly (rather than the legacy
 *                  CompiledVideo shape).
 *   - ffmpeg.wasm: everything else — color grading, masks, ProRes, 4K.
 *                  Lazy-loaded via dynamic import so a casual user
 *                  doing a simple H.264 export never downloads ffmpeg.
 *
 * Both engines implement the RenderStrategy interface below. New
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

export interface RenderOptions {
  /** Called periodically with progress 0..1. Render runs to completion regardless. */
  onProgress?: (progress: number) => void;
  /** Aborts the render if signalled. Engine throws AbortError on the next checkpoint. */
  signal?: AbortSignal;
  /** When provided, the engine logs RenderJob updates here so the editor can update its UI. */
  onJobUpdate?: (job: RenderJob) => void;
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
  const engineId = pickRenderEngine(timeline);
  const strategy = await loadStrategy(engineId);
  const available = await strategy.isAvailable();
  if (!available) {
    throw new Error(`Render engine '${engineId}' is not available in this browser.`);
  }
  return strategy.render(timeline, sources, opts);
}

/**
 * Convenience predicate for the editor — when the export button should be
 * enabled. Re-exports isRenderable so editor code has one import path
 * for everything render-related.
 */
export { isRenderable, pickRenderEngine };
