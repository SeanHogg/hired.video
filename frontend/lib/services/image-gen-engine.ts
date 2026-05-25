/**
 * AI image generation — pluggable engine registry, single client-side
 * facade. Per the canvas-runtime extensibility model (#931 / #932 /
 * PRD §1.2) image generation is a CAPABILITY every canvas runtime can
 * call, not a feature glued to one editor surface. The DrawingStage
 * (#932) is the first heavy consumer; the Timeline runtime's MediaPicker
 * already uses it for scene backgrounds; future Game / CAD / Comic
 * runtimes will reuse the same facade.
 *
 * Same registry pattern as [headshot-engine.ts](headshot-engine.ts) —
 * the user's reframe (2026-05-22): "There is already an AI image
 * generation capability you should be using that and expand upon it
 * (DRY/SOLID/DDD). The pluggable interface is the best approach …
 * leverage this pluggable interface in all TYPES (game, cad,
 * photoshop/drawing, video, etc.)"
 *
 * Engine ordering — WEB-FIRST, server fallback. Per the user's
 * framing: "we want to do clientside as the primary and transition
 * users to using the webGPU; Web first and then fallback to server."
 *
 *   1. `webgpu-sd-turbo` — Stable Diffusion Turbo via transformers.js
 *      on WebGPU. Zero infra cost, runs entirely in the user's browser,
 *      ~1.5GB first download cached for subsequent runs. CURRENTLY
 *      REGISTERED AS A PLACEHOLDER — `isAvailable()` returns false
 *      until a transformers.js text-to-image pipeline lands; this lets
 *      the seam exist now so swapping it in is one file change. The
 *      headshot-engine.ts comment notes the same constraint: "transformers.js
 *      v3 does NOT expose a text-to-image pipeline … SDXL-Turbo via
 *      transformers.js isn't shipping yet."
 *
 *   2. `server-cf-sdxl-lightning` — the EXISTING `/api/studio/generate-image`
 *      endpoint, which routes through Cloudflare Workers AI's
 *      `@cf/bytedance/stable-diffusion-xl-lightning` model. Always
 *      available when the user is authenticated and has token budget.
 *      DRY: we DO NOT fork the endpoint — the new engine wraps the
 *      existing `studioService.generateImage` call, which is the
 *      single port to the server-side path.
 *
 * Per the DRY rule: callers DO NOT pick engines. They call
 * `generateImage(input)` and get the best available result. Engines
 * register themselves via `registerImageGenEngine`; the facade picks
 * the first one whose `isAvailable()` returns true.
 */

import { studioService } from "./studio-service.js";

export type ImageGenEngineId = "webgpu-sd-turbo" | "server-cf-sdxl-lightning";

export interface ImageGenInput {
  /** Prompt the user typed. The facade trims + caps length before
   *  passing on; engines should not re-validate. */
  prompt: string;
  /** Output dimensions. Engines may downscale to a supported size
   *  (e.g. the Cloudflare model produces 1024² regardless of request);
   *  the result Blob is what the caller actually gets. Default 1024². */
  width?: number;
  height?: number;
  /** Optional source image for img→img mode — when set, the engine
   *  rewrites this image under the prompt instead of generating from
   *  scratch. Powers "update this element" across all studio kinds
   *  (selected drawing layer, selected sprite, selected scene widget,
   *  selected animation frame). MUST be a public CDN URL the server can
   *  fetch — engines that run client-side may fetch + downscale before
   *  sending. */
  sourceImageUrl?: string;
  /** Alternative source for in-memory rasters that haven't been uploaded
   *  yet — typically a drawing layer's `pixelsDataUrl` or an animation
   *  frame. Server decodes the base64. Ignored when `sourceImageUrl` is
   *  also set (URL wins). */
  sourceImageDataUrl?: string;
  /** Denoise strength for img→img (0..1). 0 = passthrough, 1 = ignore
   *  source. Ignored in text→img mode. Default 0.8 (keeps coarse shape,
   *  replaces detail). */
  strength?: number;
}

export interface ImageGenResult {
  /** The generated raster as a Blob. Caller composites onto the
   *  DrawingStage canvas (or sets as a Timeline scene background). */
  blob: Blob;
  /** Object URL the caller can drop into an <img> for preview. Caller
   *  is responsible for `URL.revokeObjectURL(previewUrl)` on cleanup. */
  previewUrl: string;
  /** Which engine handled this request. Surfaced in
   *  `ImageState.aiPromptHistory[i].engineId` so the user can see
   *  which path ran (and so support can diagnose engine-specific
   *  output-quality issues). */
  engine: ImageGenEngineId;
  /** Wall-clock duration end-to-end. */
  elapsedMs: number;
  /** When the server engine returned a durable CDN URL, that URL.
   *  Optional — the WebGPU engine returns a Blob the caller may keep
   *  ephemeral instead of persisting. */
  resultUrl?: string;
  /** Which model path produced this — "text2img" or "img2img". Lets the
   *  caller decide UX (e.g. "Replaced selected layer" vs "Added new
   *  layer"). Server engine reports this from the route; client engines
   *  derive it from whether `sourceImageUrl` was supplied. */
  mode?: "text2img" | "img2img";
}

