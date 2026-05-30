/**
 * Animation export pipeline — turns an `AnimationState` into a Blob in
 * the requested OutputProfile's container/codec. Closes Consolidated
 * Gap Register #1004.
 *
 * Per the existing render-facade pattern (see `lib/timeline/render.ts`)
 * the dispatch happens on the OutputProfile id. Animation-kind profiles:
 *
 *   - `animation-gif`       → GIF89a via in-tree `gif89a-encoder.ts`
 *                              (full implementation — palette quantizer
 *                              + LZW compression, no third-party deps);
 *                              rasterise + encode runs in a Worker
 *                              (#1025).
 *   - `animation-apng`      → in-tree `apng-encoder.ts`; rasterise +
 *                              encode runs in a Worker (#1025).
 *   - `animation-webp`      → MediaRecorder/WebM fallback (animated
 *                              WebP encoder logged as #1004 follow-on)
 *   - `animation-mp4-alpha` → WebM/VP9 alpha via MediaRecorder (the
 *                              `animation-mp4-alpha` profile's `mp4`
 *                              container is misleading — see #1004
 *                              note; we emit WebM with alpha which is
 *                              what browsers actually support today)
 *
 * Worker offload (#1025): the GIF89a + APNG paths post the frame inputs
 * + per-frame timing to `workers/animation-encode.worker.ts`. The
 * worker rasterises each frame's pixelsDataUrl via OffscreenCanvas +
 * createImageBitmap, runs the encoder, and transfers the byte stream
 * back. Main-thread fallback path remains for environments that lack
 * Worker / OffscreenCanvas (SSR, headless test runners).
 *
 * Frame compositing: each frame's `pixelsDataUrl` is decoded onto an
 * OffscreenCanvas at the project's dimensions; the project background
 * is painted FIRST so transparent areas in a frame's PNG composite
 * over the project's background color (matches the editor's preview).
 */

import {
  type AnimationState,
  totalDurationSec,
} from "@shared/animation-state";
import type { OutputProfile } from "@shared/media-kinds";
import { encodeGif, type GifFrameInput } from "./gif89a-encoder";
import { encodeApng, type ApngFrame } from "./apng-encoder";
import { toBlobPart } from "../bytes/to-blob-part";

interface WorkerEncodeRequest {
  type: "encode";
  profileId: "animation-gif" | "animation-apng";
  width: number;
  height: number;
  fps: number;
  loopCount?: number;
  background: AnimationState["background"];
  frames: Array<{ pixelsDataUrl: string | null; delayHundredths: number; delayMs: number }>;
}
interface WorkerDoneMessage  { type: "done";  bytes: ArrayBuffer; mime: string }
interface WorkerErrorMessage { type: "error"; message: string }
type WorkerOut = WorkerDoneMessage | WorkerErrorMessage;

function canUseEncoderWorker(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap === "function"
  );
}

async function encodeViaWorker(req: WorkerEncodeRequest): Promise<{ bytes: Uint8Array; mime: string }> {
  const worker = new Worker(
    new URL("../../../workers/animation-encode.worker.ts", import.meta.url),
    { type: "module" },
  );
  try {
    return await new Promise<{ bytes: Uint8Array; mime: string }>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WorkerOut>) => {
        if (e.data.type === "done") {
          resolve({ bytes: new Uint8Array(e.data.bytes), mime: e.data.mime });
        } else if (e.data.type === "error") {
          reject(new Error(e.data.message));
        }
      };
      worker.onerror = (err) => reject(new Error(err.message || "animation worker error"));
      worker.postMessage(req);
    });
  } finally {
    worker.terminate();
  }
}

/** Resolve each frame's pixel buffer at the project's dimensions.
 *  Frames carry their pixels as PNG dataURLs; we decode each via an
 *  Image and rasterise to an OffscreenCanvas so the encoder gets raw
 *  RGBA. Background fill is painted FIRST so transparent regions in a
 *  frame composite correctly over the project's bg color. */
