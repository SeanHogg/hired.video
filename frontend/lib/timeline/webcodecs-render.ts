/// <reference types="dom-webcodecs" />
/**
 * WebCodecs render strategy — the fast path.
 *
 * Handles Timelines pickRenderEngine() classifies as simple: up to 4K,
 * only cut/cross-dissolve transitions, an H.264 / HEVC / VP9 export codec
 * (export-codec.ts picks the encoder settings; all mux into MP4).
 *
 * Pipeline:
 *   1. The shared frame producer (frame-producer.ts — also used by the
 *      ffmpeg.wasm engine) warms <video>/<image> elements for every source
 *      referenced by the timeline and paints each frame.
 *   2. Spawn the render-encode worker; encode + mux happen entirely
 *      off the main thread.
 *   3. For each frame index 0..durationFrames-1:
 *        - producer.paint() composites onto an OffscreenCanvas
 *          (main thread — HTMLVideoElement seek requires DOM access)
 *        - transferToImageBitmap() then postMessage(..., [bitmap])
 *          ships the frame to the worker as a transferable
 *   4. Audio mix → planar Float32 → worker encodes AAC
 *   5. Worker flushes, finalizes, posts back the MP4 ArrayBuffer
 *
 * Note on the triple-slash reference above: TypeScript 5.5 does not yet
 * include WebCodecs Audio types (`AudioEncoder`, `AudioData`,
 * `EncodedAudioChunk`) in lib.dom.d.ts — those landed in TS 5.6. The
 * `@types/dom-webcodecs` package supplies them, but its package.json
 * has `nonNpm: true` + empty `main`, so it is not auto-included by tsc.
 * The reference forces the resolution. Remove this once we upgrade to
 * TS ≥ 5.6 and confirm `tsc --noEmit` is clean.
 */

import {
  timelineDurationFrames,
  type MediaSource,
  type Timeline,
} from "@shared/timeline";
import { mixTimelineAudio, withFrameProducer } from "./frame-producer";
import type { RenderResult, RenderStrategy } from "./render";
import { webcodecsVideoCodec, type WebcodecsVideoCodec } from "./export-codec";

/** Fail early, in words, when this browser can't encode the chosen codec at
 *  this size (HEVC and 4K support vary by browser and hardware). */
async function assertEncodable(video: WebcodecsVideoCodec, width: number, height: number, fps: number): Promise<void> {
  if (typeof VideoEncoder.isConfigSupported !== "function") return;
  const { supported } = await VideoEncoder.isConfigSupported({ codec: video.codec, width, height, bitrate: video.bitrate, framerate: fps });
  if (!supported) {
    throw new Error(
      `This browser can't encode ${video.muxer.toUpperCase()} video at ${width}×${height}. ` +
        "Choose H.264 or a lower resolution in Export and try again.",
    );
  }
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
    const { width, height, fps } = timeline;
    const totalFrames = timelineDurationFrames(timeline);
    if (totalFrames <= 0) {
      throw new Error("Timeline has no content to render");
    }
    // The owner's export codec (Timeline.exportCodec, absent = H.264).
    const video = webcodecsVideoCodec(timeline.exportCodec, width, height);
    await assertEncodable(video, width, height, fps);

    // Audio mix on the main thread (OfflineAudioContext), shared with the
    // ffmpeg.wasm engine via frame-producer.
    const audioBuffer = await mixTimelineAudio(timeline, sources, opts.resolveNestedTimeline);

    // Frames come from the shared producer (same compositor, abort
    // checkpoint and branding as ffmpeg.wasm); this engine ships each
    // painted canvas to the encode worker as a transferable ImageBitmap.
    return withFrameProducer(
      timeline,
      sources,
      { resolveNestedTimeline: opts.resolveNestedTimeline, includeBranding: opts.includeBranding, signal: opts.signal },
      async (producer) => {
        const blob = await runEncodeWorker({
          width,
          height,
          fps,
          totalFrames,
          videoCodec: video.codec,
          muxerCodec: video.muxer,
          videoBitrate: video.bitrate,
          audioBuffer,
          renderFrame: async (frame) => (await producer.paint(frame)).transferToImageBitmap(),
          onProgress: (v) => opts.onProgress?.(v),
        });
        opts.onProgress?.(1);
        return {
          blob,
          mime: "video/mp4",
          durationSeconds: totalFrames / fps,
          engine: "webcodecs",
        } satisfies RenderResult;
      },
    );
  },
};

/**
 * Drive the render-encode worker for one render: spin it up, ship
 * frames + audio, await the final MP4. The compose loop yields to the
 * event loop every 30 frames so the editor UI stays responsive on
 * slow machines (the worker handles encode/mux off-thread, but
 * compositing still runs on main because HTMLVideoElement seeks
 * require DOM access).
 */
