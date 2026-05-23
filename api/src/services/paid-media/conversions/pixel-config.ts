/**
 * Builds the public pixel configuration the frontend uses to inject
 * platform pixel snippets at runtime. Only PUBLIC IDs are exposed —
 * server-side access tokens are never returned by this endpoint.
 *
 * The frontend `lib/paid-media-pixels.ts` consumes this shape and
 * appends each platform's script tag to <head> when the corresponding
 * id is present.
 */

import { and, eq, isNull } from "drizzle-orm";
import type { getDb } from "../../../db/index.js";
import { schema } from "../../../db/index.js";

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
