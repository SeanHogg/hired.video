/**
 * AI headshot generation — single client-side facade.
 *
 * Implementation reality check (2026-05-04):
 *   - transformers.js v3 does NOT expose a `text-to-image` pipeline; the
 *     supported list (per the runtime error) covers segmentation,
 *     classification, captioning, ASR, image-to-image, etc., but no
 *     diffusion. SDXL-Turbo via transformers.js isn't shipping yet.
 *   - The realistic in-browser path that actually runs is BACKGROUND
 *     SEGMENTATION + composite onto a styled backdrop. That's what
 *     gives the user a "professional headshot" output reliably.
 *
 * So: this engine takes a webcam capture (or uploaded photo), runs
 * `image-segmentation` to isolate the subject, and composites them
 * onto a chosen backdrop. The model is downloaded once and cached.
 *
 * Per the standing DRY rule the facade is one entry point; new
 * engines (a real diffusion path when transformers.js supports it,
 * or a server-backed Replicate path when BYOK opens up) plug in via
 * `registerHeadshotEngine`. Callers don't pick.
 *
 * Per `project_nle_decision.md` ("I don't want to offer users BYOK at
 * this time"), there is NO Replicate / paid-cloud path. WebGPU when
 * available, WASM fallback when not.
 */

import { coverRect } from "@/lib/utils/image-fit";

export type HeadshotEngineId = "segformer-webgpu" | "segformer-wasm";

export interface HeadshotInput {
  /** The user's photo — either webcam capture or an upload. */
  reference: Blob;
  /** Backdrop preset id. Driven by BACKDROP_PRESETS below; the dialog
   *  presents these as cards. */
  backdropId: string;
  /** Optional intensity for the backdrop blur (0..1) — softer when
   *  more aggressive so the subject pops. Default 0.4. */
  blurIntensity?: number;
  /** Output dimensions. Default 1024×1024 — square crop suitable for
   *  profile photos and LinkedIn. */
  width?: number;
  height?: number;
}

export interface HeadshotResult {
  blob: Blob;
  previewUrl: string;
  engine: HeadshotEngineId;
  elapsedMs: number;
}

export interface HeadshotEngine {
  id: HeadshotEngineId;
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
 * Backdrop presets — single source of truth. The dialog renders each
 * as a card; the renderer reads by id. Adding a new backdrop is one
 * entry here; no per-backdrop UI code lives in the dialog.
 */
export interface BackdropPreset {
  id: string;
  label: string;
  /** CSS-style gradient applied behind the subject. Falls through to
   *  a flat fill when only one stop. */
  gradient: { from: string; to: string };
  /** When true, applies a vignette + soft blur over the gradient
   *  before compositing the subject — gives a "studio backdrop" feel. */
  studioBlur?: boolean;
}

export const BACKDROP_PRESETS: BackdropPreset[] = [
  { id: "studio-grey",   label: "Studio grey",     gradient: { from: "#6b7280", to: "#1f2937" }, studioBlur: true },
  { id: "studio-warm",   label: "Studio warm",     gradient: { from: "#92400e", to: "#1c1917" }, studioBlur: true },
  { id: "corporate-navy", label: "Corporate navy", gradient: { from: "#1e3a8a", to: "#0f172a" }, studioBlur: true },
  { id: "creative-teal",  label: "Creative teal",  gradient: { from: "#0d9488", to: "#083344" } },
  { id: "neutral-cream",  label: "Neutral cream",  gradient: { from: "#fef3c7", to: "#f5f5f4" } },
  { id: "speaker-spot",   label: "Speaker spotlight", gradient: { from: "#1e293b", to: "#020617" }, studioBlur: true },
];

export function getBackdropPreset(id: string): BackdropPreset {
  return BACKDROP_PRESETS.find((b) => b.id === id) ?? BACKDROP_PRESETS[0];
}

/** Pick the best engine. WebGPU first, WASM fallback. Single source
 *  of truth — every caller routes through here. */
export async function pickAvailableEngine(): Promise<HeadshotEngine> {
  const ordered: HeadshotEngineId[] = ["segformer-webgpu", "segformer-wasm"];
  for (const id of ordered) {
    const engine = ENGINES.get(id);
    if (!engine) continue;
    if (await engine.isAvailable()) return engine;
  }
  throw new Error("No headshot engine is available.");
}

export async function generateHeadshot(
  input: HeadshotInput,
  onProgress?: (p: number) => void,
): Promise<HeadshotResult> {
  const engine = await pickAvailableEngine();
  return engine.generate(input, onProgress);
}

// ---------------------------------------------------------------------------
// Engine: segmentation + composite — the only one that actually runs
// in transformers.js today. Two registrations under one body so the
// device flag (webgpu vs wasm) is the only thing that varies.
// ---------------------------------------------------------------------------

interface TransformersModule {
  env: { allowLocalModels: boolean; backends: { onnx: { wasm: { numThreads: number } } } };
  pipeline: (
    task: string,
    model: string,
    opts: Record<string, unknown>,
  ) => Promise<unknown>;
  RawImage: {
    fromBlob?: (b: Blob) => Promise<unknown>;
    read?: (s: string | Blob) => Promise<unknown>;
    fromCanvas?: (c: unknown) => Promise<unknown>;
  };
}

interface SegmentationOutput {
  /** One mask per detected class. Each `mask` is a single-channel
   *  RawImage; `score` is the model's confidence. */
  segments: Array<{ label: string; score: number; mask: RawImageLike }>;
}

interface RawImageLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  channels: number;
}

