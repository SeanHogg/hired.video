/**
 * AI headshot generation — single client-side facade.
 *
 * Mirrors the posture established by `tts-engines.ts`: synthesis runs
 * entirely in the browser via WebGPU, no per-call vendor cost, no
 * server inference. The user's reference photo never leaves their
 * device unless they explicitly publish the result.
 *
 * Per the standing DRY rule, callers do NOT branch on which model to
 * run. They call `generateHeadshot()` and the facade selects the best
 * available engine. New engines plug in via `registerHeadshotEngine`.
 *
 * Per `project_nle_decision.md` ("I don't want to offer users BYOK at
 * this time"), there is NO Replicate / BYOK path here. If WebGPU isn't
 * available, generation reports "not available" — we don't fall back
 * to a paid cloud endpoint without explicit user consent that the
 * codebase doesn't currently solicit.
 */

export type HeadshotEngineId = "sdxl-turbo-webgpu" | "stub";

export interface HeadshotInput {
  /** Plain-text prompt describing the desired headshot ("studio
   *  lighting, professional portrait, neutral background, 45° angle"). */
  prompt: string;
  /** Optional reference image — when present, the engine biases output
   *  toward this person's identity. Either a Blob (from the webcam)
   *  or a data URL / object URL. */
  reference?: Blob | string | null;
  /** Output dimensions. Default 1024x1024 — SDXL-Turbo's native size. */
  width?: number;
  height?: number;
  /** Negative prompt — reduces unwanted attributes. */
  negativePrompt?: string;
  /** Guidance scale (CFG). Lower = closer to the prompt's literal ask,
   *  higher = more aggressive. Default 0 for SDXL-Turbo (it's a
   *  distilled model that runs without classifier-free guidance). */
  guidance?: number;
  /** Inference steps. SDXL-Turbo runs in 1-4 steps; default 2. */
  steps?: number;
  /** Random seed; omit for fresh randomness each call. */
  seed?: number;
}

export interface HeadshotResult {
  /** Generated PNG as a Blob — ready to download or upload. */
  blob: Blob;
  /** A persistable object URL for inline preview. Caller revokes when done. */
  previewUrl: string;
  engine: HeadshotEngineId;
  /** Total wall-clock time for the generation. */
  elapsedMs: number;
}

export interface HeadshotEngine {
  id: HeadshotEngineId;
  /** Display label for the engine picker. */
  label: string;
  isAvailable(): Promise<boolean>;
  generate(input: HeadshotInput, onProgress?: (p: number) => void): Promise<HeadshotResult>;
}

const ENGINES = new Map<HeadshotEngineId, HeadshotEngine>();

export function registerHeadshotEngine(engine: HeadshotEngine): void {
  ENGINES.set(engine.id, engine);
}

export function listHeadshotEngines(): HeadshotEngine[] {
  return Array.from(ENGINES.values());
}

/**
 * Pick the best available engine. Order of preference:
 *   1. sdxl-turbo-webgpu — real generation, 1024×1024
 *   2. stub — solid-colour placeholder so the UI flow is testable
 *      even on machines without WebGPU. Always available; the result
 *      is clearly marked as a placeholder.
 *
 * Single source of truth — every caller (HeadshotGeneratorPage,
 * sizzle-reel cover-art helper, channel banner generator) routes
 * through here. No caller hard-codes an engine id.
 */
export async function pickAvailableEngine(): Promise<HeadshotEngine> {
  const ordered: HeadshotEngineId[] = ["sdxl-turbo-webgpu", "stub"];
  for (const id of ordered) {
    const engine = ENGINES.get(id);
    if (!engine) continue;
    if (await engine.isAvailable()) return engine;
  }
  throw new Error("No headshot engine is available — even the stub failed to register.");
}

export async function generateHeadshot(
  input: HeadshotInput,
  onProgress?: (p: number) => void,
): Promise<HeadshotResult> {
  const engine = await pickAvailableEngine();
  return engine.generate(input, onProgress);
}

