/**
 * ffmpeg-encode worker — runs the ffmpeg.wasm encoder OFF the main
 * thread so long renders don't freeze the UI.
 *
 * Boundary: the main thread renders RGBA frames (via the existing
 * scene compositor, which depends on the DOM and can't move into a
 * Worker without a substantial refactor) and ships the raw byte
 * stream to this worker. The worker loads ffmpeg, writes the byte
 * stream into MEMFS, runs the encode, and posts the output bytes
 * back. The main thread re-wraps as a Blob.
 *
 * Per the standing DRY rule, the codec→ffmpeg-args mapping is
 * imported from the shared `ffmpeg-args` module so the in-process
 * exporter and this worker speak the same language.
 */

/// <reference lib="webworker" />

import { ffmpegArgsFor, type CodecPreset } from "../lib/renderer/ffmpeg-args";

interface FfmpegInstance {
  load(opts?: { coreURL?: string; wasmURL?: string }): Promise<boolean>;
  loaded: boolean;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  readFile(path: string): Promise<Uint8Array | string>;
  exec(args: string[]): Promise<number>;
  on(event: "progress", cb: (p: { progress: number; time: number }) => void): void;
}

interface FfmpegModule { FFmpeg: new () => FfmpegInstance }

interface EncodeRequest {
  type: "encode";
  preset: CodecPreset;
  width: number;
  height: number;
  fps: number;
  framesRgba: Uint8Array;
}

interface ProgressMessage { type: "progress"; value: number }
interface DoneMessage     { type: "done";     bytes: ArrayBuffer; mime: string }
interface ErrorMessage    { type: "error";    message: string }
type WorkerOut = ProgressMessage | DoneMessage | ErrorMessage;

let cachedFfmpeg: FfmpegInstance | null = null;

async function loadFfmpeg(): Promise<FfmpegInstance> {
  if (cachedFfmpeg && cachedFfmpeg.loaded) return cachedFfmpeg;
  const url = "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js";
  const mod: FfmpegModule = await (new Function("u", "return import(u)")(url));
  const ffmpeg = new mod.FFmpeg();
  await ffmpeg.load({
    coreURL: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js",
    wasmURL: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm",
  });
  cachedFfmpeg = ffmpeg;
  return ffmpeg;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<EncodeRequest>) => {
  const post = (msg: WorkerOut) => { ctx.postMessage(msg); };
  try {
    if (e.data.type !== "encode") return;
    const { preset, width, height, fps, framesRgba } = e.data;
    const ffmpeg = await loadFfmpeg();
    post({ type: "progress", value: 0.05 });
    await ffmpeg.writeFile("frames.rgba", framesRgba);
    post({ type: "progress", value: 0.15 });

    const { videoArg, outName, extraArgs, mime } = ffmpegArgsFor(preset);
    ffmpeg.on("progress", ({ progress }) => {
      // Reserve 0.15..0.95 for the encode pass.
      post({ type: "progress", value: 0.15 + Math.max(0, Math.min(1, progress)) * 0.8 });
    });

    const args = [
      "-f", "rawvideo",
      "-pix_fmt", "rgba",
      "-s", `${width}x${height}`,
      "-r", String(fps),
      "-i", "frames.rgba",
      "-c:v", videoArg,
      ...extraArgs,
      "-pix_fmt", videoArg === "prores_ks" ? "yuv422p10le" : "yuv420p",
      "-y", outName,
    ];
    const code = await ffmpeg.exec(args);
    if (code !== 0) {
      throw new Error(`ffmpeg exec returned ${code}`);
    }
    const data = await ffmpeg.readFile(outName);
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);
    post({ type: "progress", value: 1 });
    // Transfer the ArrayBuffer back instead of structurally cloning it —
    // saves a 100s-of-MB copy for long renders.
    ctx.postMessage({ type: "done", bytes: buf, mime } satisfies WorkerOut, [buf]);
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};

export {};
