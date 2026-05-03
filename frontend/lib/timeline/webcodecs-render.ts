/**
 * WebCodecs render strategy — the fast path.
 *
 * Handles Timelines pickRenderEngine() classifies as simple: 1080p or
 * smaller, only cut/cross-dissolve transitions, no per-clip effects.
 *
 * Pipeline:
 *   1. preloadSources() warms <video>/<image> elements for every source
 *      referenced by the timeline.
 *   2. For each frame index 0..durationFrames-1:
 *        - renderTimelineFrame() composites onto an OffscreenCanvas
 *        - encoder.encode(VideoFrame, { keyFrame: every 2s })
 *        - mp4-muxer adds the chunk
 *   3. encoder.flush() + muxer.finalize() → MP4 Blob
 *
 * Video-only as of M1. Audio mixing through an AudioContext + AAC
 * encoder ships in a follow-up commit; for now an exported MP4 has
 * silent audio. ffmpeg-wasm strategy will produce audio sooner since
 * it gets ffmpeg's filter_complex for free.
 */

import {
  timelineDurationFrames,
  type MediaSource,
  type Timeline,
} from "@shared/timeline";
import {
  createRendererState,
  disposeRendererState,
  preloadSources,
  renderTimelineFrame,
} from "./frame-renderer";
import type { RenderResult, RenderStrategy } from "./render";

/** Pick an AVC profile/level codec string based on output resolution. */
function avcCodecFor(height: number): string {
  if (height >= 1080) return "avc1.640028"; // High 4.0
  if (height >= 720) return "avc1.4D001F"; // Main 3.1
  return "avc1.42E01E"; // Baseline 3.0
}

function bitrateFor(height: number): number {
  if (height >= 1080) return 4_000_000;
  if (height >= 720) return 2_500_000;
  return 1_500_000;
}

export const webcodecsStrategy: RenderStrategy = {
  id: "webcodecs",

  async isAvailable() {
    return (
      typeof VideoEncoder !== "undefined" &&
      typeof OffscreenCanvas !== "undefined"
    );
  },

  async render(timeline: Timeline, sources: Record<string, MediaSource>, opts) {
    const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
    const { width, height, fps } = timeline;
    const totalFrames = timelineDurationFrames(timeline);
    if (totalFrames <= 0) {
      throw new Error("Timeline has no content to render");
    }

    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: "avc", width, height },
      fastStart: "in-memory",
    });

    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta ?? undefined),
      error: (e) => {
        // Surface encoder errors instead of silently dropping frames —
        // the upstream catch in render() turns this into a toast.
        throw e;
      },
    });
    encoder.configure({
      codec: avcCodecFor(height),
      width,
      height,
      bitrate: bitrateFor(height),
      framerate: fps,
    });

    const canvas = new OffscreenCanvas(width, height);
    const state = createRendererState(sources);

    try {
      await preloadSources(timeline, state);

      for (let frame = 0; frame < totalFrames; frame++) {
        if (opts.signal?.aborted) {
          throw new DOMException("Render aborted", "AbortError");
        }
        await renderTimelineFrame(canvas, timeline, state, frame);
        const bitmap = canvas.transferToImageBitmap();
        const videoFrame = new VideoFrame(bitmap, {
          timestamp: Math.round((frame / fps) * 1_000_000),
          duration: Math.round(1_000_000 / fps),
        });
        try {
          encoder.encode(videoFrame, { keyFrame: frame % (fps * 2) === 0 });
        } finally {
          videoFrame.close();
        }

        // Progress: 0–80% during encode, the remaining 20% is flush + finalize.
        opts.onProgress?.((frame / totalFrames) * 0.8);

        // Yield to the event loop periodically so the editor stays
        // responsive on slow machines.
        if (frame % 30 === 0) await new Promise((r) => setTimeout(r, 0));
      }

      opts.onProgress?.(0.82);
      await encoder.flush();
      opts.onProgress?.(0.92);
      muxer.finalize();
      opts.onProgress?.(0.97);

      const blob = new Blob([target.buffer], { type: "video/mp4" });
      opts.onProgress?.(1);

      const result: RenderResult = {
        blob,
        mime: "video/mp4",
        durationSeconds: totalFrames / fps,
        engine: "webcodecs",
      };
      return result;
    } finally {
      disposeRendererState(state);
    }
  },
};
