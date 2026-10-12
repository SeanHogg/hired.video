/**
 * UploadedAssetsRepository — `uploaded_assets` (migration 0512, #733 / #950).
 *
 * One row per user-owned R2 object. Written by `putObject` (the one R2 write
 * path) via `record`; read by the media library with a keyset cursor over
 * `(created_at DESC, id DESC)`, which the composite index
 * `idx_uploaded_assets_user_kind_created` serves directly.
 *
 * Imports its table straight from the schema file so it works before the
 * coordinator adds the table to `db/schema/index.ts`.
 */
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { uploadedAssets, type UploadedAssetRow } from "../db/schema/uploadedAssets.js";
import type { UploadedAssetKind } from "../../../shared/uploaded-assets.js";
import type { AssetRecord } from "../services/storage/asset-record.js";

export type DbLike = any;

export interface AssetPageQuery {
  userId: string;
  kinds: readonly UploadedAssetKind[];
  limit: number;
  /** Rows strictly older than this `(createdAt, id)` position. */
  after?: { createdAt: Date; id: string } | null;
}

export interface IUploadedAssetsRepository {
  /** Insert, or refresh the row when the same key is written again. */
  record(asset: AssetRecord): Promise<void>;
  /** Bulk insert for the R2 backfill; rows whose key is already recorded are skipped. */
  recordManyIfAbsent(assets: readonly (AssetRecord & { createdAt?: Date })[]): Promise<void>;
  /** One page, newest first. Returns up to `limit + 1` rows so the caller
   *  can tell whether another page exists. */
  listPage(query: AssetPageQuery): Promise<UploadedAssetRow[]>;
  /** Owner-scoped removal (the user deleted the file). */
  deleteByKeys(userId: string, keys: readonly string[]): Promise<void>;
}

export class UploadedAssetsRepository implements IUploadedAssetsRepository {
  constructor(private readonly db: DbLike) {}

  async record(asset: AssetRecord): Promise<void> {
    await this.db
      .insert(uploadedAssets)
      .values(asset)
      .onConflictDoUpdate({
        target: uploadedAssets.r2Key,
        set: {
          kind: asset.kind,
          contentType: asset.contentType,
          sizeBytes: asset.sizeBytes,
          width: asset.width,
          height: asset.height,
          sourceProjectId: asset.sourceProjectId,
        },
      });
  }

  async recordManyIfAbsent(assets: readonly (AssetRecord & { createdAt?: Date })[]): Promise<void> {
    if (assets.length === 0) return;
    await this.db
      .insert(uploadedAssets)
      .values(assets.map((a) => ({ ...a })))
      .onConflictDoNothing({ target: uploadedAssets.r2Key });
  }

  async listPage({ userId, kinds, limit, after }: AssetPageQuery): Promise<UploadedAssetRow[]> {
    if (kinds.length === 0 || limit <= 0) return [];
    const scope = and(eq(uploadedAssets.userId, userId), inArray(uploadedAssets.kind, [...kinds]));
    const where = after
      ? and(
          scope,
          or(
            lt(uploadedAssets.createdAt, after.createdAt),
            and(eq(uploadedAssets.createdAt, after.createdAt), lt(uploadedAssets.id, after.id)),
          ),
        )
      : scope;
    return this.db
      .select()
      .from(uploadedAssets)
      .where(where)
      .orderBy(desc(uploadedAssets.createdAt), desc(uploadedAssets.id))
      .limit(limit + 1);
  }

  async deleteByKeys(userId: string, keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.db
      .delete(uploadedAssets)
      .where(and(eq(uploadedAssets.userId, userId), inArray(uploadedAssets.r2Key, [...keys])));
  }
}
