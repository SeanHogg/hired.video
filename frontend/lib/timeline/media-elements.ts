/**
 * Source media elements for the frame compositor (frame-renderer.ts):
 * loading an image / video source once per render, repairing
 * MediaRecorder-WebM durations, seeking a video to a frame, and drawing a
 * source "cover"-fitted onto the canvas. Split out of frame-renderer.ts so
 * the compositor module stays about compositing.
 */
import type { MediaSource } from "@shared/timeline";
import { decodeImage } from "./effects";

/** Draw an image/video centred and covering the canvas (preserves aspect ratio). */
export function drawCovering(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  cw: number,
  ch: number,
): void {
  // Pull source dimensions; HTMLVideoElement exposes videoWidth/Height,
  // HTMLImageElement uses naturalWidth/Height.
  let sw = 0, sh = 0;
  if (source instanceof HTMLVideoElement) {
    sw = source.videoWidth;
    sh = source.videoHeight;
  } else if (source instanceof HTMLImageElement) {
    sw = source.naturalWidth;
    sh = source.naturalHeight;
  }
  if (!sw || !sh) {
    ctx.drawImage(source, 0, 0, cw, ch);
    return;
  }
  const sourceRatio = sw / sh;
  const canvasRatio = cw / ch;
  let dw: number, dh: number, dx: number, dy: number;
  if (sourceRatio > canvasRatio) {
    dh = ch;
    dw = ch * sourceRatio;
    dx = (cw - dw) / 2;
    dy = 0;
  } else {
    dw = cw;
    dh = cw / sourceRatio;
    dx = 0;
    dy = (ch - dh) / 2;
  }
  ctx.drawImage(source, dx, dy, dw, dh);
}

export async function createMediaElement(
  src: MediaSource,
  useProxy: boolean,
): Promise<HTMLVideoElement | HTMLImageElement> {
  if (src.kind === "image") {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Image failed to load: ${src.filename}`));
      img.src = src.url;
    });
    await decodeImage(img);
    return img;
  }
  // video or audio — but audio is filtered out before drawClip is called.
  // Editor preview path picks the proxy when available; render path
  // always reads the master so the encoded output carries master pixels.
  // Per #341 — single decision point so both paths route through the
  // same fallback (proxy missing → master).
  const playbackUrl = useProxy && src.proxyUrl ? src.proxyUrl : src.url;
  const v = document.createElement("video");
  v.crossOrigin = "anonymous";
  v.muted = true; // we don't play audio from the rendered <video>; audio is mixed separately.
  v.preload = "auto";
  v.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    v.onloadedmetadata = () => resolve();
    v.onerror = () => reject(new Error(`Video failed to load: ${src.filename}`));
    v.src = playbackUrl;
  });
  // MediaRecorder-produced WebM (screen / webcam captures) carries no
  // Duration element, so `v.duration` is `Infinity` at HAVE_METADATA.
  // That breaks per-frame `seekTo` clamping (Math.min(Infinity, t) = t,
  // so a seek can land past the real EOF and never fire `seeked`, hanging
  // the render). Force the browser to demux to EOF and emit the real
  // duration before the encode loop starts. Runs once per source at
  // preload, not per frame.
  await repairInfiniteDuration(v);
  return v;
}

/**
 * Resolve a `<video>` whose `duration` is `Infinity`/`NaN` (the classic
 * MediaRecorder-WebM symptom) to a finite duration. Seeking past the end
 * makes the demuxer scan to EOF and emit `durationchange` with the real
 * value; we then reset to 0 so the first real seek starts clean. Bounded
 * by a timeout so a source that never resolves a duration can't stall
 * preload — the render then falls back to the unclamped seek path, no
 * worse than before this repair existed.
 */
function repairInfiniteDuration(v: HTMLVideoElement): Promise<void> {
  if (Number.isFinite(v.duration) && v.duration > 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      v.removeEventListener("durationchange", onChange);
      v.removeEventListener("seeked", onChange);
      clearTimeout(timer);
      // Rewind so per-frame seeks start from a known position. Guard in a
      // try — setting currentTime can throw on a still-degenerate source.
      try {
        v.currentTime = 0;
      } catch {
        /* leave as-is; seekTo will re-seek anyway */
      }
      resolve();
    };
    const onChange = () => {
      if (Number.isFinite(v.duration)) finish();
    };
    v.addEventListener("durationchange", onChange);
    v.addEventListener("seeked", onChange);
    const timer = setTimeout(finish, 5000);
    try {
      // Large but finite sentinel — far past any real clip length.
      v.currentTime = 1e7;
    } catch {
      finish();
    }
  });
}

/**
 * Seek a video element to a target time and resolve when the frame is
 * available. We round to a small epsilon — exact-equal currentTime
 * comparisons sometimes never fire `seeked` because the demuxer can't
 * deliver an exact frame at a non-keyframe boundary.
 */
export function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.max(0, Math.min(video.duration || time, time));
  if (Math.abs(video.currentTime - target) < 1 / 120) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", done);
      clearTimeout(timer);
      resolve();
    };
    video.addEventListener("seeked", done);
    // Safety net: a `seeked` event can fail to fire for a non-keyframe
    // target on a cue-less stream (e.g. MediaRecorder WebM). Resolve
    // anyway after a bound so the compose loop draws the current decoded
    // frame and advances instead of hanging the whole render. Seeks
    // normally settle in <100 ms, so this never trips in the common path.
    const timer = setTimeout(done, 3000);
    video.currentTime = target;
  });
}
