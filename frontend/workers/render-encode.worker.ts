/// <reference lib="webworker" />
/// <reference types="dom-webcodecs" />
// The muxer seam is statically imported: the worker needs it on its first
// message, so a lazy chunk would only add a round trip.
import { createMp4Mux, type Mp4Mux, type Mp4VideoCodec } from "../lib/timeline/mp4-mux";
/**
 * Render-encode worker — WebCodecs path.
 *
 * Closes the "background render off main thread" task in the studio
 * audit (#5 in the editing-engine bucket of gap entries).
 *
 * Why a worker: the encode loop in webcodecs-render.ts used to run on
 * the main thread, blocking the editor for the duration of a render.
 * VideoEncoder + AudioEncoder + the MP4 muxer (lib/timeline/mp4-mux) all work in workers, so we
 * push everything that doesn't need DOM access here. The compositor
 * (which uses HTMLVideoElement to seek video sources) stays on the
 * main thread because workers can't drive <video> elements; main
 * sends rendered ImageBitmaps to this worker as transferables.
 *
 * Protocol:
 *   main → worker:
 *     { type: "init", config }      — encoder + muxer setup
 *     { type: "frame", bitmap, frameIndex }  (transfer: [bitmap])
 *     { type: "audio", planar, sampleRate, numberOfChannels }
 *           — passes the rendered audio mix as flat Float32Arrays per
 *             channel (transfered)
 *     { type: "finish" }            — flush, finalize, post back
 *   worker → main:
 *     { type: "progress", value }
 *     { type: "done", buffer, mime }   (transfer: [buffer])
 *     { type: "error", message }
 */

interface InitConfig {
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  videoCodec: string;
  /** The MP4 track's codec family for `videoCodec` (lib/timeline/export-codec). */
  muxerCodec: Mp4VideoCodec;
  videoBitrate: number;
  audio: {
    numberOfChannels: number;
    sampleRate: number;
  } | null;
}

interface InitMessage { type: "init"; config: InitConfig }
interface FrameMessage {
  type: "frame";
  bitmap: ImageBitmap;
  frameIndex: number;
}
interface AudioMessage {
  type: "audio";
  /** Concatenated planar Float32 samples — `[ch0 samples..., ch1 samples...]`. */
  planar: Float32Array;
  numberOfFrames: number;
  numberOfChannels: number;
  sampleRate: number;
}
interface FinishMessage { type: "finish" }

type InMessage = InitMessage | FrameMessage | AudioMessage | FinishMessage;

interface ProgressOut { type: "progress"; value: number }
interface DoneOut { type: "done"; buffer: ArrayBuffer; mime: string }
interface ErrorOut { type: "error"; message: string }
/** Backpressure signal — the encoder's current queue depth. Reported on
 *  every admit (handleFrame) AND every drain (the encoder's `output`
 *  callback) so the compositor on the main thread can throttle frame
 *  production and keep in-flight VideoFrame memory bounded. Without it a
 *  source-less timeline (canvas/animation) composites far faster than the
 *  encoder drains, the queue grows without bound, and the renderer OOMs. */
interface QueueOut { type: "queue"; size: number }

type OutMessage = ProgressOut | DoneOut | ErrorOut | QueueOut;

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

let cfg: InitConfig | null = null;
let muxer: Mp4Mux | null = null;
let videoEncoder: VideoEncoder | null = null;
let framesEncoded = 0;

function post(msg: OutMessage, transfer?: Transferable[]): void {
  ctx.postMessage(msg, transfer ?? []);
}

