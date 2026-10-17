// object-store.ts — the ONE accessor for the Worker's R2 bucket (VIDEO_BUCKET)
// and the ONE upload path into it.
//
// Every route used to resolve the binding itself (`globalThis.__ENV?.VIDEO_BUCKET`,
// ~20 copies) and three of them also carried an S3-client fallback for
// STORAGE_* credentials. The binding is always present on Workers, so that
// fallback never ran in production — it only made each of those route
// modules load the AWS SDK on first use, which on the Workers Free plan's
// 10 ms CPU budget was enough to kill the request (gap #2342). Interview
// answers used ONLY the S3 path, so with no STORAGE_* secrets they were
// silently never stored.
//
// Every write through here is also recorded in `uploaded_assets` (#733) when
// its key has a user owner, so the media library and cleanup read a table
// instead of listing R2.

import { getDb } from "../../db/index.js";
import { UploadedAssetsRepository } from "../../repositories/uploadedAssetsRepository.js";
import { deriveAssetRecord, type AssetRecord, type AssetRecordHint } from "./asset-record.js";
import { invalidateMediaLibrary } from "./media-library-cache.js";
import { readImageDimensions } from "./image-dimensions.js";
import { logger } from "../../lib/logger.js";

interface BucketEnv {
  VIDEO_BUCKET?: R2Bucket;
}

/**
 * The R2 bucket binding. Prefers a request's `c.env` when given (route tests
 * pass one); falls back to the env worker.ts stashes on `globalThis.__ENV`.
 */
export function getVideoBucket(env?: unknown): R2Bucket | undefined {
  return (env as BucketEnv | undefined)?.VIDEO_BUCKET
    ?? (globalThis as { __ENV?: BucketEnv }).__ENV?.VIDEO_BUCKET;
}

export interface ObjectStoreDeps {
  getBucket: () => R2Bucket | undefined;
  /** Record the `uploaded_assets` row for a user-owned write (#733). */
  recordAsset: (asset: AssetRecord) => Promise<void>;
}

/** Byte length of a body we can measure without consuming it. */
function knownByteLength(body: ArrayBuffer | ArrayBufferView | ReadableStream | string): number | null {
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  if (typeof body === "string") return new TextEncoder().encode(body).byteLength;
  return null;
}

/** Fill width/height from the image header when the caller didn't give them. */
function withImageDimensions(
  hint: AssetRecordHint | undefined,
  body: ArrayBuffer | ArrayBufferView | ReadableStream | string,
  contentType: string,
): AssetRecordHint | undefined {
  if (hint?.width || !contentType.startsWith("image/")) return hint;
  if (!(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body)) return hint;
  const dims = readImageDimensions(body);
  return dims ? { ...hint, ...dims } : hint;
}

/** Factory so tests can inject a bucket + recorder; production uses `putObject`. */
export function createObjectStore(deps: ObjectStoreDeps) {
  return {
    /**
     * Store an object in R2 and record it in `uploaded_assets` when the key
     * has a user owner (r2-keys conventions; see asset-record.ts). Returns
     * false (and logs) when no bucket is bound — local dev without wrangler —
     * so callers can degrade instead of throwing. A failed DB record never
     * fails the upload: the object is stored, the row is logged as missing.
     */
    async putObject(
      key: string,
      body: ArrayBuffer | ArrayBufferView | ReadableStream | string,
      contentType: string,
      metadata?: Record<string, string>,
      asset?: AssetRecordHint,
    ): Promise<boolean> {
      const bucket = deps.getBucket();
      if (!bucket) {
        logger.warn("[object-store] No R2 binding (VIDEO_BUCKET) — object not stored", { key });
        return false;
      }
      // Read the header + length before the put hands the body to R2.
      const hint = withImageDimensions(asset, body, contentType);
      const knownSize = knownByteLength(body);
      const stored = await bucket.put(key, body, { httpMetadata: { contentType }, customMetadata: metadata });
      const size = stored?.size ?? knownSize ?? 0;
      const record = deriveAssetRecord(key, contentType, size, hint);
      if (record) {
        try {
          await deps.recordAsset(record);
        } catch (err) {
          logger.warn("[object-store] uploaded_assets record failed", { key, error: err });
        }
      }
      return true;
    },
  };
}

async function recordAssetInDb(asset: AssetRecord): Promise<void> {
  const repo = new UploadedAssetsRepository(getDb());
  try {
    await repo.record(asset);
  } catch (err) {
    // A client-supplied project id that doesn't exist (FK) must not lose the
    // row: record it without the project link instead.
    if (!asset.sourceProjectId) throw err;
    await repo.record({ ...asset, sourceProjectId: null });
  }
  invalidateMediaLibrary(asset.userId);
}

const defaultStore = createObjectStore({ getBucket: () => getVideoBucket(), recordAsset: recordAssetInDb });

/** The ONE R2 write path. See `createObjectStore().putObject`. */
export const putObject: ReturnType<typeof createObjectStore>["putObject"] = (...args) =>
  defaultStore.putObject(...args);
