/**
 * #2396 — Serve one active internal creative for a named page slot.
 * Slot keys match InternalAdSlot (`dashboard-banner`, …). Viewer auth
 * is required (the advertising mount is behind JWT) but the row is NOT
 * owner-filtered — ads are shown TO the current user.
 */

import { Hono } from "hono";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { AppEnv } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";
import { placementsForSlot } from "../../services/advertising/slot-placements.js";
import { ok } from "./http.js";

export const advertisingServeRoutes = new Hono<AppEnv>();

advertisingServeRoutes.get("/serve", async (c) => {
  const slot = (c.req.query("slot") ?? "").trim();
  if (!slot) {
    return c.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "slot is required" } },
      400,
    );
  }

  const db = getDb();
  const placements = [...placementsForSlot(slot)];
  const rows = await db
    .select({
      id: schema.ads.id,
      headline: schema.ads.headline,
      description: schema.ads.description,
      imageUrl: schema.ads.imageUrl,
      ctaText: schema.ads.ctaText,
      ctaUrl: schema.ads.ctaUrl,
      destinationUrl: schema.ads.destinationUrl,
    })
    .from(schema.ads)
    .innerJoin(schema.adSets, eq(schema.ads.adSetId, schema.adSets.id))
    .where(
      and(
        eq(schema.ads.status, "active"),
        eq(schema.adSets.status, "active"),
        inArray(schema.adSets.placementType, placements),
      ),
    )
    .limit(1);

  const ad = rows[0] ?? null;
  if (ad) {
    await db
      .update(schema.ads)
      .set({ impressions: sql`${schema.ads.impressions} + 1`, updatedAt: new Date() } as any)
      .where(eq(schema.ads.id, ad.id));
  }
  return c.json(ok(ad));
});