async function runEncodeWorker(args: {
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  videoCodec: string;
  muxerCodec: WebcodecsVideoCodec["muxer"];
  videoBitrate: number;
  audioBuffer: AudioBuffer | null;
  renderFrame: (frame: number) => Promise<ImageBitmap>;
  onProgress?: (v: number) => void;
}): Promise<Blob> {
  // Backpressure between the compositor (here) and the encoder (worker).
  // The compose loop below ships frames as fast as it can composite them;
  // a source-less or fast-seeking timeline can outrun a software AVC
  // encoder by orders of magnitude, growing the encoder's queue of
  // multi-MB VideoFrames without bound until the renderer OOM-crashes
  // (surfaces as `worker.onerror` → "render worker crashed", preceded by
  // the tab's chrome-error page + a WebAudio device error as the process
  // dies). We cap in-flight frames: pause producing once the worker's
  // reported queue depth hits HIGH_WATER, resume once it drains to
  // LOW_WATER. Bounds peak memory to ~a dozen frames regardless of
  // timeline length or encoder speed.
  const HIGH_WATER = 12;
  const LOW_WATER = 6;
  const worker = new Worker(
    new URL("../../workers/render-encode.worker.ts", import.meta.url),
    { type: "module" },
  );
  return new Promise<Blob>((resolve, reject) => {
    let finished = false;
    // Latest encoder queue depth the worker has reported. The compose
    // loop optimistically bumps this on each send and the worker corrects
    // it on every admit/drain, so it never under-reports the backlog.
    let queueDepth = 0;
    let drainWaiter: (() => void) | null = null;
    const wakeDrainWaiter = () => {
      if (drainWaiter) {
        const w = drainWaiter;
        drainWaiter = null;
        w();
      }
    };
    const cleanup = () => {
      finished = true;
      // Unblock the compose loop if it's parked on the backpressure gate,
      // so it observes `finished` and exits instead of hanging forever.
      wakeDrainWaiter();
      worker.terminate();
    };
    worker.onerror = (err) => {
      if (finished) return;
      cleanup();
      reject(err.error ?? new Error("render worker crashed"));
    };
    worker.onmessage = async (e: MessageEvent<{
      type: "progress" | "done" | "error" | "queue";
      value?: number;
      size?: number;
      buffer?: ArrayBuffer;
      mime?: string;
      message?: string;
    }>) => {
      const msg = e.data;
      if (msg.type === "queue" && typeof msg.size === "number") {
        queueDepth = msg.size;
        if (queueDepth <= LOW_WATER) wakeDrainWaiter();
      } else if (msg.type === "progress" && typeof msg.value === "number") {
        // Worker reports 0..0.97 across encode + flush; main thread
        // owns the final 0.97..1 in the strategy.
        args.onProgress?.(Math.min(0.97, msg.value));
      } else if (msg.type === "done" && msg.buffer && msg.mime) {
        cleanup();
        resolve(new Blob([msg.buffer], { type: msg.mime }));
      } else if (msg.type === "error") {
        cleanup();
        reject(new Error(msg.message ?? "render worker failed"));
      }
    };

    // Init
    worker.postMessage({
      type: "init",
      config: {
        width: args.width,
        height: args.height,
        fps: args.fps,
        totalFrames: args.totalFrames,
        videoCodec: args.videoCodec,
        muxerCodec: args.muxerCodec,
        videoBitrate: args.videoBitrate,
        audio: args.audioBuffer
          ? {
              numberOfChannels: args.audioBuffer.numberOfChannels,
              sampleRate: args.audioBuffer.sampleRate,
            }
          : null,
      },
    });

    // Compose + ship frames. We don't await the worker between frames —
    // the worker queues them in its VideoEncoder; we only yield to the
    // UI thread every 30 frames so React can paint.
    (async () => {
      try {
        for (let frame = 0; frame < args.totalFrames; frame++) {
          if (finished) return;
          // Backpressure gate: if the encoder backlog is at the high-water
          // mark, stop compositing until the worker reports it has drained
          // to LOW_WATER. Keeps in-flight VideoFrame memory bounded so a
          // fast-compositing timeline can't OOM the renderer.
          if (queueDepth >= HIGH_WATER) {
            await new Promise<void>((r) => { drainWaiter = r; });
            if (finished) return;
          }
          const bitmap = await args.renderFrame(frame);
          worker.postMessage({ type: "frame", bitmap, frameIndex: frame }, [bitmap]);
          // Optimistic bump — the worker's authoritative `queue` report
          // corrects this, but counting the send immediately means a burst
          // of fast composites trips the gate before any reply arrives.
          queueDepth++;
          if (frame % 30 === 0) {
            args.onProgress?.((frame / args.totalFrames) * 0.8);
            await new Promise((r) => setTimeout(r, 0));
          }
        }
        if (args.audioBuffer) {
          const flat = audioBufferToFlatPlanar(args.audioBuffer);
          worker.postMessage(
            {
              type: "audio",
              planar: flat,
              numberOfFrames: args.audioBuffer.length,
              numberOfChannels: args.audioBuffer.numberOfChannels,
              sampleRate: args.audioBuffer.sampleRate,
            },
            [flat.buffer],
          );
        }
        worker.postMessage({ type: "finish" });
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  });
}

/**
 * Concatenate every channel of an AudioBuffer into one Float32Array
 * (`[ch0 samples..., ch1 samples..., ...]`) so it can be transferred
 * to the worker in a single postMessage. Single source of truth for
 * the on-wire shape — both the worker and the strategy agree on it.
 */
function audioBufferToFlatPlanar(buf: AudioBuffer): Float32Array {
  const out = new Float32Array(buf.length * buf.numberOfChannels);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    out.set(buf.getChannelData(ch), ch * buf.length);
  }
  return out;
}

