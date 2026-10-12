/**
 * Studio features — stock media library. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { and, eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { searchStockMedia, fetchAssetForHashing, mediaTypeFromMime, type StockMediaType } from "../../services/media/stockmedia.js";
import { cdnUrl } from "../../utils/cdn.js";
import { putObject } from "../../services/storage/object-store.js";
import { ok, fail, stockMediaAssets, userStockMediaUsage } from "./shared.js";

export const stockMediaRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  12. STOCK MEDIA LIBRARY (Unsplash + Pexels + Pixabay) — gap #128
// ██
// ██  Content-addressed dedup: search results stream live from provider APIs;
// ██  on pick we download once, hash the bytes (sha256), and only PUT to R2 if
// ██  no row already exists for that hash. Per-user picks recorded in
// ██  user_stock_media_usage so the same R2 object can back thousands of
// ██  projects without duplication.
// ═══════════════════════════════════════════════════════════════════════════════

function providerKeys(c: any) {
  return {
    unsplash: c.env.UNSPLASH_ACCESS_KEY as string | undefined,
    pexels:   c.env.PEXELS_API_KEY as string | undefined,
    pixabay:  c.env.PIXABAY_API_KEY as string | undefined,
  };
}

// GET /api/studio/stock/search?q=...&type=image|video&page=1&perPage=20
stockMediaRoutes.get("/stock/search", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q) return c.json(fail("VALIDATION_ERROR", "q query param is required"), 400);
  const typeParam = c.req.query("type") as StockMediaType | undefined;
  const mediaType: StockMediaType = (typeParam === "video" || typeParam === "audio") ? typeParam : "image";
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const perPage = Math.min(40, Math.max(1, parseInt(c.req.query("perPage") ?? "20", 10) || 20));

  const keys = providerKeys(c);
  if (!keys.unsplash && !keys.pexels && !keys.pixabay) {
    return c.json(fail("STOCK_UNAVAILABLE", "No stock media providers configured. Set UNSPLASH_ACCESS_KEY, PEXELS_API_KEY, or PIXABAY_API_KEY."), 503);
  }

  try {
    const response = await searchStockMedia(keys, { query: q, mediaType, page, perPage });
    return c.json(ok(response));
  } catch (err) {
    console.error("[stock/search] error:", err);
    return c.json(fail("STOCK_SEARCH_FAILED", `Stock media search failed: ${err}`), 500);
  }
});

// POST /api/studio/stock/pick — user selects an asset from search results.
// Body: { provider, providerAssetId, downloadUrl, mediaType, title?, description?,
//         author?, authorUrl?, licence, width?, height?, durationMs?, tags?,
//         projectId?, sceneId? }
//
// Dedup flow:
//   1. Look up by (provider, providerAssetId) — if found, skip download entirely.
//   2. Otherwise fetch the bytes, compute sha256, and check for an existing
//      row by hash (handles cross-provider duplicates of the same image).
//   3. Only PUT to R2 if neither lookup found a row.
//   4. Always insert a per-user usage row referencing the asset hash.
stockMediaRoutes.post("/stock/pick", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    provider:        z.enum(["unsplash", "pexels", "pixabay"]),
    providerAssetId: z.string().min(1),
    downloadUrl:     z.string().url(),
    mediaType:       z.enum(["image", "video", "audio"]).default("image"),
    title:           z.string().optional(),
    description:     z.string().optional(),
    author:          z.string().optional(),
    authorUrl:       z.string().optional(),
    licence:         z.string().min(1),
    width:           z.number().int().positive().optional(),
    height:          z.number().int().positive().optional(),
    durationMs:      z.number().int().nonnegative().optional(),
    tags:            z.array(z.string()).optional(),
    projectId:       z.string().optional(),
    sceneId:         z.string().optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  const p = parsed.data;
  const db = getDb();

  // Step 1: existing row by (provider, providerAssetId)?
  let asset = (await db
    .select()
    .from(stockMediaAssets)
    .where(and(
      eq(stockMediaAssets.provider, p.provider),
      eq(stockMediaAssets.providerAssetId, p.providerAssetId),
    ))
    .limit(1))[0];

  let dedup: "provider-id" | "hash" | "fresh" = "provider-id";

  if (!asset) {
    // Step 2: fetch + hash bytes
    let fetched;
    try {
      fetched = await fetchAssetForHashing(p.downloadUrl);
    } catch (err) {
      console.error("[stock/pick] download error:", err);
      return c.json(fail("STOCK_DOWNLOAD_FAILED", `Failed to download asset: ${err}`), 502);
    }

    // Step 2b: existing row by hash (cross-provider duplicate)?
    asset = (await db
      .select()
      .from(stockMediaAssets)
      .where(eq(stockMediaAssets.hash, fetched.hash))
      .limit(1))[0];

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
      if (!uploaded) {
        return c.json(fail("STORAGE_UNAVAILABLE", "Object storage not configured"), 503);
      }

      const inferredMediaType = mediaTypeFromMime(fetched.mimeType);
      const [inserted] = await db.insert(stockMediaAssets).values({
        hash:            fetched.hash,
        provider:        p.provider,
        providerAssetId: p.providerAssetId,
        mediaType:       inferredMediaType,
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
          provider: p.provider,
          author:   p.author ?? null,
          authorUrl: p.authorUrl ?? null,
          licence:  p.licence,
          sourceUrl: p.downloadUrl,
        },
        tags:            p.tags ?? [],
        pickCount:       0,
      } as any).returning();
      asset = inserted;
      dedup = "fresh";
    }
  }

  // Step 4: bump pick counter + record per-user usage
  await db.update(stockMediaAssets)
    .set({
      pickCount: sql`${stockMediaAssets.pickCount} + 1`,
      lastPickedAt: new Date(),
    } as any)
    .where(eq(stockMediaAssets.hash, asset.hash));

  await db.insert(userStockMediaUsage).values({
    userId:    user.sub,
    assetHash: asset.hash,
    projectId: p.projectId ?? null,
    sceneId:   p.sceneId ?? null,
  } as any);

  return c.json(ok({
    hash:      asset.hash,
    cdnUrl:    asset.cdnUrl,
    storageKey: asset.storageKey,
    mediaType: asset.mediaType,
    mimeType:  asset.mimeType,
    width:     asset.width,
    height:    asset.height,
    durationMs: asset.durationMs,
    attribution: asset.attributionJson,
    dedup,                      // "provider-id" | "hash" | "fresh"
    storageBytesSaved: dedup === "fresh" ? 0 : asset.sizeBytes,
  }), 201);
});

// GET /api/studio/stock/recent — current user's recently used stock assets
stockMediaRoutes.get("/stock/recent", async (c) => {
  const user = c.var.user;
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10) || 20));
  const db = getDb();

  const rows = await db
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
    .where(eq(userStockMediaUsage.userId, user.sub))
    .orderBy(desc(userStockMediaUsage.addedAt))
    .limit(limit);

  // Dedup by hash so the same asset appears once even if reused
  const seen = new Set<string>();
  const recent = rows.filter((r) => {
    if (seen.has(r.hash)) return false;
    seen.add(r.hash);
    return true;
  });

  return c.json(ok({ recent }));
});

// GET /api/studio/stock/stats — admin-ish dedup stats for the current user
stockMediaRoutes.get("/stock/stats", async (c) => {
  const user = c.var.user;
  const db = getDb();

  const usageRows = await db
    .select({
      hash:      userStockMediaUsage.assetHash,
      sizeBytes: stockMediaAssets.sizeBytes,
    })
    .from(userStockMediaUsage)
    .innerJoin(stockMediaAssets, eq(userStockMediaUsage.assetHash, stockMediaAssets.hash))
    .where(eq(userStockMediaUsage.userId, user.sub));

  const totalPicks = usageRows.length;
  const uniqueHashes = new Set(usageRows.map((r) => r.hash));
  const uniqueAssetCount = uniqueHashes.size;

  // Bytes that would have been stored without dedup vs. what is actually stored.
  const byHash = new Map<string, number>();
  for (const r of usageRows) byHash.set(r.hash, r.sizeBytes);
  const actualBytes = Array.from(byHash.values()).reduce((a, b) => a + b, 0);
  const naiveBytes = usageRows.reduce((a, r) => a + r.sizeBytes, 0);

  return c.json(ok({
    totalPicks,
    uniqueAssetCount,
    actualBytes,
    naiveBytes,
    bytesSaved: naiveBytes - actualBytes,
  }));
});
