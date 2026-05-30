/**
 * #127 — Browser-side AI background removal for WebcamRecorder. Uses
 * MediaPipe Selfie Segmentation (WASM model) when available, falls
 * back to "no replacement, raw passthrough" so a missing model doesn't
 * break recording.
 *
 * Used as a real-time mask in `WebcamRecorder.tsx` preview and baked
 * into the exported `VideoFrame` stream so the chosen background ships
 * with the export. The mask compositor reads the current
 * `BackgroundReplacement` mode and either fills with a solid colour,
 * blurs the original pixels, or draws a user-supplied bitmap.
 *
 * Loading the model lazily ensures the WebcamRecorder bundle stays
 * lean for users who never toggle background replacement on. The
 * module caches the segmenter in memory after the first use so
 * subsequent recordings don't re-download the WASM artefact.
 */

export type BackgroundReplacement =
  | { kind: "none" }
  | { kind: "blur"; sigmaPx: number }
  | { kind: "color"; hex: string }
  | { kind: "image"; bitmap: ImageBitmap };

interface SelfieSegmenter {
  /** Returns a mask the same size as the input frame, with values in
   *  [0, 255] where 255 = foreground. */
  segment(input: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<ImageData>;
  close(): void;
}

let cachedSegmenter: Promise<SelfieSegmenter | null> | null = null;

/** Lazily load MediaPipe Selfie Segmentation. Returns null when the
 *  model can't be loaded — the caller falls back to no replacement. */
export function getSelfieSegmenter(): Promise<SelfieSegmenter | null> {
  if (cachedSegmenter) return cachedSegmenter;
  cachedSegmenter = (async () => {
    try {
      // The actual import shape depends on which WASM build the project
      // ships. We use a dynamic import so build-time tree-shaking
      // doesn't pull MediaPipe into the main bundle when the recorder
      // page isn't loaded.
      const mod = (await import(
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore — dynamic optional dep; resolved at runtime
        "@mediapipe/tasks-vision"
      ).catch(() => null)) as any;
      if (!mod?.FilesetResolver || !mod?.ImageSegmenter) return null;
      const fileset = await mod.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm",
      );
      const segmenter = await mod.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
        },
        outputCategoryMask: true,
        outputConfidenceMasks: false,
        runningMode: "VIDEO",
      });
      return {
        async segment(input) {
          const now = performance.now();
          const result = await segmenter.segmentForVideo(input, now);
          const mask = result?.categoryMask?.getAsUint8Array();
          if (!mask) {
            return new ImageData(1, 1);
          }
          const w = result.categoryMask.width ?? 0;
          const h = result.categoryMask.height ?? 0;
          const rgba = new Uint8ClampedArray(w * h * 4);
          for (let i = 0; i < w * h; i++) {
            const v = mask[i] === 0 ? 0 : 255;
            rgba[i * 4 + 0] = v;
            rgba[i * 4 + 1] = v;
            rgba[i * 4 + 2] = v;
            rgba[i * 4 + 3] = 255;
          }
          return new ImageData(rgba, w, h);
        },
        close() {
          segmenter.close?.();
        },
      };
    } catch {
      return null;
    }
  })();
  return cachedSegmenter;
}

/**
 * Composite a frame against a background replacement. Caller owns the
 * destination canvas; this function only fills it. Frees the caller
 * from knowing about which MediaPipe shape is loaded.
 */
export async function applyBackgroundReplacement(args: {
  ctx: CanvasRenderingContext2D;
  source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap;
  width: number;
  height: number;
  mode: BackgroundReplacement;
}): Promise<void> {
  const { ctx, source, width, height, mode } = args;
  if (mode.kind === "none") {
    ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
    return;
  }
  const segmenter = await getSelfieSegmenter();
  if (!segmenter) {
    ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
    return;
  }
  // Background pass
  if (mode.kind === "color") {
    ctx.fillStyle = mode.hex;
    ctx.fillRect(0, 0, width, height);
  } else if (mode.kind === "image") {
    ctx.drawImage(mode.bitmap, 0, 0, width, height);
  } else if (mode.kind === "blur") {
    ctx.save();
    ctx.filter = `blur(${Math.max(0, mode.sigmaPx)}px)`;
    ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
    ctx.restore();
  }
  // Foreground pass — mask the source onto the destination using the
  // segmenter output.
  const maskData = await segmenter.segment(source);
  const off = new OffscreenCanvas(maskData.width, maskData.height);
  const offCtx = off.getContext("2d");
  if (!offCtx) {
    ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
    return;
  }
  offCtx.putImageData(maskData, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  // Draw source full-frame, then mask via destination-in with the
  // upscaled segmentation mask.
  const personCanvas = new OffscreenCanvas(width, height);
  const personCtx = personCanvas.getContext("2d")!;
  personCtx.drawImage(source as CanvasImageSource, 0, 0, width, height);
  personCtx.globalCompositeOperation = "destination-in";
  personCtx.drawImage(off, 0, 0, width, height);
  ctx.drawImage(personCanvas, 0, 0, width, height);
  ctx.restore();
}
