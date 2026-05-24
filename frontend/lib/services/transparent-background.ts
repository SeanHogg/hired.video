/**
 * Transparent-background AI helpers — single source for "the user
 * asked for a transparent / no-background image; how do we deliver it?"
 *
 * Two entry points:
 *   - `detectTransparentIntent(prompt)` — keyword-based regex over the
 *     user's prompt. Used by `<DrawingAiPromptPanel/>` to auto-flip
 *     the transparent toggle when the user types "transparent
 *     background" / "no background" / "isolated subject" / "cut out".
 *   - `removeBackground(blob)` — runs the existing headshot-engine
 *     segmentation pipeline against the supplied blob and returns a
 *     PNG blob with the background pixels alpha-0. Reuses the
 *     transformers.js segformer model + the headshot engine's
 *     `composite()` (via the new `"transparent"` backdrop preset) so
 *     there's exactly ONE segmentation pipeline in the app — per the
 *     DRY rule (`feedback_extract_on_duplication`).
 */

import { generateHeadshot } from "./headshot-engine";

/** Keyword regex — covers the common ways users ask for a transparent
 *  output. Case-insensitive. False positives (e.g. "I love
 *  transparent design") are acceptable here — the worst-case
 *  consequence is running an extra segmentation pass on a result the
 *  user didn't want masked, which produces a still-usable layer (just
 *  with the foreground isolated). False negatives (missing a phrasing)
 *  are worse, so the regex is intentionally generous. */
const TRANSPARENT_INTENT_REGEX =
  /(transparent\s*background|no\s*background|isolated\s*(subject|on|figure)|cut[-\s]?out|alpha\s*channel|on\s*transparent|on\s*white\s*background)/i;

export function detectTransparentIntent(prompt: string): boolean {
  return TRANSPARENT_INTENT_REGEX.test(prompt);
}

/** Remove the background from an image blob via the existing segformer
 *  pipeline (WebGPU when available, WASM fallback). The output is a
 *  PNG blob sized to the supplied dimensions with background pixels
 *  alpha-0. When `width / height` aren't supplied, defaults to the
 *  source dimensions of the blob — we sniff via an HTMLImageElement.
 *
 *  Calls `generateHeadshot` with the new `"transparent"` backdrop
 *  preset; the headshot engine's `composite()` skips the gradient
 *  fill in that path so the masked subject lands on a transparent
 *  canvas. ONE segmentation pipeline; this is just a thin wrapper. */
export async function removeBackground(
  blob: Blob,
  opts: { width?: number; height?: number } = {},
): Promise<Blob> {
  // Resolve target dimensions — default to the source image's natural
  // size so we don't downscale unexpectedly. The headshot engine
  // expects width + height to draw the backdrop + subject; pass the
  // source dimensions when the caller doesn't specify.
  let width = opts.width;
  let height = opts.height;
  if (width === undefined || height === undefined) {
    const probed = await probeImageDimensions(blob);
    width = width ?? probed.width;
    height = height ?? probed.height;
  }
  const result = await generateHeadshot({
    reference: blob,
    backdropId: "transparent",
    width,
    height,
  });
  return result.blob;
}

async function probeImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to probe image dimensions"));
    };
    img.src = url;
  });
}
