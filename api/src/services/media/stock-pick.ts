/**
 * Stock-media library use cases (gap #128) — pick (content-addressed dedup),
 * recent picks, and per-user dedup stats.
 *
 * Pick dedup flow:
 *   1. Look up by (provider, providerAssetId) — if found, skip download entirely.
 *   2. Otherwise fetch the bytes, compute sha256, and check for an existing
 *      row by hash (handles cross-provider duplicates of the same image).
 *   3. Only PUT to R2 if neither lookup found a row.
 *   4. Always insert a per-user usage row referencing the asset hash.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { logger } from "../../lib/logger.js";
import { cdnUrl } from "../../utils/cdn.js";
import { putObject } from "../storage/object-store.js";
import { fetchAssetForHashing, mediaTypeFromMime, type FetchedAsset, type StockProvider } from "./stockmedia.js";
import {
  bumpStockAssetPick,
  findStockAssetByHash,
  findStockAssetByProviderId,
  insertStockAsset,
  insertStockMediaUsage,
  listRecentStockPicks,
  listStockPickSizes,
  type StockMediaAssetRow,
} from "../../repositories/stockMediaRepository.js";

export interface StockPickInput {
  provider: StockProvider;
  providerAssetId: string;
  downloadUrl: string;
  title?: string;
  description?: string;
  author?: string;
  authorUrl?: string;
  licence: string;
  width?: number;
  height?: number;
  durationMs?: number;
  tags?: string[];
  projectId?: string;
  sceneId?: string;
}

export type StockDedup = "provider-id" | "hash" | "fresh";

export async function pickStockMedia(userId: string, p: StockPickInput) {
  const db = getDb();

  // Step 1: existing row by (provider, providerAssetId)?
  let asset: StockMediaAssetRow | null = await findStockAssetByProviderId(db, p.provider, p.providerAssetId);
  let dedup: StockDedup = "provider-id";

  if (!asset) {
    // Step 2: fetch + hash bytes
    let fetched: FetchedAsset;
    try {
      fetched = await fetchAssetForHashing(p.downloadUrl);
    } catch (err) {
      logger.error("[stock/pick] download error", err);
      throw new DomainError(502, "STOCK_DOWNLOAD_FAILED", `Failed to download asset: ${err}`);
    }

    // Step 2b: existing row by hash (cross-provider duplicate)?
    asset = await findStockAssetByHash(db, fetched.hash);
    if (asset) {
      dedup = "hash";
    } else {
      // Step 3: PUT to R2 (only path that ever writes bytes)
      const uploaded = await putObject(
        fetched.storageKey,
        fetched.bytes,
        fetched.mimeType,
        { provider: p.provider, providerAssetId: p.providerAssetId, hash: fetched.hash },
      );
      if (!uploaded) throw new DomainError(503, "STORAGE_UNAVAILABLE", "Object storage not configured");

      asset = await insertStockAsset(db, {
        hash:            fetched.hash,
        provider:        p.provider,
        providerAssetId: p.providerAssetId,
        mediaType:       mediaTypeFromMime(fetched.mimeType),
        mimeType:        fetched.mimeType,
        sizeBytes:       fetched.sizeBytes,
        width:           p.width ?? null,
        height:          p.height ?? null,
        durationMs:      p.durationMs ?? null,
        storageKey:      fetched.storageKey,
        cdnUrl:          cdnUrl(fetched.storageKey),
        sourceUrl:       p.downloadUrl,
        title:           p.title ?? null,
        description:     p.description ?? null,
        author:          p.author ?? null,
        authorUrl:       p.authorUrl ?? null,
        licence:         p.licence,
        attributionJson: {
          provider:  p.provider,
          author:    p.author ?? null,
          authorUrl: p.authorUrl ?? null,
          licence:   p.licence,
          sourceUrl: p.downloadUrl,
        },
        tags:            p.tags ?? [],
        pickCount:       0,
      });
      dedup = "fresh";
    }
  }

  // Step 4: bump pick counter + record per-user usage
  await bumpStockAssetPick(db, asset.hash, new Date());
  await insertStockMediaUsage(db, {
    userId,
    assetHash: asset.hash,
    projectId: p.projectId ?? null,
    sceneId:   p.sceneId ?? null,
  });

  return {
    hash:       asset.hash,
    cdnUrl:     asset.cdnUrl,
    storageKey: asset.storageKey,
    mediaType:  asset.mediaType,
    mimeType:   asset.mimeType,
    width:      asset.width,
    height:     asset.height,
    durationMs: asset.durationMs,
    attribution: asset.attributionJson,
    dedup,
    storageBytesSaved: dedup === "fresh" ? 0 : asset.sizeBytes,
  };
}

/** The user's recently used stock assets, one entry per asset hash. */
export async function listRecentStockMedia(userId: string, limit: number) {
  const rows = await listRecentStockPicks(getDb(), userId, limit);
  // Dedup by hash so the same asset appears once even if reused
  const seen = new Set<string>();
  const recent = rows.filter((r) => {
    if (seen.has(r.hash)) return false;
    seen.add(r.hash);
    return true;
  });
  return { recent };
}

/** Bytes that would have been stored without dedup vs. what is actually stored. */
export async function getStockMediaStats(userId: string) {
  const usageRows = await listStockPickSizes(getDb(), userId);
  const byHash = new Map<string, number>();
  for (const r of usageRows) byHash.set(r.hash, r.sizeBytes);
  const actualBytes = Array.from(byHash.values()).reduce((a, b) => a + b, 0);
  const naiveBytes = usageRows.reduce((a, r) => a + r.sizeBytes, 0);
  return {
    totalPicks: usageRows.length,
    uniqueAssetCount: byHash.size,
    actualBytes,
    naiveBytes,
    bytesSaved: naiveBytes - actualBytes,
  };
}
