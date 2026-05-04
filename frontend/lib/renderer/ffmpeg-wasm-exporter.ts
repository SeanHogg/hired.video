/**
 * ffmpeg.wasm exporter — the codec path beyond H.264.
 *
 * Routes from `video-exporter.ts` when `compiledVideo.codec` is non-
 * default (h265 / prores / dnxhd / vp9). Loaded lazily via dynamic
 * CDN ESM import so the casual H.264 fast path NEVER pulls the
 * ~30 MB ffmpeg core into the bundle. Pattern matches the rest of
 * the codebase (TTS engines, transformers.js).
 *
 * Pipeline:
 *   1. Load ffmpeg core from CDN (cached in IndexedDB after first run).
 *   2. For each frame index 0..totalFrames-1: render via the existing
 *      `renderFrame()` → push raw RGBA bytes into MEMFS.
 *   3. Run ffmpeg with `-f rawvideo -pix_fmt rgba` reading the byte
 *      stream, encoding to the chosen codec/container.
 *   4. Read the output file back as a Blob.
 *
 * Audio: for now, video-only. The audio mix path stays with the
 * existing MediaRecorder route — see the gap register for the audio-
 * pipe-through-ffmpeg follow-up.
 */

import type { CompiledVideo } from "../compiler/types";
import { renderFrame } from "./frame-renderer";
import { ffmpegArgsFor } from "./ffmpeg-args";

interface ExportOptions {
  onProgress?: (progress: number) => void;
}

/**
 * Export via ffmpeg.wasm. Composites frames on the main thread (the
 * scene compositor depends on DOM Image/Video elements that don't
 * exist in a Worker context) and ships the resulting raw-RGBA byte
 * stream to a Worker for the actual encode. The encode is the
 * dominant cost for ProRes / DNxHD / VP9, so off-loading it keeps
 * the UI responsive even on long renders.
 */
export async function exportFfmpegWasm(
  compiledVideo: CompiledVideo,
  opts: ExportOptions = {},
): Promise<Blob> {
  const { width, height, fps, totalDuration } = compiledVideo;
  const totalFrames = Math.ceil(totalDuration * fps);
  if (totalFrames <= 0) {
    throw new Error("Timeline has no content to render");
  }

  opts.onProgress?.(0);

  // ── Composite pass (main thread; needs DOM) ────────────────────────
  const canvas = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement("canvas"), { width, height });

  const frameSize = width * height * 4;
  const allBytes = new Uint8Array(frameSize * totalFrames);
  let writeOffset = 0;
  for (let frame = 0; frame < totalFrames; frame++) {
    const time = frame / fps;
    renderFrame(canvas as HTMLCanvasElement, compiledVideo, time);
    const ctx = (canvas as HTMLCanvasElement).getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) throw new Error("2D canvas context unavailable for ffmpeg export");
    const img = ctx.getImageData(0, 0, width, height);
    allBytes.set(new Uint8Array(img.data.buffer), writeOffset);
    writeOffset += frameSize;

    if (frame % 30 === 0) {
      // 0..0.5 reserved for compositing; 0.5..1 for encode in-worker.
      opts.onProgress?.(Math.min(0.5, (frame / totalFrames) * 0.5));
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // ── Encode pass (Worker) ───────────────────────────────────────────
  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(
      new URL("../../workers/ffmpeg-encode.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (e: MessageEvent<{ type: string; value?: number; bytes?: ArrayBuffer; mime?: string; message?: string }>) => {
      const msg = e.data;
      if (msg.type === "progress" && typeof msg.value === "number") {
        opts.onProgress?.(0.5 + msg.value * 0.5);
      } else if (msg.type === "done" && msg.bytes && msg.mime) {
        worker.terminate();
        opts.onProgress?.(1);
        resolve(new Blob([msg.bytes], { type: msg.mime }));
      } else if (msg.type === "error") {
        worker.terminate();
        reject(new Error(msg.message ?? "ffmpeg worker failed"));
      }
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(err.error ?? new Error("ffmpeg worker crashed"));
    };
    // Compute args via the shared helper so the worker doesn't have to
    // re-derive them — single source of truth.
    const args = ffmpegArgsFor({
      codec: compiledVideo.codec,
      container: compiledVideo.container,
      videoBitrate: compiledVideo.videoBitrate,
      audioBitrate: compiledVideo.audioBitrate,
    });
    worker.postMessage(
      {
        type: "encode",
        preset: {
          codec: compiledVideo.codec,
          container: compiledVideo.container,
          videoBitrate: compiledVideo.videoBitrate,
        },
        width,
        height,
        fps,
        framesRgba: allBytes,
      },
      [allBytes.buffer],
    );
    void args; // referenced for clarity; the worker re-derives via shared helper
  });
}