async function init(config: InitConfig): Promise<void> {
  cfg = config;
  // Created synchronously (the muxer queues writes behind its own start), so
  // a "frame" message handled before this async handler resumes still finds
  // the encoder and muxer in place.
  const mux = createMp4Mux({
    video: { codec: config.muxerCodec, frameRate: config.fps },
    audio: config.audio ? { codec: "aac" } : null,
  });
  muxer = mux;

  videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      mux.addVideoChunk(chunk, meta ?? undefined);
      // Drain signal: a frame just left the encoder. Report the new
      // (lower) queue depth so the main-thread compositor — which may be
      // parked waiting for the backlog to clear — can resume producing
      // frames. This is the reliable wake-up that keeps the credit-based
      // backpressure loop from dead-locking.
      if (videoEncoder) post({ type: "queue", size: videoEncoder.encodeQueueSize });
    },
    error: (e) => post({ type: "error", message: (e as Error).message ?? String(e) }),
  });
  videoEncoder.configure({
    codec: config.videoCodec,
    width: config.width,
    height: config.height,
    bitrate: config.videoBitrate,
    framerate: config.fps,
  });
}

function handleFrame(msg: FrameMessage): void {
  if (!videoEncoder || !cfg) return;
  const { bitmap, frameIndex } = msg;
  const videoFrame = new VideoFrame(bitmap, {
    timestamp: Math.round((frameIndex / cfg.fps) * 1_000_000),
    duration: Math.round(1_000_000 / cfg.fps),
  });
  try {
    videoEncoder.encode(videoFrame, { keyFrame: frameIndex % (cfg.fps * 2) === 0 });
    framesEncoded++;
    // Fill signal: report the queue depth right after admitting a frame so
    // the compositor sees the backlog rise promptly and can stop ahead of
    // the high-water mark.
    post({ type: "queue", size: videoEncoder.encodeQueueSize });
    if (framesEncoded % 15 === 0) {
      post({ type: "progress", value: Math.min(0.8, framesEncoded / cfg.totalFrames * 0.8) });
    }
  } finally {
    videoFrame.close();
    bitmap.close();
  }
}

async function encodeAudio(msg: AudioMessage): Promise<void> {
  const mux = muxer;
  if (!mux || !cfg?.audio) return;
  if (typeof AudioEncoder === "undefined") return;
  const { planar, numberOfFrames, numberOfChannels, sampleRate } = msg;

  // Re-slice the flat planar buffer into per-channel views.
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numberOfChannels; ch++) {
    channels.push(planar.subarray(ch * numberOfFrames, (ch + 1) * numberOfFrames));
  }

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => mux.addAudioChunk(chunk, meta ?? undefined),
    error: (e) => post({ type: "error", message: (e as Error).message ?? String(e) }),
  });
  audioEncoder.configure({
    codec: "mp4a.40.2",
    numberOfChannels,
    sampleRate,
    bitrate: 128_000,
  });

  const FRAME = 1024;
  for (let offset = 0; offset < numberOfFrames; offset += FRAME) {
    const len = Math.min(FRAME, numberOfFrames - offset);
    const data = new Float32Array(len * numberOfChannels);
    for (let ch = 0; ch < numberOfChannels; ch++) {
      data.set(channels[ch].subarray(offset, offset + len), ch * len);
    }
    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: len,
      numberOfChannels,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data,
    });
    audioEncoder.encode(audioData);
    audioData.close();
  }
  await audioEncoder.flush();
  audioEncoder.close();
}

async function finish(): Promise<void> {
  if (!videoEncoder || !muxer) return;
  await videoEncoder.flush();
  videoEncoder.close();
  post({ type: "progress", value: 0.9 });
  // Pull the buffer out, transfer ownership to the main thread.
  const buffer = await muxer.finalize();
  post({ type: "progress", value: 0.97 });
  post({ type: "done", buffer, mime: "video/mp4" }, [buffer]);
}

ctx.onmessage = async (e: MessageEvent<InMessage>) => {
  try {
    const msg = e.data;
    if (msg.type === "init") await init(msg.config);
    else if (msg.type === "frame") handleFrame(msg);
    else if (msg.type === "audio") await encodeAudio(msg);
    else if (msg.type === "finish") await finish();
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};

export {}; // module-scope marker so TS doesn't treat this as a script