function dynamicImport<T>(url: string): Promise<T> {
  return new Function("u", "return import(u)")(url) as Promise<T>;
}

async function loadTransformers(): Promise<TransformersModule> {
  const url =
    "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js";
  const lib = await dynamicImport<TransformersModule>(url);
  lib.env.allowLocalModels = false;
  lib.env.backends.onnx.wasm.numThreads = 1;
  return lib;
}

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

async function runSegmentationGenerate(
  device: "webgpu" | "wasm",
  input: HeadshotInput,
  onProgress?: (p: number) => void,
): Promise<HeadshotResult> {
  const t0 = performance.now();
  onProgress?.(0);

  const transformers = await loadTransformers();
  onProgress?.(0.15);

  // Segformer is small (~14MB), reliable, and supports both webgpu
  // and wasm devices in transformers.js. ADE20K's "person" class
  // gives us the subject mask we need.
  const segmenter = await transformers.pipeline(
    "image-segmentation",
    "Xenova/segformer-b0-finetuned-ade-512-512",
    {
      device,
      progress_callback: (event: { progress?: number }) => {
        if (typeof event.progress === "number") {
          onProgress?.(0.15 + Math.min(0.55, event.progress * 0.55));
        }
      },
    },
  );
  onProgress?.(0.7);

  const image = await readImage(input.reference, transformers);

  const callable = segmenter as unknown as (img: unknown) => Promise<SegmentationOutput["segments"]>;
  const segments = await callable(image);

  onProgress?.(0.85);

  // Pick the mask labelled "person" with highest score; fall back to
  // the highest-scoring mask if none labels match (some models use
  // synonyms). When no usable mask emerges, we still produce output
  // (the original photo on the backdrop unmasked) rather than failing.
  const personSegment =
    segments
      .filter((s) => /person|human|man|woman/i.test(s.label))
      .sort((a, b) => b.score - a.score)[0]
    ?? segments.sort((a, b) => b.score - a.score)[0]
    ?? null;

  const blob = await composite({
    referenceBlob: input.reference,
    mask: personSegment?.mask ?? null,
    backdrop: input.backdropId,
    width: input.width ?? 1024,
    height: input.height ?? 1024,
  });
  const previewUrl = URL.createObjectURL(blob);
  onProgress?.(1);

  return {
    blob,
    previewUrl,
    engine: device === "webgpu" ? "segformer-webgpu" : "segformer-wasm",
    elapsedMs: performance.now() - t0,
  };
}