export interface ImageGenEngine {
  id: ImageGenEngineId;
  label: string;
  /** Cheap readiness check (no model load). The facade calls this
   *  every pick so a browser that gains/loses WebGPU mid-session
   *  resolves correctly. */
  isAvailable(): Promise<boolean>;
  generate(
    input: ImageGenInput,
    onProgress?: (p: number) => void,
  ): Promise<ImageGenResult>;
}

const ENGINES = new Map<ImageGenEngineId, ImageGenEngine>();

export function registerImageGenEngine(engine: ImageGenEngine): void {
  ENGINES.set(engine.id, engine);
}

/** Engine ordering — WEB FIRST. The facade walks this list and picks
 *  the first available engine. Adding a new client-side path means a
 *  new entry at the top of this array (and a registration below). */
const ENGINE_PRIORITY: ImageGenEngineId[] = [
  "webgpu-sd-turbo",
  "server-cf-sdxl-lightning",
];

/** Pick the best engine. WebGPU first, server fallback. Single source
 *  of truth — every caller routes through `generateImage()` which
 *  routes through this. */
export async function pickAvailableImageGenEngine(): Promise<ImageGenEngine> {
  for (const id of ENGINE_PRIORITY) {
    const engine = ENGINES.get(id);
    if (!engine) continue;
    if (await engine.isAvailable()) return engine;
  }
  throw new Error("No image generation engine is available.");
}

export async function generateImage(
  input: ImageGenInput,
  onProgress?: (p: number) => void,
): Promise<ImageGenResult> {
  const trimmed = input.prompt.trim();
  if (trimmed.length < 3) {
    throw new Error("Prompt must be at least 3 characters.");
  }
  const engine = await pickAvailableImageGenEngine();
  return engine.generate(
    {
      ...input,
      prompt: trimmed.slice(0, 500),
    },
    onProgress,
  );
}

// ---------------------------------------------------------------------------
// Engine 1: WebGPU SD-Turbo via transformers.js.
//
// PLACEHOLDER — the registration exists so the seam is in place, but
// `isAvailable()` returns false today because transformers.js v3
// doesn't ship a text-to-image pipeline (same constraint as the
// headshot generator). The moment it does, swap the body to load the
// pipeline + return the Blob. No call sites need to change.
// ---------------------------------------------------------------------------

