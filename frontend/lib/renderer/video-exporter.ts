// video-exporter.ts — exports a CompiledVideo to a Blob.
//
// Strategy:
//   1. If VideoEncoder + mp4-muxer available → WebCodecs H.264 → MP4
//   2. Fallback → MediaRecorder with captureStream(30) → WebM
//
// The caller receives progress callbacks (0–1) and a final Blob.

import type { CompiledVideo } from "../compiler/types";
import { renderFrame } from "./frame-renderer";
import { AmbientPlayer } from "../audio/ambient-player";
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

  // Set up audio capture — resume context (required by browser autoplay policy)
  const audioCtx = new AudioContext();
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

  // Music lane
  const hasAmbientTrack = audio.track && audio.track !== "none";
  const musicLane = buildLane(mix?.music, audio.volume ?? 0.6);
  const exportPlayer = new AmbientPlayer();
  if (hasAmbientTrack) {
    // Lane gain replaces the previous direct masterGain wiring; the player
    // now writes into musicLane instead of audioDest.
    exportPlayer.playToDestination(audio.track, 1, audioCtx, musicLane);
  } else {
    // Silent oscillator on the master so MediaRecorder stays active.
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

  // Drive frame rendering against wall-clock time so captureStream picks them up
  await new Promise<void>((resolve) => {
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

  if (hasAmbientTrack) exportPlayer.stop();
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
  const hasAmbient = opts.audio && opts.audio.track && opts.audio.track !== "none";
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

  // When any audio is requested, use MediaRecorder so we can capture the audio stream
  if (hasAmbient || hasVoiceover) {
    const audio: VideoAudio = hasAmbient ? opts.audio! : { track: "none", label: "None", volume: 0 };
    return exportMediaRecorderWithAudio(compiledVideo, audio, opts);
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
