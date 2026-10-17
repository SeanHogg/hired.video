/**
 * Upload-time image gate — every image upload (studio photos, thumbnails,
 * drawings, avatars, logos …) is scanned right after it is stored (the
 * vision model reads it by its public URL, which keeps the Worker from
 * base64-encoding multi-MB images).
 *
 *   block       → `discard()` deletes the stored object, then
 *                 ExplicitContentError (422, names the categories)
 *   pass        → kept
 *   unscreened  → kept (private use is never blocked); a video using it
 *                 can't reach the home wall until the asset is scanned
 *
 * Large or unsupported (SVG, HEIC …) images are scanned through a copy the
 * SERVER makes with the Cloudflare Images binding (imageDownscaler.ts); the
 * verdict is recorded against the original. No binding / failed transform →
 * unscreened (fails closed for public reach).
 *
 * A scan infrastructure failure (DB / classifier crash) never blocks the
 * upload — it's logged and the asset stays unscreened.
 */
import type { ExplicitVerdict } from "../../../../../shared/moderation/explicit.js";
import { createExplicitScanDeps, type ExplicitScanEnv } from "./deps.js";
import { ExplicitContentError } from "./errors.js";
import { scanUploadedImage } from "./imageScan.js";
import { logger } from "../../../lib/logger.js";

export async function assertImageUploadAllowed(
  args: {
    bytes: ArrayBuffer;
    mime: string;
    /** Public URL the stored object is served at. */
    url: string;
    ownerUserId: string;
    /** Removes the stored object when the image is blocked. */
    discard: () => Promise<unknown>;
  },
  env: ExplicitScanEnv | undefined,
): Promise<ExplicitVerdict | null> {
  let verdict: ExplicitVerdict;
  try {
    verdict = await scanUploadedImage(
      { bytes: new Uint8Array(args.bytes), mime: args.mime, url: args.url, ownerUserId: args.ownerUserId },
      createExplicitScanDeps(env),
    );
  } catch (err) {
    logger.error("[explicit-scan] image upload scan failed", err);
    return null;
  }
  if (verdict.verdict === "block") {
    await args.discard().catch((err) => logger.error("[explicit-scan] failed to discard blocked upload", err));
    throw new ExplicitContentError(verdict.categories, "image");
  }
  return verdict;
}
