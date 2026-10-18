/**
 * Paid-media tracking use cases — workspace pixel settings (public ids +
 * encrypted CAPI tokens), the public pixel config the app shell injects,
 * and server-side conversion recording. Backs /api/paid-media/{pixels,
 * pixels/public,conversions}.
 */

import { getDb } from "../../db/index.js";
import {
  PaidMediaPixelsRepository,
  type PaidMediaPixelInsert,
} from "../../repositories/paidMediaPixelsRepository.js";
import { resolveWorkspaceForWrite, type WorkspaceSelection } from "../studio/workspace.js";
import { encryptSecret } from "./secrets.js";
import type { PaidMediaEnv } from "./ports/registry.js";
import {
  getHousePixelConfig,
  getPublicPixelConfig,
  invalidateHousePixelConfig,
  type HousePixelConfig,
  type PublicPixelConfig,
} from "./conversions/pixel-config.js";
import { recordConversion, type ConversionEvent } from "./conversions/capi.js";

export interface PixelSettingsInput {
  metaPixelId?: string | null;
  googleAdsConversionId?: string | null;
  googleAdsConversionLabel?: string | null;
  ga4MeasurementId?: string | null;
  linkedInPartnerId?: string | null;
  tiktokPixelId?: string | null;
  bingUetTagId?: string | null;
  /** Secret tokens arrive in plaintext; encrypted before persist.
   *  undefined = keep, empty/null = clear. */
  metaCapiToken?: string | null;
  tiktokAccessToken?: string | null;
  linkedInCapiToken?: string | null;
  bingUetApiToken?: string | null;
  ga4ApiSecret?: string | null;
}

/** The workspace's pixel row with encrypted fields replaced by "is set" flags. */
export async function getPixelSettings(actorUserId: string, selection: WorkspaceSelection): Promise<Record<string, unknown>> {
  const ctx = await resolveWorkspaceForWrite(actorUserId, selection);
  const row = await new PaidMediaPixelsRepository(getDb()).findForOwner(ctx.ownerUserId, ctx.ownerCompanyId);
  if (!row) return { configured: false };
  const { metaCapiTokenEnc, tiktokAccessTokenEnc, linkedInCapiTokenEnc, bingUetApiTokenEnc, ga4ApiSecretEnc, ...safe } = row;
  return {
    configured: true,
    ...safe,
    metaCapiTokenSet:      Boolean(metaCapiTokenEnc),
    tiktokAccessTokenSet:  Boolean(tiktokAccessTokenEnc),
    linkedInCapiTokenSet:  Boolean(linkedInCapiTokenEnc),
    bingUetApiTokenSet:    Boolean(bingUetApiTokenEnc),
    ga4ApiSecretSet:       Boolean(ga4ApiSecretEnc),
  };
}

export async function savePixelSettings(
  env: PaidMediaEnv,
  actorUserId: string,
  selection: WorkspaceSelection,
  body: PixelSettingsInput,
): Promise<{ saved: true }> {
  const ctx = await resolveWorkspaceForWrite(actorUserId, selection);
  const values: PaidMediaPixelInsert = {
    userId:                   ctx.ownerUserId,
    companyId:                ctx.ownerCompanyId,
    metaPixelId:              body.metaPixelId ?? null,
    googleAdsConversionId:    body.googleAdsConversionId ?? null,
    googleAdsConversionLabel: body.googleAdsConversionLabel ?? null,
    ga4MeasurementId:         body.ga4MeasurementId ?? null,
    linkedInPartnerId:        body.linkedInPartnerId ?? null,
    tiktokPixelId:            body.tiktokPixelId ?? null,
    bingUetTagId:             body.bingUetTagId ?? null,
    updatedAt:                new Date(),
  };
  const seal = (v: string | null | undefined) => (v ? encryptSecret(env, v) : Promise.resolve(null));
  if (body.metaCapiToken !== undefined)     values.metaCapiTokenEnc     = await seal(body.metaCapiToken);
  if (body.tiktokAccessToken !== undefined) values.tiktokAccessTokenEnc = await seal(body.tiktokAccessToken);
  if (body.linkedInCapiToken !== undefined) values.linkedInCapiTokenEnc = await seal(body.linkedInCapiToken);
  if (body.bingUetApiToken !== undefined)   values.bingUetApiTokenEnc   = await seal(body.bingUetApiToken);
  if (body.ga4ApiSecret !== undefined)      values.ga4ApiSecretEnc      = await seal(body.ga4ApiSecret);
  await new PaidMediaPixelsRepository(getDb()).upsertForOwner(values);
  invalidateHousePixelConfig();
  return { saved: true };
}

/** Public pixel ids for a workspace; the (cached) house config when no
 *  workspace user is given — the app shell reads this on every page load. */
export function getPublicPixels(args: {
  houseUserId: string | null;
  workspaceUserId: string | null;
  workspaceCompanyId: string | null;
}): Promise<HousePixelConfig | PublicPixelConfig> {
  const db = getDb();
  if (!args.workspaceUserId) return getHousePixelConfig(db, args.houseUserId);
  return getPublicPixelConfig(db, args.workspaceUserId, args.workspaceCompanyId);
}

export function recordWorkspaceConversion(env: PaidMediaEnv, ev: ConversionEvent) {
  return recordConversion({ db: getDb(), env }, ev);
}
