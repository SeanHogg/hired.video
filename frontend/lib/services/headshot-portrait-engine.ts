/**
 * Selfie-conditioned portrait engine (#290) — the "AI portrait" mode of the
 * headshot generator. Where the segformer engines cut the user out and
 * composite them onto a backdrop (their real photo, new background), this
 * one re-renders the selfie as a studio headshot: the selfie conditions an
 * img→img generation at moderate strength so the face and pose carry over
 * while lighting, attire and backdrop are regenerated.
 *
 * DRY: it does not talk to a model itself — it calls the shared image-gen
 * facade (`generateImage`, image-gen-engine.ts), whose server engine owns
 * img→img (token-metered, ai_usage_records). The facade is imported lazily
 * so the headshot dialog's first paint does not pull it in.
 *
 * Exported as a plain engine object (no self-registration) so
 * headshot-engine.ts can register it without an import cycle.
 */
import type { HeadshotEngine, HeadshotInput, HeadshotResult } from "./headshot-engine";

/** Denoise strength: low enough that the person is recognisably the same,
 *  high enough to replace lighting / clothes / background. */
export const PORTRAIT_STRENGTH = 0.45;
/** Longest edge sent to the server — keeps the data URL small. */
const MAX_SOURCE_EDGE = 768;

/** Prompt for a backdrop. Pure; exported for tests. */
export function buildPortraitPrompt(backdropLabel: string): string {
  return [
    "professional corporate headshot photograph of the same person",
    "head and shoulders, facing camera, natural confident expression",
    "soft studio lighting, sharp focus on the eyes, 85mm lens, shallow depth of field",
    "smart business attire",
    `${backdropLabel.toLowerCase()} studio backdrop`,
    "photorealistic, natural skin texture",
  ].join(", ");
}

async function blobToScaledDataUrl(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_SOURCE_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.9);
}

export const selfiePortraitEngine: HeadshotEngine = {
  id: "selfie-img2img",
  label: "AI portrait",
  mode: "portrait",
  async isAvailable() {
    return typeof document !== "undefined" && typeof createImageBitmap === "function";
  },
  async generate(input: HeadshotInput, onProgress?: (p: number) => void): Promise<HeadshotResult> {
    const t0 = performance.now();
    onProgress?.(0.05);
    const [{ generateImage }, { getBackdropPreset }] = await Promise.all([
      import("./image-gen-engine"),
      import("./headshot-engine"),
    ]);
    const sourceImageDataUrl = await blobToScaledDataUrl(input.reference);
    onProgress?.(0.2);
    const res = await generateImage(
      {
        prompt: buildPortraitPrompt(getBackdropPreset(input.backdropId).label),
        sourceImageDataUrl,
        strength: PORTRAIT_STRENGTH,
        width: input.width ?? 1024,
        height: input.height ?? 1024,
      },
      (p) => onProgress?.(0.2 + p * 0.8),
    );
    onProgress?.(1);
    return { blob: res.blob, previewUrl: res.previewUrl, engine: "selfie-img2img", elapsedMs: performance.now() - t0 };
  },
};
