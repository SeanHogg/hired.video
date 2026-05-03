/**
 * ffmpeg.wasm render strategy.
 *
 * Handles every Timeline that pickRenderEngine() classifies as needing
 * the heavy path: per-clip effects, masks, color grading, ProRes/DNxHR
 * export, 4K, complex transitions beyond cross-dissolve.
 *
 * Loaded lazily via dynamic import so the casual fast path
 * (WebCodecs-handled simple H.264) never pulls the ~30 MB ffmpeg.wasm
 * core into the bundle.
 *
 * STATUS (2026-05-03): SKELETON ONLY. The dispatch + availability gate
 * is wired so the facade can route to this engine, but the actual
 * compositing pipeline (per-frame canvas → ffmpeg input → encoded MP4)
 * is the meat of NLE M1 work and lives in a follow-up commit. The
 * skeleton throws a clearly-labelled error rather than silently
 * producing the wrong output.
 *
 * When the implementation lands, it follows this rough shape:
 *
 *   1. createFFmpeg() → load core + WASM blob (cached in IndexedDB
 *      across sessions so the 30 MB load is one-time).
 *   2. For each frame index 0..durationFrames-1: composite tracks via
 *      OffscreenCanvas, push frame as raw rgba to ffmpeg's MEMFS.
 *   3. Mux per-track audio sources via ffmpeg directly (filter_complex
 *      with amix), produce final MP4.
 *   4. Read the output MEMFS file → return as Blob.
 */

import type { RenderStrategy } from "./render";

export const ffmpegWasmStrategy: RenderStrategy = {
  id: "ffmpeg-wasm",

  async isAvailable() {
    // ffmpeg.wasm needs a SharedArrayBuffer-capable context, which means
    // the page must be served with COOP/COEP headers (cross-origin
    // isolation). We probe rather than assume — a missing header would
    // make import succeed but instantiation fail.
    if (typeof crossOriginIsolated !== "undefined" && !crossOriginIsolated) {
      return false;
    }
    if (typeof SharedArrayBuffer === "undefined") return false;
    return true;
  },

  async render(_timeline, _sources, _opts) {
    throw new Error(
      "ffmpeg.wasm render strategy is not yet implemented. " +
      "This Timeline requires the heavy path (effects/masks/4K/ProRes) " +
      "but the compositing pipeline is in development. " +
      "For an unblocking export, simplify the Timeline to fit the " +
      "WebCodecs fast path (1080p, no per-clip effects, only " +
      "cut/cross-dissolve transitions).",
    );
  },
};
