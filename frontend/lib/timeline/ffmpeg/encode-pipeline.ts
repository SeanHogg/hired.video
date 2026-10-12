/**
 * Segmented ffmpeg.wasm encode: raw RGBA frames in, a finished video Blob out.
 *
 * Memory shape (the reason this is chunked): a raw 1080p frame is 8 MB, so a
 * whole video never fits the wasm heap. Frames are buffered a chunk at a
 * time (≤ RAW_SEGMENT_BUDGET_BYTES), written to MEMFS, encoded to a
 * video-only segment, and the segment is read OUT of the heap into a JS
 * Blob. The final pass mounts every segment (+ the audio WAV) read-only via
 * WORKERFS and stream-copies them into one file — so the heap only ever holds
 * one raw chunk, or the finished file.
 *
 * Progress contract (same as the WebCodecs engine): monotonic 0..0.97 here,
 * the strategy reports the final 1. Cancellation: the signal is checked
 * before every frame and step, and aborting kills the ffmpeg worker so an
 * in-flight exec stops immediately; either way the caller sees AbortError.
 */
import { throwIfAborted } from "../frame-producer";
import { concatList, framesPerSegment, muxArgs, segmentEncodeArgs, type FfmpegEncoding } from "./encode-args";
import type { FfmpegPort } from "./ffmpeg-loader";
import { FfmpegRenderError, codecLabel } from "./errors";
import { assertEncodersAvailable } from "./encoder-probe";

export interface EncodeFramesInput {
  ffmpeg: FfmpegPort;
  encoding: FfmpegEncoding;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  /** RGBA bytes (width × height × 4) of one frame. */
  readFrame: (frame: number) => Promise<Uint8Array | Uint8ClampedArray>;
  /** The audio mix as a WAV, or null for a silent video. */
  audioWav: Blob | null;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
  /** Override the chunk size (tests); default from the frame size. */
  segmentFrames?: number;
}

const WORK_DIR = "/work";
const SEGMENT_MOUNT = "/segments";
const RAW_PATH = `${WORK_DIR}/chunk.rgba`;
const LIST_PATH = `${WORK_DIR}/segments.ffconcat`;
/** Share of the progress bar for compositing + segment encodes; the mux takes the rest up to 0.97. */
const FRAMES_SHARE = 0.9;
const MUX_DONE = 0.97;
/** A hung exec (a known core-mt failure mode) becomes an error, not a frozen bar. */
const EXEC_TIMEOUT_MS = 5 * 60 * 1000;

function segmentName(index: number, extension: string): string {
  return `seg_${String(index).padStart(5, "0")}.${extension}`;
}

async function run(ffmpeg: FfmpegPort, args: string[], codec: string): Promise<void> {
  const code = await ffmpeg.exec(args, EXEC_TIMEOUT_MS);
  if (code !== 0) throw new FfmpegRenderError("ENCODE_FAILED", { codec: codecLabel(codec) });
}

export { codecLabel };

export async function encodeFramesWithFfmpeg(input: EncodeFramesInput): Promise<Blob> {
  const { ffmpeg, encoding, width, height, fps, totalFrames, signal } = input;
  const onAbort = () => ffmpeg.terminate();
  signal?.addEventListener("abort", onAbort, { once: true });
  let mounted = false;
  try {
    throwIfAborted(signal);
    // Fail before compositing a single frame when the loaded core lacks the
    // encoder (e.g. a core-mt build without libx265 / libvpx).
    assertEncodersAvailable(encoding);
    const frameBytes = width * height * 4;
    const perSegment = input.segmentFrames ?? framesPerSegment(width, height);
    const segments: Array<{ name: string; data: Blob }> = [];
    await ffmpeg.createDir(WORK_DIR);

    for (let start = 0; start < totalFrames; start += perSegment) {
      const count = Math.min(perSegment, totalFrames - start);
      const chunk = new Uint8Array(frameBytes * count);
      for (let i = 0; i < count; i++) {
        throwIfAborted(signal);
        const frame = start + i;
        chunk.set(await input.readFrame(frame), i * frameBytes);
        if (frame % 10 === 0) input.onProgress?.((frame / totalFrames) * FRAMES_SHARE);
      }
      throwIfAborted(signal);
      const name = segmentName(segments.length, encoding.extension);
      const out = `${WORK_DIR}/${name}`;
      await ffmpeg.writeFile(RAW_PATH, chunk);
      await run(ffmpeg, segmentEncodeArgs(encoding, { width, height, fps, input: RAW_PATH, output: out }), encoding.codec);
      await ffmpeg.deleteFile(RAW_PATH);
      const bytes = await ffmpeg.readFile(out);
      await ffmpeg.deleteFile(out);
      segments.push({ name, data: new Blob([bytes]) });
      input.onProgress?.(((start + count) / totalFrames) * FRAMES_SHARE);
    }

    throwIfAborted(signal);
    const audioName = input.audioWav ? "audio.wav" : null;
    const blobs = audioName && input.audioWav ? [...segments, { name: audioName, data: input.audioWav }] : segments;
    await ffmpeg.mountBlobs(SEGMENT_MOUNT, blobs);
    mounted = true;
    await ffmpeg.writeFile(LIST_PATH, concatList(segments.map((s) => `${SEGMENT_MOUNT}/${s.name}`)));
    const output = `${WORK_DIR}/out.${encoding.extension}`;
    await run(
      ffmpeg,
      muxArgs(encoding, { concatList: LIST_PATH, audio: audioName ? `${SEGMENT_MOUNT}/${audioName}` : null, output }),
      encoding.codec,
    );
    const bytes = await ffmpeg.readFile(output);
    input.onProgress?.(MUX_DONE);
    return new Blob([bytes], { type: encoding.mime });
  } catch (err) {
    if (signal?.aborted) throw new DOMException("Render aborted", "AbortError");
    throw err;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    // Release the WORKERFS mount on success AND failure. Best-effort: after an
    // abort the worker is already terminated and every call rejects.
    if (mounted && !signal?.aborted) await ffmpeg.unmount(SEGMENT_MOUNT).catch(() => undefined);
  }
}
