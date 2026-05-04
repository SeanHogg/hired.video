/**
 * Client-side proxy generator — downscales a high-resolution source
 * video to a 720p H.264 proxy that the editor can scrub against
 * without buffering the full master.
 *
 * Per the standing DRY rule, every consumer that needs a proxy (the
 * source picker, the future bulk-import flow, the asset bin) routes
 * through `generateProxy()` rather than re-implementing the
 * decode/scale/encode loop.
 *
 * Pipeline: WebCodecs `VideoDecoder` → bitmap canvas downscale →
 * WebCodecs `VideoEncoder` → mp4-muxer. Falls back to "no proxy"
 * when WebCodecs isn't available; callers should treat the absence
 * of a proxy URL as "use the master URL for scrubbing too."
 *
 * Audio is NOT carried into the proxy — it's a scrubbing aid only.
 * The render path always uses the master URL with full audio.
 */

export interface ProxyOptions {
  /** Target height in pixels. Width scales proportionally. Default 720. */
  targetHeight?: number;
  /** Target encoding bitrate. Default 1.5 Mbps. */
  bitrate?: number;
  /** Progress callback 0..1. */
  onProgress?: (p: number) => void;
}

export interface ProxyResult {
  /** Blob of the proxy MP4. Caller revokes the object URL when done. */
  blob: Blob;
  /** Native dimensions of the proxy. */
  width: number;
  height: number;
  /** Duration in seconds. */
  durationSec: number;
  /** Effective downscale factor (master height / proxy height). */
  scaleFactor: number;
}

/**
 * Returns true when the browser can run the proxy generation
 * pipeline. Caller can short-circuit and skip proxies on platforms
 * that lack WebCodecs (Firefox until 2024, Safari iOS).
 */
export function isProxyGenerationAvailable(): boolean {
  return (
    typeof VideoDecoder !== "undefined" &&
    typeof VideoEncoder !== "undefined" &&
    typeof OffscreenCanvas !== "undefined"
  );
}

export async function generateProxy(file: File | Blob, opts: ProxyOptions = {}): Promise<ProxyResult> {
  if (!isProxyGenerationAvailable()) {
    throw new Error("Proxy generation requires WebCodecs (Chromium / Safari 17+).");
  }
  const targetHeight = opts.targetHeight ?? 720;
  const bitrate = opts.bitrate ?? 1_500_000;

  // Probe via a hidden <video> to read native dimensions and duration.
  const probeVideo = document.createElement("video");
  probeVideo.muted = true;
  probeVideo.playsInline = true;
  probeVideo.crossOrigin = "anonymous";
  const url = URL.createObjectURL(file);
  try {
    probeVideo.src = url;
    await new Promise<void>((resolve, reject) => {
      probeVideo.onloadedmetadata = () => resolve();
      probeVideo.onerror = () => reject(new Error("Could not probe source video"));
    });
    const masterW = probeVideo.videoWidth;
    const masterH = probeVideo.videoHeight;
    if (masterH === 0) throw new Error("Source video reported zero height");
    if (masterH <= targetHeight) {
      // Source is already small — no proxy needed; return the source
      // bytes unchanged so callers don't have to special-case this.
      const buf = await (file as Blob).arrayBuffer();
      return {
        blob: new Blob([buf], { type: file.type || "video/mp4" }),
        width: masterW,
        height: masterH,
        durationSec: probeVideo.duration,
        scaleFactor: 1,
      };
    }
    const scale = targetHeight / masterH;
    const proxyW = Math.round(masterW * scale / 2) * 2; // even
    const proxyH = Math.round(targetHeight / 2) * 2;
    const fps = 30; // proxy fps — sufficient for scrubbing
    const totalFrames = Math.max(1, Math.ceil(probeVideo.duration * fps));

    // Encode pipeline: per frame we seek the <video>, drawImage to a
    // downscaled OffscreenCanvas, transferToImageBitmap, build a
    // VideoFrame, encoder.encode().
    const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: "avc", width: proxyW, height: proxyH },
      fastStart: "in-memory",
    });
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta ?? undefined),
      error: (e) => { throw e; },
    });
    encoder.configure({
      codec: "avc1.4D001F",
      width: proxyW,
      height: proxyH,
      bitrate,
      framerate: fps,
    });
    const canvas = new OffscreenCanvas(proxyW, proxyH);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");

    for (let frame = 0; frame < totalFrames; frame++) {
      const t = frame / fps;
      probeVideo.currentTime = t;
      await new Promise<void>((resolve) => {
        const handler = () => { probeVideo.removeEventListener("seeked", handler); resolve(); };
        probeVideo.addEventListener("seeked", handler);
      });
      ctx.drawImage(probeVideo, 0, 0, proxyW, proxyH);
      const bitmap = canvas.transferToImageBitmap();
      const videoFrame = new VideoFrame(bitmap, {
        timestamp: Math.round((frame / fps) * 1_000_000),
        duration: Math.round(1_000_000 / fps),
      });
      try {
        encoder.encode(videoFrame, { keyFrame: frame % (fps * 2) === 0 });
      } finally {
        videoFrame.close();
      }
      if (frame % 30 === 0) {
        opts.onProgress?.(frame / totalFrames);
        // Yield so the UI stays responsive — proxy gen is long.
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await encoder.flush();
    muxer.finalize();
    opts.onProgress?.(1);

    // Re-wrap the buffer to dodge SharedArrayBuffer issues, same trick
    // as the ffmpeg exporter and headshot engine.
    const out = new Uint8Array(target.buffer.byteLength);
    out.set(new Uint8Array(target.buffer));
    return {
      blob: new Blob([out], { type: "video/mp4" }),
      width: proxyW,
      height: proxyH,
      durationSec: probeVideo.duration,
      scaleFactor: 1 / scale,
    };
  } finally {
    URL.revokeObjectURL(url);
    probeVideo.removeAttribute("src");
    probeVideo.load();
  }
}