async function readImage(blob: Blob, transformers: TransformersModule): Promise<unknown> {
  if (transformers.RawImage.fromBlob) return transformers.RawImage.fromBlob(blob);
  if (transformers.RawImage.read) return transformers.RawImage.read(blob);
  throw new Error("transformers.js RawImage helper is unavailable");
}

registerHeadshotEngine({
  id: "segformer-webgpu",
  label: "Segformer · WebGPU",
  isAvailable: isWebGpuAdapterAvailable,
  generate: (input, onProgress) => runSegmentationGenerate("webgpu", input, onProgress),
});

registerHeadshotEngine({
  id: "segformer-wasm",
  label: "Segformer · WASM",
  async isAvailable() {
    return typeof WebAssembly !== "undefined";
  },
  generate: (input, onProgress) => runSegmentationGenerate("wasm", input, onProgress),
});

// ---------------------------------------------------------------------------
// Compositor — paint backdrop, soft-edge mask the subject, draw on top.
// Pure DOM canvas (no model dependency) so it runs on any browser.
// ---------------------------------------------------------------------------

async function composite({
  referenceBlob,
  mask,
  backdrop,
  width,
  height,
}: {
  referenceBlob: Blob;
  mask: RawImageLike | null;
  backdrop: string;
  width: number;
  height: number;
}): Promise<Blob> {
  const preset = getBackdropPreset(backdrop);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable for headshot composite");

  // 1. Backdrop fill.
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, preset.gradient.from);
  grad.addColorStop(1, preset.gradient.to);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  if (preset.studioBlur) {
    // Soft vignette to approximate a lit backdrop.
    const r = ctx.createRadialGradient(
      width * 0.5, height * 0.45, width * 0.1,
      width * 0.5, height * 0.5, Math.max(width, height) * 0.7,
    );
    r.addColorStop(0, "rgba(255,255,255,0.18)");
    r.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, width, height);
  }

  // 2. Load the user's photo.
  const img = await blobToImage(referenceBlob);
  const { dx, dy, dw, dh } = coverRect(img.naturalWidth, img.naturalHeight, width, height);

  if (!mask) {
    // No mask resolved — draw the whole photo on top so the user still
    // gets a usable composite. Surface the limitation via the
    // engine's badge in the dialog.
    ctx.drawImage(img, dx, dy, dw, dh);
    return canvasToBlob(canvas);
  }

  // 3. Subject layer using the mask. We render the photo into an
  // offscreen canvas, multiply alpha by the mask, then drawImage onto
  // the backdrop.
  const subject = document.createElement("canvas");
  subject.width = width;
  subject.height = height;
  const subjectCtx = subject.getContext("2d");
  if (!subjectCtx) throw new Error("Subject canvas context unavailable");
  subjectCtx.drawImage(img, dx, dy, dw, dh);

  const subjectImg = subjectCtx.getImageData(0, 0, width, height);
  applyMaskToImageData(subjectImg, mask);
  subjectCtx.putImageData(subjectImg, 0, 0);

  ctx.drawImage(subject, 0, 0);
  return canvasToBlob(canvas);
}

function applyMaskToImageData(imgData: ImageData, mask: RawImageLike): void {
  const { width, height } = imgData;
  const px = imgData.data;
  const mw = mask.width;
  const mh = mask.height;
  const mdata = mask.data;
  // Mask may be a different size than the canvas; sample with simple
  // nearest-neighbour. Channels: most segmentation masks are 1 channel
  // but we tolerate 3/4 by reading the first byte.
  const channels = mask.channels || 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const mx = Math.min(mw - 1, Math.round((x / width) * (mw - 1)));
      const my = Math.min(mh - 1, Math.round((y / height) * (mh - 1)));
      const mi = (my * mw + mx) * channels;
      const m = mdata[mi] / 255; // 0..1
      const i = (y * width + x) * 4;
      px[i + 3] = px[i + 3] * m;
    }
  }
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to decode reference image")); };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png",
    );
  });
}
