/**
 * Recorder background image (#1787) — a picked photo turned into the bitmap
 * `applyBackgroundReplacement` draws behind the person.
 *
 * The compositor draws the bitmap full-frame, so a portrait phone photo would
 * be squashed into the 16:9 recording. We cover-crop it to 16:9 once here
 * (centred, like CSS `object-fit: cover`) and downscale to 1080p, so the
 * per-frame draw is a cheap blit with no distortion.
 */

/** Recorder output aspect (the viewport is `aspect-video`). */
export const BACKGROUND_ASPECT = 16 / 9;
/** Long edge of the stored bitmap; recordings are ≤1080p. */
export const BACKGROUND_WIDTH = 1920;
export const BACKGROUND_HEIGHT = Math.round(BACKGROUND_WIDTH / BACKGROUND_ASPECT);
/** Largest photo we try to decode (a 48 MP HEIC is ~15 MB). */
export const MAX_BACKGROUND_IMAGE_BYTES = 25 * 1024 * 1024;

export const DEFAULT_BLUR_PX = 18;
export const MIN_BLUR_PX = 4;
export const MAX_BLUR_PX = 40;
export const DEFAULT_BACKGROUND_COLOR = "#0b1020";

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** The centred source rectangle that fills `aspect` without distortion. */
export function coverCrop(srcWidth: number, srcHeight: number, aspect = BACKGROUND_ASPECT): CropRect {
  if (srcWidth <= 0 || srcHeight <= 0) return { sx: 0, sy: 0, sw: Math.max(0, srcWidth), sh: Math.max(0, srcHeight) };
  const srcAspect = srcWidth / srcHeight;
  if (srcAspect > aspect) {
    // Too wide: trim the sides.
    const sw = Math.round(srcHeight * aspect);
    return { sx: Math.round((srcWidth - sw) / 2), sy: 0, sw, sh: srcHeight };
  }
  // Too tall (or exact): trim top and bottom.
  const sh = Math.round(srcWidth / aspect);
  return { sx: 0, sy: Math.round((srcHeight - sh) / 2), sw: srcWidth, sh };
}

export type BackgroundImageError = "not_image" | "too_large" | "unreadable";

/** Whether a picked file can be tried as a background (MIME or extension). */
export function isBackgroundImageFile(file: Pick<File, "type" | "name">): boolean {
  if (file.type?.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(file.name ?? "");
}

/**
 * Decode + cover-crop a picked photo. Resolves the bitmap, or the reason it
 * can't be used (the caller shows a localized message).
 */
export async function loadBackgroundBitmap(
  file: File,
): Promise<{ bitmap: ImageBitmap } | { error: BackgroundImageError }> {
  if (!isBackgroundImageFile(file)) return { error: "not_image" };
  if (file.size > MAX_BACKGROUND_IMAGE_BYTES) return { error: "too_large" };
  if (typeof createImageBitmap !== "function") return { error: "unreadable" };
  let decoded: ImageBitmap;
  try {
    decoded = await createImageBitmap(file);
  } catch {
    return { error: "unreadable" };
  }
  try {
    const { sx, sy, sw, sh } = coverCrop(decoded.width, decoded.height);
    if (sw <= 0 || sh <= 0) return { error: "unreadable" };
    const bitmap = await createImageBitmap(decoded, sx, sy, sw, sh, {
      resizeWidth: Math.min(BACKGROUND_WIDTH, sw),
      resizeHeight: Math.min(BACKGROUND_HEIGHT, sh),
      resizeQuality: "high",
    });
    return { bitmap };
  } catch {
    return { error: "unreadable" };
  } finally {
    decoded.close();
  }
}
