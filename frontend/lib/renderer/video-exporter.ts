// video-exporter.ts — exports a CompiledVideo to a Blob.
//
// Strategy:
//   1. If VideoEncoder + mp4-muxer available → WebCodecs H.264 → MP4
//   2. Fallback → MediaRecorder with captureStream(30) → WebM
//
// The caller receives progress callbacks (0–1) and a final Blob.

import type { CompiledVideo } from "../compiler/types";
import { renderFrame } from "./frame-renderer";
import { scheduleClipsToDestination, type ClipScheduleHandle } from "../audio/clip-scheduler";
import { normalizeAudioClips } from "../audio/normalize-clips";
import { reportClientError } from "../error-report";
import type { VideoAudio, VoiceoverConfig } from "../../types/video-script";

export interface ExportOptions {
  onProgress?: (progress: number) => void;
  videoBitsPerSecond?: number;
  /** When set, ambient music is mixed into the exported video */
  audio?: VideoAudio;
  /** When set, voiceover audio is mixed per-scene into the exported video */
  voiceover?: VoiceoverConfig | null;
  /** Scene start times (seconds) keyed by scene id — needed to schedule voiceover playback */
  sceneTimings?: Array<{ id: string; start: number }>;
  /** Pro entitlement passed in from the React layer's `useSubscription`.
   *  Non-h264 codecs (h265 / ProRes / DNxHD / VP9) gate on this — the
   *  picker labels them "Pro", but the renderer is the trust boundary
   *  since a project can land here with `script.video.codec === 'prores'`
   *  via collaborator delegate or restored backup. Mirrors the server-
   *  side `requirePro` middleware on the 4K upload path. */
  isPro?: boolean;
  /** When true, a `RenderAudioContextError` during the audio-capture
   *  path triggers an automatic retry with audio stripped (routes
   *  through the silent WebCodecs/MediaRecorder path that never touches
   *  AudioContext). Callers in Save / Publish set this AFTER the user
   *  confirms via the error toast — never by default, since silently
   *  dropping audio is a meaningful product decision. */
  allowSilentFallback?: boolean;
}

/**
 * Thrown when the WebAudio renderer or audio device fails during export.
 * Chromium's raw error string ("The AudioContext encountered an error
 * from the audio device or the WebAudio renderer") is opaque to end
 * users; this wraps it with actionable copy. Callers in the Save /
 * Publish path can `instanceof RenderAudioContextError` to offer a
 * "try silent render?" fallback.
 */
/** Device / WebAudio snapshot captured when an audio render fails (#718) —
 *  so repeat failures aren't indistinguishable from first ones and we can see
 *  whether they cluster around a sample rate, channel count, or context state
 *  (Bluetooth headset swap, Windows session change, browser quirk). */
export interface AudioRenderDiagnostics {
  contextState?: string;
  sampleRate?: number;
  baseLatency?: number;
  outputChannelCount?: number;
}

/** Best-effort snapshot of an AudioContext for the diagnostics field. Never
 *  throws — a partial/empty snapshot is better than masking the real error. */
export function snapshotAudioContext(
  ctx?: AudioContext | null,
): AudioRenderDiagnostics | undefined {
  if (!ctx) return undefined;
  try {
    return {
      contextState: ctx.state,
      sampleRate: ctx.sampleRate,
      baseLatency: (ctx as { baseLatency?: number }).baseLatency,
      outputChannelCount: ctx.destination?.channelCount,
    };
  } catch {
    return undefined;
  }
}

export class RenderAudioContextError extends Error {
  readonly cause?: unknown;
  /** Device/WebAudio snapshot at failure time (#718). Absent when the context
   *  couldn't even be constructed. */
  readonly diagnostics?: AudioRenderDiagnostics;
  constructor(message: string, cause?: unknown, diagnostics?: AudioRenderDiagnostics) {
    super(message);
    this.name = "RenderAudioContextError";
    this.cause = cause;
    this.diagnostics = diagnostics;
  }
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

  // Pick AVC level based on resolution:
  //   Baseline 3.0 (42E01E) → max ~848×480 (414 720 px)
  //   Main 3.1    (4D001F) → max 1280×720 (921 600 px)
  //   High 4.0    (640028) → max 1920×1080 (2 097 152 px)
  const avcCodec = height >= 1080 ? "avc1.640028" : height >= 720 ? "avc1.4D001F" : "avc1.42E01E";