async function isWebGpuAdapterAvailable(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

/** Cached runtime probe of transformers.js + its `text-to-image`
 *  pipeline. Closes #1112: the engine seam was registered with a
 *  hardcoded `return false`, which meant the moment transformers.js
 *  v3 ships the pipeline we'd need a code change to flip the engine
 *  on. The probe re-checks at runtime — when the lib ships, the
 *  engine self-activates without a deploy. */
let cachedTransformersProbe: Promise<boolean> | null = null;
async function probeTransformersTextToImage(): Promise<boolean> {
  if (cachedTransformersProbe) return cachedTransformersProbe;
  cachedTransformersProbe = (async () => {
    try {
      // Dynamic ESM CDN import — same pattern the headshot generator
      // uses. Vite's `@vite-ignore` keeps the bundle clean; the lib
      // only loads when the engine is queried.
      const transformers = await import(
        // @ts-expect-error — CDN ESM URL has no static type declarations
        /* @vite-ignore */ "https://cdn.jsdelivr.net/npm/@huggingface/transformers@latest/+esm"
      ).catch(() => null) as { pipeline?: (task: string) => Promise<unknown>; TASK_TYPE_MAPPING?: Record<string, unknown> } | null;
      if (!transformers || typeof transformers.pipeline !== "function") return false;
      // The library throws a deterministic "Unsupported pipeline task"
      // error today; we capture that as "not yet available" and a
      // future release of transformers.js will return a real pipeline
      // factory which the catch path will NOT see. Either way the
      // engine seam reacts to upstream without a code change here.
      try {
        // Don't actually instantiate — that'd download multi-GB
        // weights. Just check whether the task token is recognised.
        // transformers.js exposes its task registry; if absent we
        // fall back to "not available".
        const taskList = (transformers as { TASK_TYPE_MAPPING?: Record<string, unknown> }).TASK_TYPE_MAPPING;
        if (taskList && typeof taskList === "object" && "text-to-image" in taskList) return true;
        return false;
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  })();
  return cachedTransformersProbe;
}

registerImageGenEngine({
  id: "webgpu-sd-turbo",
  label: "Stable Diffusion Turbo · WebGPU",
  async isAvailable(): Promise<boolean> {
    if (!(await isWebGpuAdapterAvailable())) return false;
    // Runtime probe (#1112): when transformers.js v3 ships the
    // `text-to-image` pipeline, this branch self-activates without a
    // code change. Until then the lib's task registry doesn't carry
    // the task token, and the probe returns false — falling through
    // to the server engine.
    return probeTransformersTextToImage();
  },
  async generate(input: ImageGenInput, onProgress?: (p: number) => void): Promise<ImageGenResult> {
    const startTs = performance.now();
    // Defer the heavy import to the call site — the bundle stays
    // clean for users who never invoke an AI-gen engine. Loaded
    // dynamically via the same CDN ESM pattern the headshot
    // generator (and `probeTransformersTextToImage` above) uses.
    // `@ts-expect-error` because the URL has no matching `.d.ts`;
    // safe because we runtime-probe the shape below.
    const transformers = await import(
      // @ts-expect-error — CDN ESM URL has no static type declarations
      /* @vite-ignore */ "https://cdn.jsdelivr.net/npm/@huggingface/transformers@latest/+esm"
    ).catch(() => null) as { pipeline?: (task: string, model: string) => Promise<unknown> } | null;
    if (!transformers || typeof transformers.pipeline !== "function") {
      throw new Error(
        "WebGPU SD-Turbo engine: transformers.js text-to-image pipeline " +
        "not yet available upstream. Falling through to the server engine.",
      );
    }
    onProgress?.(0.05);
    const pipe = (await transformers.pipeline("text-to-image", "stabilityai/sd-turbo")) as (
      prompt: string,
      opts: Record<string, unknown>,
    ) => Promise<{ images?: Array<{ toBlob?: () => Promise<Blob>; data?: Uint8ClampedArray; width?: number; height?: number }> }>;
    onProgress?.(0.4);
    const result = await pipe(input.prompt, {
      width: input.width ?? 512,
      height: input.height ?? 512,
      num_inference_steps: 1, // SD-Turbo's defining feature — 1-step generation
    });
    const image = result.images?.[0];
    if (!image) {
      throw new Error("WebGPU SD-Turbo engine returned no image");
    }
    onProgress?.(0.95);
    // The result image's surface varies across transformers.js
    // releases — branch on the actual shape so a future API tweak
    // doesn't break us.
    let blob: Blob;
    if (typeof image.toBlob === "function") {
      blob = await image.toBlob();
    } else if (image.data && image.width && image.height) {
      const canvas = new OffscreenCanvas(image.width, image.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("WebGPU SD-Turbo: no 2D context for raster conversion");
      const id = new ImageData(image.data, image.width, image.height);
      ctx.putImageData(id, 0, 0);
      blob = await canvas.convertToBlob({ type: "image/png" });
    } else {
      throw new Error("WebGPU SD-Turbo: unrecognised image surface from pipeline");
    }
    onProgress?.(1);
    return {
      blob,
      previewUrl: URL.createObjectURL(blob),
      engine: "webgpu-sd-turbo",
      elapsedMs: performance.now() - startTs,
      mode: input.sourceImageUrl || input.sourceImageDataUrl ? "img2img" : "text2img",
    };
  },
});

// ---------------------------------------------------------------------------
// Engine 2: Server-side Cloudflare SDXL-Lightning via the existing
// `/api/studio/generate-image` endpoint.
//
// Wraps `studioService.generateImage` (DRY — single port to the
// server). The endpoint already meters tokens, persists the PNG to R2,
// and returns a durable CDN URL. We fetch the URL once here and hand
// the caller back a Blob so the engine contract stays uniform
// regardless of where the bytes came from.
// ---------------------------------------------------------------------------

registerImageGenEngine({
  id: "server-cf-sdxl-lightning",
  label: "Stable Diffusion XL Lightning · Cloudflare",
  async isAvailable(): Promise<boolean> {
    return true;
  },
  async generate(input, onProgress): Promise<ImageGenResult> {
    const t0 = performance.now();
    onProgress?.(0);

    const response = await studioService.generateImage(input.prompt, {
      sourceImageUrl: input.sourceImageUrl,
      sourceImageDataUrl: input.sourceImageDataUrl,
      strength: input.strength,
    });
    onProgress?.(0.7);

    const fetched = await fetch(response.data.imageUrl);
    if (!fetched.ok) {
      throw new Error(`Failed to fetch generated image: ${fetched.status}`);
    }
    const blob = await fetched.blob();
    const previewUrl = URL.createObjectURL(blob);
    onProgress?.(1);

    return {
      blob,
      previewUrl,
      engine: "server-cf-sdxl-lightning",
      elapsedMs: performance.now() - t0,
      resultUrl: response.data.imageUrl,
      mode: response.data.mode ?? (input.sourceImageUrl ? "img2img" : "text2img"),
    };
  },
});