// ---------------------------------------------------------------------------
// Built-in engine: SDXL-Turbo via WebGPU
// ---------------------------------------------------------------------------
//
// Runs Stable Diffusion XL-Turbo in the browser via the
// transformers.js + ONNX Runtime Web stack. Loaded lazily — the bundle
// is ~6 GB on first run, cached in IndexedDB after that, so we don't
// pull it into the studio bundle. Caller surfaces a download progress
// indicator the first time.
//
// Reference-image biasing uses the OpenCLIP image encoder built into
// the same model bundle: the reference is embedded once, then we
// inject the embedding into the cross-attention path. When no
// reference is provided, generation runs from text alone.

registerHeadshotEngine({
  id: "sdxl-turbo-webgpu",
  label: "SDXL-Turbo (WebGPU, free)",
  async isAvailable() {
    if (typeof navigator === "undefined") return false;
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (!gpu) return false;
    try {
      const adapter = await gpu.requestAdapter();
      return !!adapter;
    } catch {
      return false;
    }
  },
  async generate(input, onProgress) {
    const t0 = performance.now();
    onProgress?.(0);

    // Lazy CDN ESM import — same pattern as tts-engines.ts. This keeps
    // the heavy onnxruntime-web dependency out of the studio bundle
    // until the user actually clicks "Generate." TS can't resolve URL
    // imports, so dispatch via a runtime-built dynamic import.
    const transformersUrl =
      "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js";
    const transformers = await dynamicImport<TransformersModule>(transformersUrl);

    transformers.env.allowLocalModels = false;
    transformers.env.backends.onnx.wasm.numThreads = 1;

    const pipe = await transformers.pipeline("text-to-image", "Xenova/sdxl-turbo", {
      device: "webgpu",
      dtype: "fp16",
      progress_callback: (event: { progress?: number }) => {
        if (typeof event.progress === "number") {
          // Reserve 0..0.6 for model download, 0.6..1 for inference.
          onProgress?.(Math.min(0.6, event.progress * 0.6));
        }
      },
    });

    onProgress?.(0.65);

    // Reference biasing: pre-encode the reference into a CLIP image
    // embedding the model can take as `image_embeds`. SDXL-Turbo on
    // transformers.js accepts this via `image_embeds` when supplied;
    // when no reference is given, the pipeline runs text-only.
    const refTensor = await encodeReferenceIfPresent(input.reference ?? null, transformers);

    const callable = pipe as unknown as (
      prompt: string,
      opts: Record<string, unknown>,
    ) => Promise<{ data: Uint8ClampedArray; width: number; height: number }>;
    const generation = await callable(input.prompt, {
      negative_prompt: input.negativePrompt ?? "",
      num_inference_steps: input.steps ?? 2,
      guidance_scale: input.guidance ?? 0,
      height: input.height ?? 1024,
      width: input.width ?? 1024,
      ...(refTensor ? { image_embeds: refTensor } : {}),
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
    });

    onProgress?.(0.95);

    const blob = await rgbaToPngBlob(generation.data, generation.width, generation.height);
    const previewUrl = URL.createObjectURL(blob);
    onProgress?.(1);
    return {
      blob,
      previewUrl,
      engine: "sdxl-turbo-webgpu",
      elapsedMs: performance.now() - t0,
    };
  },
});

async function encodeReferenceIfPresent(
  reference: Blob | string | null,
  transformers: TransformersModule,
): Promise<unknown | null> {
  if (!reference) return null;
  try {
    const image = reference instanceof Blob
      ? await (transformers.RawImage.fromBlob ?? transformers.RawImage.read)?.call(
          transformers.RawImage,
          reference,
        )
      : await transformers.RawImage.read?.(reference);
    const processor = await transformers.AutoProcessor.from_pretrained(
      "Xenova/clip-vit-large-patch14",
    );
    const visionModel = await transformers.CLIPVisionModelWithProjection.from_pretrained(
      "Xenova/clip-vit-large-patch14",
      { device: "webgpu", dtype: "fp16" },
    );
    const inputs = await (processor as unknown as (img: unknown) => Promise<{ pixel_values: unknown }>)(image);
    const { image_embeds } = await (visionModel as unknown as (i: unknown) => Promise<{ image_embeds: unknown }>)(inputs);
    return image_embeds;
  } catch {
    // Reference biasing is opt-in; if the CLIP model fails to load,
    // fall back to text-only generation rather than blocking the user.
    return null;
  }
}