  encoder.configure({
    codec: avcCodec,
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

    try {
      const isKey = frame % (fps * 2) === 0; // keyframe every 2s
      encoder.encode(videoFrame, { keyFrame: isKey });
    } finally {
      videoFrame.close();
    }

    // Scale frame encoding to 0–80% so flush/finalize have visible progress room
    opts.onProgress?.((frame / totalFrames) * 0.80);

    // Yield to event loop periodically
    if (frame % 30 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  // encoder.flush() drains the encode queue — can take several seconds for long videos
  opts.onProgress?.(0.82);
  await encoder.flush();
  opts.onProgress?.(0.92);

  // muxer.finalize() writes the MP4 box headers (sync but may be slow for large files)
  muxer.finalize();
  opts.onProgress?.(0.97);

  const blob = new Blob([target.buffer], { type: "video/mp4" });
  opts.onProgress?.(1);
  return blob;
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
  canvas.style.position = "fixed";
  canvas.style.left = "-99999px";
  canvas.style.top = "0";
  document.body.appendChild(canvas);

  // Render first frame so the captureStream has video data before recording starts
  renderFrame(canvas, compiledVideo, 0);

  const stream = (canvas as unknown as { captureStream(fps: number): MediaStream }).captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp9",
    videoBitsPerSecond: opts.videoBitsPerSecond ?? 2_000_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  recorder.start(250);

  const frameDuration = 1000 / fps;
  let frame = 0;
  const totalFrames = Math.ceil(totalDuration * fps);
  const startWallTime = performance.now();

  await new Promise<void>((resolve) => {
    function next() {
      if (frame >= totalFrames) { resolve(); return; }
      const time = frame / fps;
      renderFrame(canvas, compiledVideo, time);
      opts.onProgress?.(frame / totalFrames);
      frame++;
      const targetMs = startWallTime + frame * frameDuration;
      const delay = Math.max(0, targetMs - performance.now());
      setTimeout(next, delay);
    }
    next();
  });

  // Allow the recorder to flush the final timeslice before stopping
  await new Promise<void>((r) => setTimeout(r, 300));
  if (recorder.state === "recording") {
    try { recorder.requestData(); } catch {}
  }
  await new Promise<void>((resolve) => {
    if (recorder.state === "inactive") { resolve(); return; }
    recorder.onstop = () => resolve();
    recorder.stop();
  });

  if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  opts.onProgress?.(1);
  return new Blob(chunks, { type: "video/webm" });
}

// ─── MediaRecorder with audio ─────────────────────────────────────────────────

/** Fetch an audio URL and decode it into an AudioBuffer. Returns null on failure. */
async function fetchAudioBuffer(url: string, ctx: AudioContext): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url);
    const arrayBuf = await res.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuf);
  } catch {
    return null;
  }
}

