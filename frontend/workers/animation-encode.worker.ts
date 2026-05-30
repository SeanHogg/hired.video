/**
 * animation-encode worker — runs the GIF89a / APNG rasterise + encode
 * pass OFF the main thread so long animation strips don't freeze the
 * editor UI (Consolidated Gap Register #1025).
 *
 * The MediaRecorder fallback for `animation-webp` / `animation-mp4-alpha`
 * profiles stays on the main thread because MediaRecorder needs a DOM
 * canvas + `captureStream()` — neither is available in a Worker
 * context. Per-profile dispatch lives in `renderAnimation()` in
 * `lib/studio/animation/animation-export.ts`.
 */

/// <reference lib="webworker" />

import { encodeGif, type GifFrameInput } from "../lib/studio/animation/gif89a-encoder";
import { encodeApng, type ApngFrame } from "../lib/studio/animation/apng-encoder";

interface EncodeRequest {
  type: "encode";
  profileId: "animation-gif" | "animation-apng";
  width: number;
  height: number;
  fps: number;
  loopCount?: number;
  background: { kind: "color"; color: string } | { kind: "transparent" };
  frames: Array<{ pixelsDataUrl: string | null; delayHundredths: number; delayMs: number }>;
}

interface DoneMessage  { type: "done";  bytes: ArrayBuffer; mime: string }
interface ErrorMessage { type: "error"; message: string }
type WorkerOut = DoneMessage | ErrorMessage;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

async function rasteriseFrames(req: EncodeRequest): Promise<Uint8ClampedArray[]> {
  const { width, height, background, frames } = req;
  const out: Uint8ClampedArray[] = [];
  const canvas = new OffscreenCanvas(width, height);
  const c2d = canvas.getContext("2d");
  if (!c2d) throw new Error("animation-encode: OffscreenCanvas 2D context unavailable");
  for (const frame of frames) {
    c2d.clearRect(0, 0, width, height);
    if (background.kind === "color") {
      c2d.fillStyle = background.color;
      c2d.fillRect(0, 0, width, height);
    }
    if (frame.pixelsDataUrl) {
      const blob = await fetch(frame.pixelsDataUrl).then((r) => r.blob());
      const bitmap = await createImageBitmap(blob);
      c2d.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
    }
    out.push(c2d.getImageData(0, 0, width, height).data);
  }
  return out;
}

ctx.onmessage = async (e: MessageEvent<EncodeRequest>) => {
  const post = (msg: WorkerOut, transfer: Transferable[] = []) => {
    ctx.postMessage(msg, transfer);
  };
  try {
    if (e.data.type !== "encode") return;
    const req = e.data;
    const rasterised = await rasteriseFrames(req);

    if (req.profileId === "animation-gif") {
      const inputs: GifFrameInput[] = req.frames.map((f, i) => ({
        pixels: rasterised[i],
        width: req.width,
        height: req.height,
        delayHundredths: f.delayHundredths,
      }));
      const bytes = encodeGif(inputs, {
        width: req.width,
        height: req.height,
        loopCount: req.loopCount,
      });
      const buf = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buf).set(bytes);
      post({ type: "done", bytes: buf, mime: "image/gif" }, [buf]);
      return;
    }

    if (req.profileId === "animation-apng") {
      const inputs: ApngFrame[] = req.frames.map((f, i) => ({
        pixels: rasterised[i],
        width: req.width,
        height: req.height,
        delayMs: f.delayMs,
      }));
      const bytes = encodeApng(inputs, { loopCount: req.loopCount ?? 0 });
      const buf = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buf).set(bytes);
      post({ type: "done", bytes: buf, mime: "image/apng" }, [buf]);
      return;
    }

    post({ type: "error", message: `animation-encode: unknown profileId ${String((req as EncodeRequest).profileId)}` });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};

export {};
