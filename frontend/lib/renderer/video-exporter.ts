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

  // Set up audio capture
  const audioCtx = new AudioContext();
  const audioDest = audioCtx.createMediaStreamDestination();

  // Play ambient music if a real track is selected
  const hasAmbientTrack = audio.track && audio.track !== "none";
  const exportPlayer = new AmbientPlayer();
  if (hasAmbientTrack) {
    exportPlayer.playToDestination(audio.track, audio.volume ?? 0.6, audioCtx, audioDest);
  } else {
    // Create a silent oscillator so the audio destination stream stays active
    // (MediaRecorder needs at least one active audio source)
    const silence = audioCtx.createOscillator();
    const silenceGain = audioCtx.createGain();
    silenceGain.gain.value = 0;
    silence.connect(silenceGain);
    silenceGain.connect(audioDest);
    silence.start();
  }

  // Schedule voiceover audio buffers at each scene's start time
  if (opts.voiceover?.enabled && opts.sceneTimings) {
    for (const timing of opts.sceneTimings) {
      const sceneVo = opts.voiceover.scenes[timing.id];
      if (!sceneVo?.audioUrl) continue;
      const buffer = await fetchAudioBuffer(sceneVo.audioUrl, audioCtx);
      if (!buffer) continue;
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioDest);
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

  if (hasAmbientTrack) exportPlayer.stop();
  audioCtx.close().catch(() => {});

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