async function exportMediaRecorderWithAudio(
  compiledVideo: CompiledVideo,
  audio: VideoAudio,
  opts: ExportOptions,
): Promise<Blob> {
  const { width, height, fps, totalDuration } = compiledVideo;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  // Canvas must be in DOM (even hidden) for captureStream to reliably emit frames in some browsers
  canvas.style.position = "fixed";
  canvas.style.left = "-99999px";
  canvas.style.top = "0";
  document.body.appendChild(canvas);

  // Render the first frame BEFORE starting recorder so the stream has video data
  renderFrame(canvas, compiledVideo, 0);

  // Set up audio capture. Chromium fires the verbatim error message
  // "The AudioContext encountered an error from the audio device or the
  // WebAudio renderer" when the OS-level audio device fails mid-render
  // (no default output device, exclusive-mode conflict, device
  // disconnect). Catch it here so we can re-throw with actionable copy
  // instead of the raw browser string.
  let audioCtx: AudioContext;
  try {
    audioCtx = new AudioContext();
  } catch (err) {
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    throw new RenderAudioContextError(
      "Couldn't initialise audio for the render. Check your browser's audio output device is connected and try again.",
      err,
    );
  }
  // Statechange / error listener — the AudioContext is allowed to fail
  // asynchronously (the device dropping out mid-render). Capture the
  // failure so the awaiting caller sees a meaningful message. The "error"
  // event isn't typed in lib.dom (`BaseAudioContextEventMap` only knows
  // "statechange") but Chromium fires it on the WebAudio renderer; cast
  // through `EventTarget` so the listener attaches without TS noise.
  const ABNORMAL_STATES = new Set<string>(["closed", "interrupted"]);
  const audioFailure = new Promise<never>((_, reject) => {
    const onFailure = (ev: Event) => {
      reject(
        new RenderAudioContextError(
          "Audio device error during render. Try a different output device, close other apps using audio, or render again.",
          ev,
          snapshotAudioContext(audioCtx),
        ),
      );
    };
    (audioCtx as EventTarget).addEventListener("error", onFailure as EventListener);
    audioCtx.addEventListener("statechange", () => {
      if (ABNORMAL_STATES.has(audioCtx.state as string)) {
        onFailure(new Event("statechange:closed"));
      }
    });
  });
  if (audioCtx.state === "suspended") {
    try { await audioCtx.resume(); } catch {}
  }
  const audioDest = audioCtx.createMediaStreamDestination();

  // Multi-track mixer (gap #129) — per-lane GainNodes feed a master gain
  // before the destination. Each lane optionally applies its own fade-in /
  // fade-out envelope using `setValueAtTime` + `linearRampToValueAtTime`.
  const mix = audio.mix;
  const masterGainNode = audioCtx.createGain();
  masterGainNode.gain.value = mix?.masterGain ?? 1;
  masterGainNode.connect(audioDest);

  function buildLane(
    laneCfg: { gain?: number; fadeInSec?: number; fadeOutSec?: number; muted?: boolean } | undefined,
    baseGain: number,
  ): GainNode {
    const node = audioCtx.createGain();
    const peak = laneCfg?.muted ? 0 : (laneCfg?.gain ?? 1) * baseGain;
    const now = audioCtx.currentTime;
    const fadeIn = laneCfg?.fadeInSec ?? 0;
    const fadeOut = laneCfg?.fadeOutSec ?? 0;

    if (fadeIn > 0) {
      node.gain.setValueAtTime(0, now);
      node.gain.linearRampToValueAtTime(peak, now + fadeIn);
    } else {
      node.gain.setValueAtTime(peak, now);
    }
    if (fadeOut > 0) {
      const fadeStart = now + Math.max(0, totalDuration - fadeOut);
      node.gain.setValueAtTime(peak, fadeStart);
      node.gain.linearRampToValueAtTime(0, now + totalDuration);
    }
    node.connect(masterGainNode);
    return node;
  }

  // Music lane — multi-clip. The legacy single-track shape hoists into
  // a single full-duration clip via `normalizeAudioClips`, so this
  // path handles both old projects and the new layered model. The
  // shared `scheduleClipsToDestination` is the same scheduler the
  // live preview uses, so the export mix matches what users hear.
  const musicClips = normalizeAudioClips(audio, totalDuration);
  const musicLane = buildLane(mix?.music, audio.volume ?? 0.6);
  let musicHandle: ClipScheduleHandle | null = null;
  if (musicClips.length > 0) {
    musicHandle = await scheduleClipsToDestination(musicClips, audioCtx, musicLane, 0);
  } else {
    // Silent oscillator on the master so MediaRecorder stays active
    // (it drops the audio track if silence is the only thing flowing).
    const silence = audioCtx.createOscillator();
    const silenceGain = audioCtx.createGain();
    silenceGain.gain.value = 0;
    silence.connect(silenceGain);
    silenceGain.connect(masterGainNode);
    silence.start();
  }

  // Voiceover lane
  if (opts.voiceover?.enabled && opts.sceneTimings) {
    const voLane = buildLane(mix?.voiceover, 1);
    for (const timing of opts.sceneTimings) {
      const sceneVo = opts.voiceover.scenes[timing.id];
      if (!sceneVo?.audioUrl) continue;
      const buffer = await fetchAudioBuffer(sceneVo.audioUrl, audioCtx);
      if (!buffer) continue;
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(voLane);
      source.start(audioCtx.currentTime + timing.start);
    }
  }

  // Combine video + audio streams
  const videoStream = (canvas as unknown as { captureStream(fps: number): MediaStream }).captureStream(fps);
  const combined = new MediaStream([
    ...videoStream.getTracks(),
    ...audioDest.stream.getTracks(),
  ]);

  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : "video/webm";

  const recorder = new MediaRecorder(combined, {
    mimeType,
    videoBitsPerSecond: opts.videoBitsPerSecond ?? 2_000_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  // Use a 250ms timeslice so chunks accumulate while rendering
  recorder.start(250);

  const frameDuration = 1000 / fps;
  let frame = 0;
  const totalFrames = Math.ceil(totalDuration * fps);
  const startWallTime = performance.now();

  // Drive frame rendering against wall-clock time so captureStream picks them up.
  // Race the rendering loop against the AudioContext failure promise so an
  // async audio device error stops the render immediately with a clear
  // RenderAudioContextError instead of hanging until the timeout / producing
  // a corrupt WEBM.
  const renderLoop = new Promise<void>((resolve) => {
    function next() {
      if (frame >= totalFrames) { resolve(); return; }
      const time = frame / fps;
      renderFrame(canvas, compiledVideo, time);
      opts.onProgress?.(frame / totalFrames);
      frame++;

      // Schedule next frame so it lands on its real-time slot
      const targetMs = startWallTime + frame * frameDuration;
      const delay = Math.max(0, targetMs - performance.now());
      setTimeout(next, delay);
    }
    next();
  });
  try {
    await Promise.race([renderLoop, audioFailure]);
  } catch (err) {
    musicHandle?.stop();
    audioCtx.close().catch(() => {});
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    try { recorder.stop(); } catch {}
    throw err;
  }

  // Give the recorder time to flush the final timeslice before stopping
  await new Promise<void>((r) => setTimeout(r, 300));

  // Force flush any buffered data, then stop and wait for the stop event
  if (recorder.state === "recording") {
    try { recorder.requestData(); } catch {}
  }
  await new Promise<void>((resolve) => {
    if (recorder.state === "inactive") { resolve(); return; }
    recorder.onstop = () => resolve();
    recorder.stop();
  });

  musicHandle?.stop();
  audioCtx.close().catch(() => {});
  if (canvas.parentNode) canvas.parentNode.removeChild(canvas);

  opts.onProgress?.(1);
  return new Blob(chunks, { type: "video/webm" });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function exportVideo(
  compiledVideo: CompiledVideo,
  opts: ExportOptions = {},
): Promise<Blob> {
  // `hasMusic` covers both the legacy single-track shape and the
  // multi-clip layered shape — `normalizeAudioClips` collapses both
  // into a unified clip list so the gate is a simple `length > 0`.
  const musicClips = normalizeAudioClips(opts.audio, compiledVideo.totalDuration);
  const hasMusic = musicClips.length > 0;
  const hasVoiceover = opts.voiceover?.enabled && Object.values(opts.voiceover.scenes).some((s) => s.audioUrl);

  // Project-level render preset (codec/container/audioCodec) propagated
  // from `script.video` through the compiler. h264 + aac + mp4 — or
  // unset, which means "default to h264" — uses the WebCodecs fast
  // path. Anything else needs ffmpeg.wasm because WebCodecs only
  // produces AVC/AAC.
  const codec = compiledVideo.codec ?? "h264";
  if (codec !== "h264") {
    if (!opts.isPro) {
      throw new Error(
        `PRO_REQUIRED: ${codec.toUpperCase()} export is a Pro feature. Upgrade or switch the project codec to H.264.`,
      );
    }
    const { exportFfmpegWasm } = await import("./ffmpeg-wasm-exporter");
    return exportFfmpegWasm(compiledVideo, opts);
  }

  // When any audio is requested, use MediaRecorder so we can capture the audio stream.
  // On RenderAudioContextError (the OS-level device dropping out mid-render
  // — Windows in particular is fragile here), an `allowSilentFallback`
  // caller routes through the no-audio path so the user at least gets a
  // visual MP4 instead of nothing.
  if (hasMusic || hasVoiceover) {
    const audio: VideoAudio = hasMusic ? opts.audio! : { track: "none", label: "None", volume: 0 };
    try {
      return await exportMediaRecorderWithAudio(compiledVideo, audio, opts);
    } catch (err) {
      if (opts.allowSilentFallback && err instanceof RenderAudioContextError) {
        // Ship the device/WebAudio snapshot to telemetry before recovering, so
        // we can tell whether failures cluster around a specific device /
        // sample rate instead of all looking identical (#718). Fire-and-forget
        // through the standard client-error seam — no new endpoint, and a
        // failed report never blocks the render's silent recovery.
        void reportClientError({
          message: `Render audio failure (silent fallback): ${err.message}`,
          source: "manual",
          severity: "warning",
          context: {
            kind: "render-audio-failure",
            audioDiagnostics: err.diagnostics ?? null,
          },
        }).catch(() => {});
        // Strip audio + voiceover and re-enter exportVideo — drops into
        // the WebCodecs / silent MediaRecorder branch below.
        return exportVideo(compiledVideo, {
          ...opts,
          audio: undefined,
          voiceover: null,
          allowSilentFallback: false,
        });
      }
      throw err;
    }
  }

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