async function rasteriseFrames(state: AnimationState): Promise<Uint8ClampedArray[]> {
  const { width, height, background, frames } = state;
  const out: Uint8ClampedArray[] = [];
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("rasteriseFrames: no 2D context");

  for (const frame of frames) {
    // Background fill (color or transparent leaves alpha=0).
    ctx.clearRect(0, 0, width, height);
    if (background.kind === "color") {
      ctx.fillStyle = background.color;
      ctx.fillRect(0, 0, width, height);
    }
    if (frame.pixelsDataUrl) {
      const img = await loadImageFromDataUrl(frame.pixelsDataUrl);
      ctx.drawImage(img, 0, 0, width, height);
    }
    const data = ctx.getImageData(0, 0, width, height).data;
    out.push(data);
  }
  return out;
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement | ImageBitmap> {
  // ImageBitmap is the universal path on modern browsers — works in
  // both window AND worker contexts. fetch the dataURL into a blob
  // and decode via createImageBitmap.
  return fetch(dataUrl)
    .then((r) => r.blob())
    .then((b) => createImageBitmap(b));
}

/** Per-frame delay in 100ths of a second, honouring the frame's hold
 *  count + the project's fps. The GIF spec rounds; very fast
 *  animations (>50fps) compress to a single hundredth. */
function frameDelayHundredths(fps: number, hold: number | undefined): number {
  const ticks = Math.max(1, hold ?? 1);
  const ms = (1000 / Math.max(1, fps)) * ticks;
  return Math.max(1, Math.round(ms / 10));
}

export interface AnimationRenderResult {
  blob: Blob;
  /** Total animation duration in seconds — useful for analytics + UI. */
  durationSec: number;
}

/** Single dispatch — picks the strategy by profile id. */
export async function renderAnimation(
  state: AnimationState,
  profile: OutputProfile,
): Promise<AnimationRenderResult> {
  if (profile.mediaKind !== "animation") {
    throw new Error(`renderAnimation: profile is not animation-kind: ${profile.id}`);
  }

  if (profile.id === "animation-gif" || profile.id === "animation-apng") {
    // #1025 — GIF + APNG paths offload rasterise + encode to a Worker
    // so the UI stays responsive during long renders. Falls back to
    // the in-process path when Worker / OffscreenCanvas aren't
    // available (SSR, headless test runners).
    if (canUseEncoderWorker()) {
      const { bytes, mime } = await encodeViaWorker({
        type: "encode",
        profileId: profile.id,
        width: state.width,
        height: state.height,
        fps: state.fps,
        loopCount: state.loopCount,
        background: state.background,
        frames: state.frames.map((f) => ({
          pixelsDataUrl: f.pixelsDataUrl ?? null,
          delayHundredths: frameDelayHundredths(state.fps, f.hold),
          delayMs: Math.max(
            1,
            Math.round((1000 / Math.max(1, state.fps)) * Math.max(1, f.hold ?? 1)),
          ),
        })),
      });
      return {
        blob: new Blob([toBlobPart(bytes)], { type: mime }),
        durationSec: totalDurationSec(state),
      };
    }
  }

  const frames = await rasteriseFrames(state);
  const frameInputs: GifFrameInput[] = state.frames.map((f, i) => ({
    pixels: frames[i],
    width: state.width,
    height: state.height,
    delayHundredths: frameDelayHundredths(state.fps, f.hold),
  }));

  switch (profile.id) {
    case "animation-gif": {
      const bytes = encodeGif(frameInputs, {
        width: state.width,
        height: state.height,
        loopCount: state.loopCount,
      });
      return {
        blob: new Blob([toBlobPart(bytes)], { type: "image/gif" }),
        durationSec: totalDurationSec(state),
      };
    }
    case "animation-apng": {
      const apngFrames: ApngFrame[] = state.frames.map((f, i) => ({
        pixels: frames[i],
        width: state.width,
        height: state.height,
        delayMs: Math.max(1, Math.round((1000 / Math.max(1, state.fps)) * Math.max(1, f.hold ?? 1))),
      }));
      const bytes = encodeApng(apngFrames, { loopCount: state.loopCount ?? 0 });
      return {
        blob: new Blob([toBlobPart(bytes)], { type: "image/apng" }),
        durationSec: totalDurationSec(state),
      };
    }
    case "animation-webp":
    case "animation-mp4-alpha": {
      // Browser-native animated-WebP / animated-alpha-video encoders
      // aren't reliably available client-side. We fall back to a WebM
      // recording of the canvas via MediaRecorder, which works in
      // every modern browser. MediaRecorder needs a DOM canvas +
      // captureStream, so this path stays on the main thread.
      const bytes = await encodeViaMediaRecorder(state, frameInputs, profile);
      return {
        blob: new Blob([toBlobPart(bytes)], { type: profile.mime }),
        durationSec: totalDurationSec(state),
      };
    }
    default:
      throw new Error(`renderAnimation: unknown profile id ${profile.id}`);
  }
}

/** MediaRecorder-based fallback encoder — captures the canvas frame
 *  by frame at the project's fps and packs the result as WebM. Used
 *  for animated-WebP and transparent-MP4 profiles whose proper
 *  encoders aren't shipped in the MVP (logged as #1004 follow-on). */
async function encodeViaMediaRecorder(
  state: AnimationState,
  frames: GifFrameInput[],
  _profile: OutputProfile,
): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = state.width;
  canvas.height = state.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("encodeViaMediaRecorder: no 2D context");

  const stream = canvas.captureStream(state.fps);
  const recorder = new MediaRecorder(stream, {
    mimeType: pickRecorderMime(),
    videoBitsPerSecond: 2_500_000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start();

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const img = ctx.createImageData(state.width, state.height);
    img.data.set(f.pixels);
    ctx.putImageData(img, 0, 0);
    // Hold the frame for its delay before advancing.
    const ms = f.delayHundredths * 10;
    await sleep(ms);
  }
  recorder.stop();
  await done;
  const blob = new Blob(chunks);
  return new Uint8Array(await blob.arrayBuffer());
}

function pickRecorderMime(): string {
  // Pick the first MediaRecorder mime the current browser supports.
  // VP9 with alpha is the closest thing browsers expose to animated
  // transparent output today.
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      // older browsers without isTypeSupported — fall through
    }
  }
  return "video/webm";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
