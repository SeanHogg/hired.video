/**
 * Résumé photo → an image every vision model accepts (#2230).
 *
 * iPhones shoot HEIC. Safari often transcodes it to JPEG on upload, but not
 * always (Files app, "Most Compatible" off, some in-app browsers), and several
 * vision vendors reject `image/heic` outright. Phone photos are also routinely
 * 4–12 MB, which is slow to upload on mobile and costs more vision tokens
 * than the model can use.
 *
 * So before upload we re-encode in the browser:
 *   - HEIC/HEIF → JPEG (always, when the browser can decode it — every iOS
 *     browser can; desktop Chrome can't, and then the original goes up and
 *     the server answers with its "use JPG/PNG" message);
 *   - any image over REENCODE_OVER_BYTES → JPEG with its long edge capped at
 *     MAX_EDGE_PX.
 * Everything else, and any decode/encode failure, passes through untouched.
 */

/** Long-edge cap. Vision models downsample past ~1.5–2k px anyway. */
export const MAX_EDGE_PX = 2400;
/** Non-HEIC images at or under this size upload as they are. */
export const REENCODE_OVER_BYTES = 4 * 1024 * 1024;
const JPEG_QUALITY = 0.88;

const HEIC_EXT_RE = /\.(heic|heif)$/i;

export function isHeicFile(file: Pick<File, "type" | "name">): boolean {
  return /^image\/hei[cf]/i.test(file.type ?? "") || HEIC_EXT_RE.test(file.name ?? "");
}

/** Scale `width`×`height` so the long edge is at most `maxEdge` (never upscales). */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge || longEdge <= 0) return { width, height };
  const scale = maxEdge / longEdge;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Whether this image should be re-encoded before upload. */
export function needsResumeImagePrep(file: Pick<File, "type" | "name" | "size">): boolean {
  return isHeicFile(file) || file.size > REENCODE_OVER_BYTES;
}

type Drawable = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decodeWithBitmap(file: Blob): Promise<Drawable | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    return null;
  }
}

/** `<img>` decode — Safari can show HEIC in an image element even where
 *  `createImageBitmap` declines it. */
async function decodeWithImageElement(file: Blob): Promise<Drawable | null> {
  if (typeof Image === "undefined" || typeof URL?.createObjectURL !== "function") return null;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) return null;
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => undefined };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function jpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "resume";
  return `${base}.jpg`;
}

/**
 * Returns a JPEG `File` when the photo needed (and survived) re-encoding,
 * otherwise the original file.
 */
export async function prepareResumeImage(file: File): Promise<File> {
  if (!needsResumeImagePrep(file) || typeof document === "undefined") return file;

  const drawable = (await decodeWithBitmap(file)) ?? (await decodeWithImageElement(file));
  if (!drawable) return file;
  try {
    const { width, height } = fitWithin(drawable.width, drawable.height, MAX_EDGE_PX);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // JPEG has no alpha: flatten transparent PNGs onto white, like paper.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(drawable.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size === 0) return file;
    // A small HEIC re-encode is the point; a non-HEIC one must actually shrink.
    if (!isHeicFile(file) && blob.size >= file.size) return file;
    return new File([blob], jpegName(file.name), { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    drawable.release();
  }
}
