// media-library.ts — the user's media library (#950) over `uploaded_assets`
// (#733): cursor-paginated, newest first, cached.
//
// Cache: isolate-local (getOrSetIsolateCached), keyed under a per-user prefix
// (media-library-cache.ts). Every recorded upload (object-store putObject)
// and every delete drops the prefix, so a new upload shows on the next read.
//
// Backfill: images uploaded before migration 0512 have no row. When a user's
// first page comes back empty, their pre-0512 image prefixes are listed once
// from R2 (one page each, bounded) and recorded, then the page is re-read.
// Once any row exists the R2 list never runs again for that user.

import {
  ASSET_PAGE_DEFAULT,
  ASSET_PAGE_MAX,
  IMAGE_ASSET_KINDS,
  decodeAssetCursor,
  encodeAssetCursor,
  isUploadedAssetKind,
  type UploadedAssetItem,
  type UploadedAssetKind,
  type UploadedAssetPage,
} from "../../../../shared/uploaded-assets.js";
import { getOrSetIsolateCached } from "../../utils/isolate-cache.js";
import { cdnUrl } from "../../utils/cdn.js";
import { getDb } from "../../db/index.js";
import {
  UploadedAssetsRepository,
  type IUploadedAssetsRepository,
} from "../../repositories/uploadedAssetsRepository.js";
import type { UploadedAssetRow } from "../../db/schema/uploadedAssets.js";
import { deriveAssetRecord, type AssetRecord } from "./asset-record.js";
import { invalidateMediaLibrary, mediaLibraryKeyPrefix } from "./media-library-cache.js";
import { getVideoBucket } from "./object-store.js";

const LIBRARY_TTL_SECONDS = 120;
/** Objects listed per pre-0512 prefix in the one-time backfill. */
const BACKFILL_LIST_LIMIT = 500;

/** Clamp a requested page size into [1, ASSET_PAGE_MAX]. */
export function clampAssetLimit(raw: unknown): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n) || n <= 0) return ASSET_PAGE_DEFAULT;
  return Math.min(Math.floor(n), ASSET_PAGE_MAX);
}

function toItem(row: UploadedAssetRow): UploadedAssetItem {
  return {
    id: row.id,
    key: row.r2Key,
    url: cdnUrl(row.r2Key),
    kind: row.kind as UploadedAssetKind,
    contentType: row.contentType,
    sizeBytes: Number(row.sizeBytes),
    width: row.width ?? null,
    height: row.height ?? null,
    sourceProjectId: row.sourceProjectId ?? null,
    uploadedAt: new Date(row.createdAt).toISOString(),
  };
}

export interface AssetPageRequest {
  userId: string;
  kinds: readonly UploadedAssetKind[];
  limit: number;
  cursor?: string | null;
}

/** Lists a user's pre-0512 objects as rows to record. */
export type LegacyAssetLister = (userId: string, kinds: readonly UploadedAssetKind[]) => Promise<
  Array<AssetRecord & { createdAt: Date }>
>;

export interface MediaLibraryDeps {
  repo: Pick<IUploadedAssetsRepository, "listPage" | "recordManyIfAbsent">;
  listLegacy?: LegacyAssetLister;
}

/** One page straight from the repository (uncached). An unreadable cursor
 *  restarts from the newest asset rather than erroring. */
export async function loadAssetPage(deps: MediaLibraryDeps, req: AssetPageRequest): Promise<UploadedAssetPage> {
  const { userId, kinds, limit, cursor } = req;
  const after = decodeAssetCursor(cursor);
  let rows = await deps.repo.listPage({ userId, kinds, limit, after });
  if (rows.length === 0 && !after && deps.listLegacy) {
    const legacy = await deps.listLegacy(userId, kinds);
    if (legacy.length > 0) {
      await deps.repo.recordManyIfAbsent(legacy);
      rows = await deps.repo.listPage({ userId, kinds, limit, after: null });
    }
  }
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(toItem),
    nextCursor: rows.length > limit && last ? encodeAssetCursor(new Date(last.createdAt), last.id) : null,
  };
}

/** Pre-0512 image prefixes (the only ones the old library listed). */
const LEGACY_PREFIXES: ReadonlyArray<{ folder: string; kind: UploadedAssetKind }> = [
  { folder: "images", kind: "image" },
  { folder: "ai-images", kind: "ai_image" },
];

/** R2-backed `LegacyAssetLister`: one bounded `list` per matching prefix. */
export const listLegacyR2Images: LegacyAssetLister = async (userId, kinds) => {
  const bucket = getVideoBucket();
  if (!bucket) return [];
  const prefixes = LEGACY_PREFIXES.filter((p) => kinds.includes(p.kind));
  const listed = await Promise.all(
    prefixes.map((p) => bucket.list({ prefix: `uploads/${userId}/${p.folder}/`, limit: BACKFILL_LIST_LIMIT })),
  );
  return listed.flatMap((res) =>
    res.objects.flatMap((obj) => {
      const record = deriveAssetRecord(obj.key, obj.httpMetadata?.contentType ?? "image/png", obj.size);
      return record ? [{ ...record, createdAt: new Date(obj.uploaded) }] : [];
    }),
  );
};

function defaultDeps(): MediaLibraryDeps {
  return { repo: new UploadedAssetsRepository(getDb()), listLegacy: listLegacyR2Images };
}

/** Cached library page for the signed-in user. */
export async function getAssetPage(
  req: AssetPageRequest,
  deps: MediaLibraryDeps = defaultDeps(),
): Promise<UploadedAssetPage> {
  const kinds = [...req.kinds].sort().join(",");
  return getOrSetIsolateCached({
    key: `${mediaLibraryKeyPrefix(req.userId)}${kinds}:${req.limit}:${req.cursor ?? ""}`,
    ttlSeconds: LIBRARY_TTL_SECONDS,
    loader: () => loadAssetPage(deps, req),
  });
}

/** Kinds a `?kind=` query selects. Unknown / absent → the image library. */
export function kindsForQuery(kind: string | undefined): readonly UploadedAssetKind[] {
  if (!kind || kind === "images") return IMAGE_ASSET_KINDS;
  return isUploadedAssetKind(kind) ? [kind] : IMAGE_ASSET_KINDS;
}

/** Drop the rows for objects the user deleted, and refresh their library. */
export async function forgetAssets(
  userId: string,
  keys: readonly string[],
  repo: Pick<IUploadedAssetsRepository, "deleteByKeys"> = new UploadedAssetsRepository(getDb()),
): Promise<void> {
  await repo.deleteByKeys(userId, keys);
  invalidateMediaLibrary(userId);
}