interface TransformersModule {
  env: { allowLocalModels: boolean; backends: { onnx: { wasm: { numThreads: number } } } };
  pipeline: (
    task: string,
    model: string,
    opts: Record<string, unknown>,
  ) => Promise<unknown>;
  AutoProcessor: { from_pretrained: (id: string) => Promise<unknown> };
  CLIPVisionModelWithProjection: {
    from_pretrained: (id: string, opts: unknown) => Promise<unknown>;
  };
  RawImage: {
    fromBlob?: (b: Blob) => Promise<unknown>;
    read?: (s: string | Blob) => Promise<unknown>;
  };
}

/** Dynamic import that bypasses the TS module-resolution check so we
 *  can pull the transformers.js bundle from a CDN URL. The runtime
 *  treats it as a normal `import()`. */
function dynamicImport<T>(url: string): Promise<T> {
  return new Function("u", "return import(u)")(url) as Promise<T>;
}

async function rgbaToPngBlob(rgba: Uint8ClampedArray, width: number, height: number): Promise<Blob> {
  const canvas = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement("canvas"), { width, height });
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable for headshot output");
  // Re-pack into a fresh ArrayBuffer-backed Uint8ClampedArray so the
  // ImageData ctor accepts it on browsers where the source buffer is
  // a SharedArrayBuffer.
  const safeBuffer = new Uint8ClampedArray(rgba.length);
  safeBuffer.set(rgba);
  const imgData = new ImageData(safeBuffer, width, height);
  (ctx as CanvasRenderingContext2D).putImageData(imgData, 0, 0);
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: "image/png" });
  }
  return await new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode PNG"))),
      "image/png",
    );
  });
}

// ---------------------------------------------------------------------------
// Stub engine — always available, so the UI flow can be exercised and
// reviewed on machines without WebGPU. Produces a clearly-labelled
// placeholder image (gradient + prompt text watermark).
// ---------------------------------------------------------------------------

registerHeadshotEngine({
  id: "stub",
  label: "Placeholder (no WebGPU detected)",
  async isAvailable() {
    return true;
  },
  async generate(input, onProgress) {
    const t0 = performance.now();
    onProgress?.(0.2);
    const w = input.width ?? 1024;
    const h = input.height ?? 1024;
    const canvas = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#1f2937");
    grad.addColorStop(1, "#0ea5e9");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `bold ${Math.round(w / 20)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Placeholder headshot", w / 2, h / 2 - 40);
    ctx.font = `${Math.round(w / 36)}px sans-serif`;
    ctx.fillText("WebGPU unavailable — install Chrome/Edge", w / 2, h / 2 + 20);
    if (input.prompt) {
      const truncated = input.prompt.length > 80 ? input.prompt.slice(0, 77) + "…" : input.prompt;
      ctx.fillText(`"${truncated}"`, w / 2, h / 2 + 70);
    }
    onProgress?.(0.95);
    const blob = canvas instanceof OffscreenCanvas
      ? await canvas.convertToBlob({ type: "image/png" })
      : await new Promise<Blob>((res, rej) => {
          (canvas as HTMLCanvasElement).toBlob(
            (b) => (b ? res(b) : rej(new Error("toBlob failed"))),
            "image/png",
          );
        });
    onProgress?.(1);
    return {
      blob,
      previewUrl: URL.createObjectURL(blob),
      engine: "stub",
      elapsedMs: performance.now() - t0,
    };
  },
});
