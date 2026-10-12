/**
 * Sampled frames for the home-wall explicit scan. After a render is hosted
 * (publish-render.ts → hostRenderedVideo), a handful of small JPEG frames are
 * grabbed from the rendered video and sent to the API's vision scan — the
 * server can't decode video, and a public video can't reach the home wall
 * until the frames of its CURRENT render have been checked.
 *
 *   selectFrameTimes    pure: which timestamps to grab (one per scene, more
 *                       for long scenes at ~every 3 s, at most 12)
 *   captureVideoFrames  DOM: seek a <video> over the Blob and draw each time
 *                       onto a canvas → JPEG Blobs
 *   scanRenderedFrames  glue: select → capture → upload; never throws
 */
import { contentScanService } from "@/lib/services/content-scan-service";

export const MAX_SCAN_FRAMES = 12;
const INTERVAL_SEC = 3;
const FRAME_MAX_WIDTH = 512;
const JPEG_QUALITY = 0.7;
const EVENT_TIMEOUT_MS = 8000;

export interface FrameTimeOptions {
  /** Scene durations in seconds, in order. Empty → sample the whole video. */
  sceneDurations: readonly number[];
  /** Length of the rendered video in seconds (clamps every time). */
  totalSeconds: number;
  max?: number;
  intervalSeconds?: number;
}

/** Evenly keep `max` of `items`, always including the first and last. */
function downsample(items: number[], max: number): number[] {
  if (items.length <= max) return items;
  if (max <= 1) return items.slice(0, Math.max(0, max));
  const step = (items.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => items[Math.round(i * step)]!);
}

/**
 * Timestamps (seconds, ascending, 2-decimal) to sample: each scene gets
 * floor(duration / interval) evenly spaced frames (at least one, centred);
 * with no scenes, one every `interval` seconds centred in each slot. The
 * result is clamped to the video and evenly thinned to `max`.
 */
export function selectFrameTimes({ sceneDurations, totalSeconds, max = MAX_SCAN_FRAMES, intervalSeconds = INTERVAL_SEC }: FrameTimeOptions): number[] {
  if (!(totalSeconds > 0) || max <= 0) return [];
  const last = Math.max(0, totalSeconds - 0.05);
  const raw: number[] = [];
  const scenes = sceneDurations.filter((d) => d > 0);
  if (scenes.length > 0) {
    let start = 0;
    for (const duration of scenes) {
      const n = Math.max(1, Math.floor(duration / intervalSeconds));
      for (let i = 0; i < n; i++) raw.push(start + (duration * (i + 0.5)) / n);
      start += duration;
    }
  } else {
    const n = Math.max(1, Math.floor(totalSeconds / intervalSeconds));
    for (let i = 0; i < n; i++) raw.push((totalSeconds * (i + 0.5)) / n);
  }
  const clamped = raw.map((t) => Math.round(Math.min(t, last) * 100) / 100);
  const unique = [...new Set(clamped)].sort((a, b) => a - b);
  return downsample(unique, max);
}

function once(target: HTMLMediaElement, event: "loadeddata" | "seeked"): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`video ${event} timed out`));
    }, EVENT_TIMEOUT_MS);
    const onDone = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("video failed to load")); };
    function cleanup() {
      window.clearTimeout(timer);
      target.removeEventListener(event, onDone);
      target.removeEventListener("error", onError);
    }
    target.addEventListener(event, onDone, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

/** Grab JPEG frames of `blob` at `times` (seconds). Returns what it could get. */
export async function captureVideoFrames(blob: Blob, times: readonly number[]): Promise<{ frames: Blob[]; durationSeconds: number }> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  const frames: Blob[] = [];
  try {
    await once(video, "loadeddata");
    const scale = Math.min(1, FRAME_MAX_WIDTH / Math.max(1, video.videoWidth));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return { frames, durationSeconds: video.duration || 0 };
    const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : Infinity;
    for (const t of times) {
      video.currentTime = Math.min(t, end);
      await once(video, "seeked");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
      if (frame) frames.push(frame);
    }
    return { frames, durationSeconds: video.duration || 0 };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

/**
 * Sample + upload the frames of a freshly hosted render. Fire-and-forget:
 * a failure only means the video stays off the home wall until it's checked
 * (the owner's Post panel says so); it never fails the post.
 */
export async function scanRenderedFrames(args: {
  blob: Blob;
  projectId: string;
  sceneDurations: readonly number[];
}): Promise<void> {
  try {
    const totalSeconds = args.sceneDurations.reduce((sum, d) => sum + Math.max(0, d), 0);
    const times = selectFrameTimes({ sceneDurations: args.sceneDurations, totalSeconds });
    if (times.length === 0) return;
    const { frames } = await captureVideoFrames(args.blob, times);
    if (frames.length === 0) return;
    await contentScanService.submitFrames(args.projectId, frames);
  } catch (err) {
    console.warn("[moderation-frames] frame scan skipped:", err instanceof Error ? err.message : err);
  }
}
