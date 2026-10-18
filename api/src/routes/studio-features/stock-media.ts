/**
 * Studio features — stock media library. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { searchStockMedia, type StockMediaType } from "../../services/media/stockmedia.js";
import { getStockMediaStats, listRecentStockMedia, pickStockMedia } from "../../services/media/stock-pick.js";
import { clampLimit, parsePagination } from "../../utils/pagination.js";
import { logger } from "../../lib/logger.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";
import { requireUser } from "../helpers/routerHelpers.js";

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
  if (!q) return c.json(error("VALIDATION_ERROR", "q query param is required"), 400);
  const typeParam = c.req.query("type") as StockMediaType | undefined;
  const mediaType: StockMediaType = (typeParam === "video" || typeParam === "audio") ? typeParam : "image";
  const { page, limit: perPage } = parsePagination(c, { defaultLimit: 20, maxLimit: 40, limitKey: "perPage" });

  const keys = providerKeys(c);
  if (!keys.unsplash && !keys.pexels && !keys.pixabay) {
    return c.json(error("STOCK_UNAVAILABLE", "No stock media providers configured. Set UNSPLASH_ACCESS_KEY, PEXELS_API_KEY, or PIXABAY_API_KEY."), 503);
  }

  try {
    const response = await searchStockMedia(keys, { query: q, mediaType, page, perPage });
    return c.json(success(response));
  } catch (err) {
    logger.error("[stock/search] error", err);
    return c.json(error("STOCK_SEARCH_FAILED", `Stock media search failed: ${err}`), 500);
  }
});

// POST /api/studio/stock/pick — user selects an asset from search results.
// Body: { provider, providerAssetId, downloadUrl, mediaType, title?, description?,
//         author?, authorUrl?, licence, width?, height?, durationMs?, tags?,
//         projectId?, sceneId? }
// Dedup flow (provider-id → hash → fresh R2 PUT) lives in services/media/stock-pick.ts.
stockMediaRoutes.post("/stock/pick", validateJson(z.object({
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
  }), (e) => error("VALIDATION_ERROR", "Invalid request body", e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const picked = await pickStockMedia(userId, c.req.valid("json"));
  return c.json(success(picked), 201);
});

// GET /api/studio/stock/recent — current user's recently used stock assets
stockMediaRoutes.get("/stock/recent", async (c) => {
  const userId = requireUser(c);
  const limit = clampLimit(c.req.query("limit"), 20, 50);
  return c.json(success(await listRecentStockMedia(userId, limit)));
});

// GET /api/studio/stock/stats — admin-ish dedup stats for the current user
stockMediaRoutes.get("/stock/stats", async (c) => {
  return c.json(success(await getStockMediaStats(requireUser(c))));
});
