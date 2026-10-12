/**
 * Server-side scan copy for the explicit image scan. Vision models take
 * JPEG/PNG/WebP/GIF up to a few MB, and the Worker can't afford to base64 a
 * multi-MB file (10 ms CPU on Free) — so large or unsupported images (SVG,
 * HEIC, 4K drawings) are downscaled by the Cloudflare Images binding
 * (`IMAGES`, wrangler.toml) to a ≤ 1600 px JPEG, and the classifiers read
 * that copy. The verdict is still recorded against the original.
 *
 * No binding, or a transform failure → no copy → the image stays
 * unscreened (fails closed for public reach; private use is never blocked).
 * A SERVICE failure (Images not enabled, unauthorized, limit reached, 5xx,
 * binding broken) also raises a deduplicated SuperAdmin ops alert — one per
 * error class per window — so a disabled Images product doesn't silently
 * keep images off the public wall. A per-image INPUT failure (not an image,
 * too large, unsupported format) is that file's problem: logged, no alert,
 * and it never consumes the dedupe window a real outage needs.
 */
import type { ImageVariant } from "./imageClassifier.js";
import { raiseSuperAdminAlert } from "../../observability/superAdminAlert.js";

/** An original too large to buffer in the Worker, piped straight through. */
export interface StreamedImage {
  stream: ReadableStream<Uint8Array>;
  mime: string;
}

/** Downscale an image (bytes, or a stream of an oversize original) to a
 *  small JPEG; null when it can't. */
export type ImageDownscaler = (image: ImageVariant | StreamedImage) => Promise<ImageVariant | null>;

export const SCAN_COPY_MAX_EDGE = 1600;
/** Originals above this get a copy (it's also the Workers AI input cap). */
export const SCAN_COPY_THRESHOLD_BYTES = 1_000_000;
const DIRECT_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function needsScanCopy(image: ImageVariant): boolean {
  return image.bytes.byteLength > SCAN_COPY_THRESHOLD_BYTES || !DIRECT_MIMES.has(image.mime);
}

/** The slice of the Cloudflare Images binding this adapter uses. */
export interface ImagesTransformBinding {
  input(stream: ReadableStream<Uint8Array>): {
    transform(t: { width?: number; height?: number; fit?: "scale-down" }): {
      output(o: { format: "image/jpeg"; quality?: number }): Promise<{ image(): ReadableStream<Uint8Array> }>;
    };
  };
}

/** One alert per this window, however many images fail in it. */
export const DOWNSCALE_ALERT_WINDOW_SECONDS = 6 * 60 * 60;
export const DOWNSCALE_ALERT_KEY = "explicit-scan:images-downscale";

/**
 * Cloudflare Images error codes that describe the INPUT image, not the
 * service (developers.cloudflare.com/images/reference/troubleshooting):
 *   9402 image too large · 9412 not an image · 9413 exceeds max area ·
 *   9520 unsupported image format.
 * Conservative on purpose: any other code — or none — is treated as a
 * service failure and alerts.
 */
const INPUT_ERROR_CODES = new Set(["9402", "9412", "9413", "9520"]);
const INPUT_ERROR_PATTERN =
  /\b(not an image|unsupported (image )?format|image (is )?too large|exceeds (the )?max(imum)? (area|size|dimensions?))\b/i;

export type DownscaleErrorClass = { kind: "input" } | { kind: "service"; id: string };

/** Split a binding failure into a per-image input problem (no alert) and a
 *  service/binding/account problem (alert, keyed by `id`). */
export function classifyDownscaleError(err: unknown): DownscaleErrorClass {
  const message = err instanceof Error ? err.message : String(err);
  const code = /\b(9\d{3})\b/.exec(message)?.[1];
  if (code) return INPUT_ERROR_CODES.has(code) ? { kind: "input" } : { kind: "service", id: code };
  if (INPUT_ERROR_PATTERN.test(message)) return { kind: "input" };
  // A TypeError ("x is not a function") means the binding itself is broken.
  if (err instanceof TypeError) return { kind: "service", id: "binding" };
  return { kind: "service", id: "unknown" };
}

/** Called with the failure message and its error-class id when the binding
 *  hits a SERVICE failure (never for a per-image input error). */
export type DownscaleFailureHandler = (message: string, errorClass: string) => Promise<unknown>;

export const alertDownscaleFailure: DownscaleFailureHandler = (message, errorClass) =>
  raiseSuperAdminAlert({
    key: `${DOWNSCALE_ALERT_KEY}:${errorClass}`,
    windowSeconds: DOWNSCALE_ALERT_WINDOW_SECONDS,
    subject: `Explicit scan: Cloudflare Images downscale failing (${errorClass})`,
    message:
      `The Cloudflare Images binding (IMAGES) failed to make a scan copy [${errorClass}]: ${message}\n\n` +
      "Large (> 1 MB) and unsupported (SVG/HEIC) images get no scan copy, stay unscreened, " +
      "and are kept off public surfaces until this is fixed. Check that Cloudflare Images is " +
      "enabled on the hired-api account (ROADMAP #2356).",
  });

export function cloudflareImagesDownscaler(
  images: ImagesTransformBinding,
  onFailure: DownscaleFailureHandler = alertDownscaleFailure,
): ImageDownscaler {
  return async (image) => {
    try {
      const result = await images
        .input("stream" in image ? image.stream : (new Blob([image.bytes]).stream() as ReadableStream<Uint8Array>))
        .transform({ width: SCAN_COPY_MAX_EDGE, height: SCAN_COPY_MAX_EDGE, fit: "scale-down" })
        .output({ format: "image/jpeg", quality: 80 });
      const bytes = new Uint8Array(await new Response(result.image()).arrayBuffer());
      return bytes.byteLength > 0 ? { bytes, mime: "image/jpeg" } : null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errorClass = classifyDownscaleError(err);
      if (errorClass.kind === "input") {
        console.warn("[explicit-scan] Cloudflare Images rejected this image (no alert):", message);
        return null;
      }
      console.warn("[explicit-scan] Cloudflare Images downscale failed:", errorClass.id, message);
      await onFailure(message, errorClass.id).catch(() => undefined);
      return null;
    }
  };
}

/** The env's downscaler, or null when the IMAGES binding is missing. */
export function createImageDownscaler(env: { IMAGES?: unknown } | undefined): ImageDownscaler | null {
  const images = (env?.IMAGES ?? (globalThis as { __ENV?: { IMAGES?: unknown } }).__ENV?.IMAGES) as
    | ImagesTransformBinding
    | undefined;
  return images && typeof images.input === "function" ? cloudflareImagesDownscaler(images) : null;
}

/** Attach a server-made scan copy when the original needs one. */
export async function withScanCopy<T extends ImageVariant>(
  image: T,
  downscale: ImageDownscaler | null | undefined,
): Promise<T & { scanCopy?: ImageVariant }> {
  if (!downscale || !needsScanCopy(image)) return image;
  const copy = await downscale(image);
  return copy ? { ...image, scanCopy: copy } : image;
}
