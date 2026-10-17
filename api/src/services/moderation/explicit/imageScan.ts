/**
 * Image explicit scan with a per-asset verdict cache:
 *
 *   scanUploadedImage   at upload (POST /api/upload/image …): bytes in hand.
 *   verdictForImageUrl  at publish: an asset the video uses, by URL.
 *
 * Both persist an `image` row keyed by the asset URL with the bytes' sha-256
 * as input_hash, so the same URL is never rescanned and the same photo
 * uploaded again at a new URL reuses the final verdict.
 */
import {
  ownerStatusOf,
  unscreenedVerdict,
  type ExplicitVerdict,
} from "../../../../../shared/moderation/explicit.js";
import { classifyImages, type ImageClassifier } from "./imageClassifier.js";
import { withScanCopy, type ImageDownscaler } from "./imageDownscaler.js";
import { sha256Hex } from "../../../utils/crypto.js";
import { findFinalByInputHash, getScan, upsertScan, type StoredScan } from "./contentScanRepository.js";
import { fetchPublicUrl, parseProxyTarget, readBytesOrStream } from "../../../utils/image-proxy.js";

export interface ImageScanDeps {
  classifiers: readonly ImageClassifier[];
  /** Cloudflare Images downscaler for large / unsupported images; null when
   *  the IMAGES binding is missing (those images then stay unscreened). */
  downscale?: ImageDownscaler | null;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

function toVerdict(scan: StoredScan): ExplicitVerdict {
  return { ...ownerStatusOf(scan), reason: scan.reason };
}

/**
 * `url` must already serve these bytes (the vision call reads it by URL).
 * Large / unsupported images are classified through a server-made scan copy
 * (Cloudflare Images — imageDownscaler.ts); the verdict is still recorded
 * against the ORIGINAL (its URL + the hash of its bytes). Without a usable
 * variant the image stays unscreened.
 */
export async function scanUploadedImage(
  args: { bytes: Uint8Array; mime: string; url: string; ownerUserId: string | null },
  deps: ImageScanDeps,
): Promise<ExplicitVerdict> {
  const inputHash = await sha256Hex(args.bytes);
  const cached = await findFinalByInputHash("image", inputHash);
  let verdict: ExplicitVerdict;
  if (cached) {
    verdict = toVerdict(cached);
  } else {
    const input = await withScanCopy(
      { bytes: args.bytes, mime: args.mime, url: /^https?:\/\//i.test(args.url) ? args.url : undefined },
      deps.downscale,
    );
    verdict = await classifyImages([input], deps.classifiers);
  }
  await upsertScan({ subjectType: "image", subjectId: args.url, ownerUserId: args.ownerUserId, verdict, inputHash });
  return verdict;
}

/** Originals up to this size are buffered, hashed and cached by their bytes
 *  — it covers every image a vision model can read by URL
 *  (MAX_SCAN_IMAGE_BYTES). */
const SCAN_BUFFER_BYTES = 4 * 1024 * 1024;
/** Larger originals (up to the largest upload, 32 MB) are never buffered:
 *  they stream straight into the Cloudflare Images binding for a scan copy. */
const SCAN_STREAM_BYTES = 32 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

export type FetchedScanImage =
  | { kind: "bytes"; bytes: Uint8Array; mime: string }
  | { kind: "stream"; stream: ReadableStream<Uint8Array>; mime: string }
  | { kind: "too_large"; mime: string };

/**
 * Fetch a user-supplied asset URL under the image-proxy rules (public
 * http(s) hosts only, every redirect hop re-checked — no SSRF) with a
 * streaming byte cap. Null when refused, failed, or not an image.
 */
export async function fetchScanImage(url: string, fetchImpl: typeof fetch = fetch): Promise<FetchedScanImage | null> {
  const target = parseProxyTarget(url);
  if (!target) return null;
  try {
    const res = await fetchPublicUrl(
      target,
      { headers: { Accept: "image/*" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
      fetchImpl,
    );
    if (!res) return null;
    const mime = (res.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    if (!res.ok || !mime.startsWith("image/")) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const body = await readBytesOrStream(res, SCAN_BUFFER_BYTES, SCAN_STREAM_BYTES);
    if (!body) return { kind: "too_large", mime };
    return body.kind === "bytes" ? { kind: "bytes", bytes: body.bytes, mime } : { kind: "stream", stream: body.stream, mime };
  } catch {
    return null;
  }
}

/** An oversize original: classified through a scan copy made from the
 *  stream (the original's bytes never sit in the Worker, so no hash). */
async function verdictForStreamedImage(
  image: { stream: ReadableStream<Uint8Array>; mime: string },
  deps: ImageScanDeps,
): Promise<ExplicitVerdict> {
  if (!deps.downscale) {
    await image.stream.cancel().catch(() => undefined);
    return unscreenedVerdict("image asset too large to scan");
  }
  const copy = await deps.downscale(image);
  if (!copy) return unscreenedVerdict("image asset too large to scan");
  return classifyImages([{ bytes: new Uint8Array(0), mime: image.mime, scanCopy: copy }], deps.classifiers);
}

/** The (cached) verdict for an image asset a public video uses. */
export async function verdictForImageUrl(
  url: string,
  ownerUserId: string | null,
  deps: ImageScanDeps,
): Promise<ExplicitVerdict> {
  const existing = await getScan("image", url);
  if (existing && (existing.overrideVerdict || existing.verdict !== "unscreened")) return toVerdict(existing);

  const image = await fetchScanImage(url, deps.fetchImpl ?? fetch);
  if (!image) return unscreenedVerdict("image asset could not be fetched");
  if (image.kind === "bytes") {
    return scanUploadedImage({ bytes: image.bytes, mime: image.mime, url, ownerUserId }, deps);
  }
  const verdict = image.kind === "stream"
    ? await verdictForStreamedImage(image, deps)
    : unscreenedVerdict("image asset too large to scan");
  await upsertScan({ subjectType: "image", subjectId: url, ownerUserId, verdict, inputHash: null });
  return verdict;
}
