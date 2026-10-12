/**
 * Builds the public pixel configuration the frontend uses to inject
 * platform pixel snippets at runtime. Only PUBLIC IDs are exposed —
 * server-side access tokens are never returned by this endpoint.
 *
 * The frontend `lib/paid-media-pixels.ts` consumes this shape and
 * appends each platform's script tag to <head> when the corresponding
 * id is present.
 */

import { and, asc, eq, isNull } from "drizzle-orm";
import type { getDb } from "../../../db/index.js";
import { schema } from "../../../db/index.js";
import { getOrSetCached, invalidateCachedKey } from "../../../utils/edge-cache.js";

type DbHandle = ReturnType<typeof getDb>;

export interface PublicPixelConfig {
  metaPixelId:               string | null;
  googleAdsConversionId:     string | null;
  googleAdsConversionLabel:  string | null;
  ga4MeasurementId:          string | null;
  linkedInPartnerId:         string | null;
  tiktokPixelId:             string | null;
  bingUetTagId:              string | null;
}

const EMPTY: PublicPixelConfig = {
  metaPixelId: null,
  googleAdsConversionId: null,
  googleAdsConversionLabel: null,
  ga4MeasurementId: null,
  linkedInPartnerId: null,
  tiktokPixelId: null,
  bingUetTagId: null,
};

/** Resolve the pixel config for a workspace. Returns the house
 *  (hired.video itself) config when companyId is null and userId is the
 *  configured HOUSE_USER_ID; otherwise the workspace's own config. */
export async function getPublicPixelConfig(
  db: DbHandle,
  workspaceUserId: string,
  workspaceCompanyId: string | null,
): Promise<PublicPixelConfig> {
  const [row] = await db
    .select()
    .from(schema.paidMediaPixels)
    .where(
      and(
        eq(schema.paidMediaPixels.userId, workspaceUserId),
        workspaceCompanyId
          ? eq(schema.paidMediaPixels.companyId, workspaceCompanyId)
          : isNull(schema.paidMediaPixels.companyId),
      ),
    )
    .limit(1);
  if (!row) return EMPTY;
  return {
    metaPixelId:              row.metaPixelId,
    googleAdsConversionId:    row.googleAdsConversionId,
    googleAdsConversionLabel: row.googleAdsConversionLabel,
    ga4MeasurementId:         row.ga4MeasurementId,
    linkedInPartnerId:        row.linkedInPartnerId,
    tiktokPixelId:            row.tiktokPixelId,
    bingUetTagId:             row.bingUetTagId,
  };
}

export type HousePixelConfig = PublicPixelConfig | { configured: false };

// The house config is read by the app shell on EVERY page load, so it is
// served through the canonical cache. Workspace-specific lookups (arbitrary
// public `workspaceUserId` query values) stay uncached on purpose: caching
// them would let any caller mint unbounded KV keys.
const HOUSE_CACHE_KEY = "paid-media:pixels:public:v1:house";
const HOUSE_CACHE_TTL_SECONDS = 300;

/** Drop the cached house config — call after any pixel-config write. Any
 *  write can change it: the fallback house row is "oldest companyId IS NULL". */
export function invalidateHousePixelConfig(): void {
  invalidateCachedKey(HOUSE_CACHE_KEY);
}

/** hired.video's own pixel config: the HOUSE_USER_ID workspace when set,
 *  otherwise the oldest personal (companyId IS NULL) pixel row. */
export function getHousePixelConfig(
  db: DbHandle,
  houseUserId: string | null,
): Promise<HousePixelConfig> {
  return getOrSetCached<HousePixelConfig>({
    key: HOUSE_CACHE_KEY,
    ttlSeconds: HOUSE_CACHE_TTL_SECONDS,
    loader: async () => {
      if (houseUserId) return getPublicPixelConfig(db, houseUserId, null);
      const [row] = await db
        .select({ userId: schema.paidMediaPixels.userId })
        .from(schema.paidMediaPixels)
        .where(isNull(schema.paidMediaPixels.companyId))
        .orderBy(asc(schema.paidMediaPixels.createdAt))
        .limit(1);
      if (!row) return { configured: false };
      return getPublicPixelConfig(db, row.userId, null);
    },
  });
}
