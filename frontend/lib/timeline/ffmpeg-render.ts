/**
 * ffmpeg.wasm render strategy — the ProRes / DNxHD (and complex-transition)
 * path pickRenderEngine() routes here.
 *
 *   1. Preflight: the encoding for the codec + size (encode-args), and a
 *      memory check so an over-long master fails up front, in words.
 *   2. Audio: the same mix the WebCodecs engine encodes (frame-producer),
 *      handed to ffmpeg as a float WAV → 24-bit PCM in MOV.
 *   3. Load ffmpeg.wasm lazily (ffmpeg-loader — needs cross-origin isolation).
 *   4. Frames: the shared frame producer paints each frame exactly as the
 *      WebCodecs engine does; this engine reads it back as raw RGBA and the
 *      segmented pipeline encodes + muxes it (encode-pipeline).
 *
 * ProRes / DNxHD are DOWNLOAD formats: posting / upload always renders H.264
 * MP4 (shared/timeline `timelineForPosting`, applied in publish-render).
 */
import type { RenderResult, RenderStrategy } from "./render";
import { mixTimelineAudio, readCanvasRgba, throwIfAborted, withFrameProducer } from "./frame-producer";
import { ffmpegEncodingFor, maxEncodableSeconds } from "./ffmpeg/encode-args";
import { codecLabel, encodeFramesWithFfmpeg } from "./ffmpeg/encode-pipeline";
import { FfmpegRenderError } from "./ffmpeg/errors";
import { loadFfmpeg } from "./ffmpeg/ffmpeg-loader";
import { audioBufferToWav } from "./ffmpeg/wav";
import { timelineDurationFrames } from "@shared/timeline";

export const ffmpegWasmStrategy: RenderStrategy = {
  id: "ffmpeg-wasm",

  // Isolation is checked in render() so the owner gets the localized
  // "needs cross-origin isolation" message rather than the facade's
  // generic "engine not available".
  async isAvailable() {
    return typeof OffscreenCanvas !== "undefined";
  },

  async render(timeline, sources, opts) {
    const { width, height, fps } = timeline;
    const totalFrames = timelineDurationFrames(timeline);
    if (totalFrames <= 0) throw new Error("Timeline has no content to render");
    const durationSeconds = totalFrames / fps;

    const encoding = ffmpegEncodingFor(timeline.exportCodec, width, height, fps);
    const maxSeconds = maxEncodableSeconds(encoding);
    if (durationSeconds > maxSeconds) {
      throw new FfmpegRenderError("TOO_LONG", { codec: codecLabel(encoding.codec), width, height, maxSeconds });
    }

    const audio = await mixTimelineAudio(timeline, sources, opts.resolveNestedTimeline);
    throwIfAborted(opts.signal);
    const ffmpeg = await loadFfmpeg();
    try {
      return await withFrameProducer(
        timeline,
        sources,
        { resolveNestedTimeline: opts.resolveNestedTimeline, includeBranding: opts.includeBranding, signal: opts.signal },
        async (producer) => {
          const blob = await encodeFramesWithFfmpeg({
            ffmpeg,
            encoding,
            width,
            height,
            fps,
            totalFrames,
            readFrame: async (frame) => readCanvasRgba(await producer.paint(frame)),
            audioWav: audio ? audioBufferToWav(audio) : null,
            signal: opts.signal,
            onProgress: (v) => opts.onProgress?.(v),
          });
          opts.onProgress?.(1);
          return { blob, mime: encoding.mime, durationSeconds, engine: "ffmpeg-wasm" } satisfies RenderResult;
        },
      );
    } finally {
      ffmpeg.terminate();
    }
  },
};
