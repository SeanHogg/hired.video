// video-exporter.ts — exports a CompiledVideo to a Blob.
//
// Strategy:
//   1. If VideoEncoder + mp4-muxer available → WebCodecs H.264 → MP4
//   2. Fallback → MediaRecorder with captureStream(30) → WebM
//
// The caller receives progress callbacks (0–1) and a final Blob.

import type { CompiledVideo } from "../compiler/types";
import { renderFrame } from "./frame-renderer";

export interface ExportOptions {
  onProgress?: (progress: number) => void;
  videoBitsPerSecond?: number;
}

// ─── WebCodecs export ─────────────────────────────────────────────────────────

async function exportWebCodecs(
  compiledVideo: CompiledVideo,
  opts: ExportOptions,
): Promise<Blob> {
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");

  const { width, height, fps, totalDuration } = compiledVideo;
  const totalFrames = Math.ceil(totalDuration * fps);
  const target = new ArrayBufferTarget();

  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width,
      height,
    },
    fastStart: "in-memory",
  });

  const encoder = new VideoEncoder({
    output(chunk, meta) {
      muxer.addVideoChunk(chunk, meta ?? undefined);
    },
    error(e) {
      throw e;
    },
  });

  encoder.configure({
    codec: "avc1.42E01E",
    width,
    height,
    bitrate: opts.videoBitsPerSecond ?? (height >= 1080 ? 4_000_000 : 2_000_000),
    framerate: fps,
  });

  const canvas = new OffscreenCanvas(width, height);

  for (let frame = 0; frame < totalFrames; frame++) {
    const time = frame / fps;
    renderFrame(canvas as unknown as HTMLCanvasElement, compiledVideo, time);

    const bitmap = canvas.transferToImageBitmap();
    const videoFrame = new VideoFrame(bitmap, {
      timestamp: Math.round((time * 1_000_000)),
      duration: Math.round(1_000_000 / fps),
    });
    bitmap.close();

    const isKey = frame % (fps * 2) === 0; // keyframe every 2s
    encoder.encode(videoFrame, { keyFrame: isKey });
    videoFrame.close();

    opts.onProgress?.(frame / totalFrames);

    // Yield to event loop periodically
    if (frame % 30 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  await encoder.flush();
  muxer.finalize();

  opts.onProgress?.(1);
  return new Blob([target.buffer], { type: "video/mp4" });
}

// ─── MediaRecorder fallback ───────────────────────────────────────────────────

async function exportMediaRecorder(
  compiledVideo: CompiledVideo,
  opts: ExportOptions,
): Promise<Blob> {
  const { width, height, fps, totalDuration } = compiledVideo;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const stream = (canvas as unknown as { captureStream(fps: number): MediaStream }).captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp9",
    videoBitsPerSecond: opts.videoBitsPerSecond ?? 2_000_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  recorder.start(1000 / fps);

  const frameDuration = 1000 / fps;
  let frame = 0;
  const totalFrames = Math.ceil(totalDuration * fps);

  await new Promise<void>((resolve) => {
    function next() {
      if (frame >= totalFrames) {
        recorder.stop();
        resolve();
        return;
      }
      const time = frame / fps;
      renderFrame(canvas, compiledVideo, time);
      opts.onProgress?.(frame / totalFrames);
      frame++;
      setTimeout(next, frameDuration);
    }
    next();
  });

  await new Promise<void>((r) => { recorder.onstop = () => r(); });
  opts.onProgress?.(1);
  return new Blob(chunks, { type: "video/webm" });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function exportVideo(
  compiledVideo: CompiledVideo,
  opts: ExportOptions = {},
): Promise<Blob> {
  if (
    typeof VideoEncoder !== "undefined" &&
    typeof OffscreenCanvas !== "undefined"
  ) {
    try {
      return await exportWebCodecs(compiledVideo, opts);
    } catch (e) {
      console.warn("[video-exporter] WebCodecs failed, falling back to MediaRecorder", e);
    }
  }
  return exportMediaRecorder(compiledVideo, opts);
}
