/**
 * Stock-media aggregate persistence (gap #128) — the content-addressed
 * `stock_media_assets` catalog (one row per sha256) and the per-user
 * `user_stock_media_usage` pick ledger that references it. The pick use case
 * (services/media/stock-pick.ts) owns the dedup flow; this module owns the SQL.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { stockMediaAssets, userStockMediaUsage } = schema;

export type StockMediaAssetRow = typeof stockMediaAssets.$inferSelect;
export type StockMediaAssetInsert = typeof stockMediaAssets.$inferInsert;
export type StockMediaUsageInsert = typeof userStockMediaUsage.$inferInsert;

export async function findStockAssetByProviderId(
  db: Db,
  provider: string,
  providerAssetId: string,
): Promise<StockMediaAssetRow | null> {
  const [row] = await db
    .select()
    .from(stockMediaAssets)
    .where(and(eq(stockMediaAssets.provider, provider), eq(stockMediaAssets.providerAssetId, providerAssetId)))
    .limit(1);
  return row ?? null;
}

export async function findStockAssetByHash(db: Db, hash: string): Promise<StockMediaAssetRow | null> {
  const [row] = await db.select().from(stockMediaAssets).where(eq(stockMediaAssets.hash, hash)).limit(1);
  return row ?? null;
}

export async function insertStockAsset(db: Db, values: StockMediaAssetInsert): Promise<StockMediaAssetRow> {
  const [row] = await db.insert(stockMediaAssets).values(values).returning();
  return row;
}

/** Atomic `pick_count + 1` and `last_picked_at = now` for one asset. */
export async function bumpStockAssetPick(db: Db, hash: string, now: Date): Promise<void> {
  await db.update(stockMediaAssets)
    .set({ pickCount: sql`${stockMediaAssets.pickCount} + 1`, lastPickedAt: now })
    .where(eq(stockMediaAssets.hash, hash));
}

export async function insertStockMediaUsage(db: Db, values: StockMediaUsageInsert): Promise<void> {
  await db.insert(userStockMediaUsage).values(values);
}

/** The user's most recent picks joined to their assets (may repeat a hash). */
export async function listRecentStockPicks(db: Db, userId: string, limit: number) {
  return db
    .select({
      hash:       stockMediaAssets.hash,
      cdnUrl:     stockMediaAssets.cdnUrl,
      mediaType:  stockMediaAssets.mediaType,
      mimeType:   stockMediaAssets.mimeType,
      width:      stockMediaAssets.width,
      height:     stockMediaAssets.height,
      durationMs: stockMediaAssets.durationMs,
      title:      stockMediaAssets.title,
      author:     stockMediaAssets.author,
      licence:    stockMediaAssets.licence,
      addedAt:    userStockMediaUsage.addedAt,
    })
    .from(userStockMediaUsage)
    .innerJoin(stockMediaAssets, eq(userStockMediaUsage.assetHash, stockMediaAssets.hash))
    .where(eq(userStockMediaUsage.userId, userId))
    .orderBy(desc(userStockMediaUsage.addedAt))
    .limit(limit);
}

/** Every pick by the user with the picked asset's byte size. */
export async function listStockPickSizes(db: Db, userId: string): Promise<Array<{ hash: string; sizeBytes: number }>> {
  return db
    .select({ hash: userStockMediaUsage.assetHash, sizeBytes: stockMediaAssets.sizeBytes })
    .from(userStockMediaUsage)
    .innerJoin(stockMediaAssets, eq(userStockMediaUsage.assetHash, stockMediaAssets.hash))
    .where(eq(userStockMediaUsage.userId, userId));
}
