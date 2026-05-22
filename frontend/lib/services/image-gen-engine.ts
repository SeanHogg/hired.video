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

export function listImageGenEngines(): ImageGenEngine[] {
  return Array.from(ENGINES.values());
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

registerImageGenEngine({
  id: "webgpu-sd-turbo",
  label: "Stable Diffusion Turbo · WebGPU",
  async isAvailable(): Promise<boolean> {
    if (!(await isWebGpuAdapterAvailable())) return false;
    // Gate behind a feature flag the user can flip once a real
    // text-to-image WebGPU implementation ships. Today: always false
    // so the facade falls through to the server engine. The seam is
    // here so swapping the body is one file change.
    return false;
  },
  async generate(): Promise<ImageGenResult> {
    throw new Error(
      "WebGPU SD-Turbo engine is registered but not yet implemented — " +
        "transformers.js v3 does not expose a text-to-image pipeline " +
        "(tracked in Consolidated Gap Register under #932 follow-ons).",
    );
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

    const response = await studioService.generateImage(input.prompt);
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
    };
  },
});
