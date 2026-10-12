/**
 * Push our internal campaign hierarchy to one or more platforms.
 *
 * Sync is synchronous on Cloudflare Workers (no long-running queue
 * model available in the open-source surface). For multi-platform fan
 * out we await Promise.allSettled — each platform call has a
 * timeout-bounded budget and writes its own paid_media_sync_runs row,
 * so a single failure never blocks the others.
 *
 * Idempotency: `syncCampaign(internalId, accountId)` is safe to call
 * repeatedly. The first call creates the platform resource and writes
 * a paid_media_platform_refs row; subsequent calls notice the existing
 * ref and switch to update mode.
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { getAdapter, type PaidMediaEnv } from "./ports/registry.js";
import type { PaidMediaPlatform } from "../../db/schema/paidmedia.js";
import type {
  AdapterAdInput,
  AdapterAdSetInput,
  AdapterCampaignInput,
  AdapterContext,
  AdapterCreativeInput,
  AdapterResourceRef,
  CampaignObjective,
  ResourceStatus,
} from "./ports/types.js";
import { resolveAccount } from "./sync-account.js";
import { findRef, recordSyncRun, upsertRef } from "./sync-ledger.js";

export interface SyncDeps {
  db?: ReturnType<typeof getDb>;
  env: PaidMediaEnv;
  /** Optional override for now() — tests pin time. */
  now?: () => Date;
}

// ─── Public sync entry points ─────────────────────────────────────────────
export interface SyncResult {
  platform: PaidMediaPlatform;
  accountId: string;
  externalId?: string;
  success: boolean;
  error?: string;
}

export async function syncCampaignToAccount(
  deps: SyncDeps,
  campaignId: string,
  accountId: string,
): Promise<SyncResult> {
  const d = deps.db ?? getDb();
  const [campaign] = await d.select().from(schema.paidMediaCampaigns).where(eq(schema.paidMediaCampaigns.id, campaignId)).limit(1);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  const acct = await resolveAccount(d, deps.env, accountId);
  const adapter = getAdapter(deps.env, acct.platform);

  const input: AdapterCampaignInput = {
    internalId:        campaign.id,
    name:              campaign.name,
    objective:         campaign.objective as CampaignObjective,
    status:            campaign.status as ResourceStatus,
    budgetCents:       campaign.budgetCents,
    dailyBudgetCents:  campaign.dailyBudgetCents,
    currencyCode:      campaign.currencyCode,
    startAt:           campaign.startAt,
    endAt:             campaign.endAt,
    metadata:          (campaign.metadata as Record<string, unknown>) ?? {},
  };

  const start = Date.now();
  const existing = await findRef(d, campaign.id, "campaign", accountId);
  try {
    let ref: AdapterResourceRef;
    const ctx: AdapterContext = { accessToken: acct.accessToken, externalAccountId: acct.externalAccountId, connectionId: acct.connectionId };
    if (existing) {
      ref = await adapter.updateCampaign(ctx, existing.externalId, input);
    } else {
      ref = await adapter.createCampaign(ctx, input);
    }
    await upsertRef(d, { platform: acct.platform, accountId, resourceKind: "campaign", internalId: campaign.id, externalId: ref.externalId });
    await recordSyncRun(d, { platform: acct.platform, accountId, direction: "push", operation: existing ? "update_campaign" : "create_campaign", resourceKind: "campaign", internalId: campaign.id, externalId: ref.externalId, request: input, response: ref.raw, success: true, durationMs: Date.now() - start });
    return { platform: acct.platform, accountId, externalId: ref.externalId, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncRun(d, { platform: acct.platform, accountId, direction: "push", operation: existing ? "update_campaign" : "create_campaign", resourceKind: "campaign", internalId: campaign.id, externalId: existing?.externalId, request: input, errorMessage: message, success: false, durationMs: Date.now() - start });
    if (existing) {
      await upsertRef(d, { platform: acct.platform, accountId, resourceKind: "campaign", internalId: campaign.id, externalId: existing.externalId, error: message });
    }
    return { platform: acct.platform, accountId, success: false, error: message };
  }
}

export async function syncAdSetToAccount(deps: SyncDeps, adSetId: string, accountId: string): Promise<SyncResult> {
  const d = deps.db ?? getDb();
  const [adSet] = await d.select().from(schema.paidMediaAdSets).where(eq(schema.paidMediaAdSets.id, adSetId)).limit(1);
  if (!adSet) throw new Error(`Ad set ${adSetId} not found`);
  const acct = await resolveAccount(d, deps.env, accountId);
  const adapter = getAdapter(deps.env, acct.platform);

  // Parent campaign must already be synced — look up its external id.
  const parentRef = await findRef(d, adSet.campaignId, "campaign", accountId);
  if (!parentRef) {
    return { platform: acct.platform, accountId, success: false, error: "Parent campaign not yet synced to this account — call syncCampaignToAccount first" };
  }

  const input: AdapterAdSetInput = {
    internalId:              adSet.id,
    externalCampaignId:      parentRef.externalId,
    name:                    adSet.name,
    status:                  adSet.status as ResourceStatus,
    bidStrategy:             adSet.bidStrategy,
    bidAmountCents:          adSet.bidAmountCents,
    optimizationGoal:        adSet.optimizationGoal,
    dailyBudgetCents:        adSet.dailyBudgetCents,
    lifetimeBudgetCents:     adSet.lifetimeBudgetCents,
    targeting:               (adSet.targeting as any) ?? {},
    frequencyCapImpressions: adSet.frequencyCapImpressions,
    frequencyCapHours:       adSet.frequencyCapHours,
    startAt:                 adSet.startAt,
    endAt:                   adSet.endAt,
  };

  const start = Date.now();
  const existing = await findRef(d, adSet.id, "ad_set", accountId);
  try {
    const ctx: AdapterContext = { accessToken: acct.accessToken, externalAccountId: acct.externalAccountId, connectionId: acct.connectionId };
    const ref = existing
      ? await adapter.updateAdSet(ctx, existing.externalId, input)
      : await adapter.createAdSet(ctx, input);
    await upsertRef(d, { platform: acct.platform, accountId, resourceKind: "ad_set", internalId: adSet.id, externalId: ref.externalId, externalParentId: parentRef.externalId });
    await recordSyncRun(d, { platform: acct.platform, accountId, direction: "push", operation: existing ? "update_ad_set" : "create_ad_set", resourceKind: "ad_set", internalId: adSet.id, externalId: ref.externalId, request: input, response: ref.raw, success: true, durationMs: Date.now() - start });
    return { platform: acct.platform, accountId, externalId: ref.externalId, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncRun(d, { platform: acct.platform, accountId, direction: "push", operation: existing ? "update_ad_set" : "create_ad_set", resourceKind: "ad_set", internalId: adSet.id, request: input, errorMessage: message, success: false, durationMs: Date.now() - start });
    return { platform: acct.platform, accountId, success: false, error: message };
  }
}

export async function syncCreativeToAccount(deps: SyncDeps, creativeId: string, accountId: string): Promise<SyncResult> {
  const d = deps.db ?? getDb();
  const [creative] = await d.select().from(schema.paidMediaCreatives).where(eq(schema.paidMediaCreatives.id, creativeId)).limit(1);
  if (!creative) throw new Error(`Creative ${creativeId} not found`);
  const acct = await resolveAccount(d, deps.env, accountId);
  const adapter = getAdapter(deps.env, acct.platform);

  const input: AdapterCreativeInput = {
    internalId:        creative.id,
    name:              creative.name,
    format:            creative.format as any,
    headline:          creative.headline,
    primaryText:       creative.primaryText,
    description:       creative.description,
    ctaText:           creative.ctaText,
    assetUrl:          creative.assetUrl,
    assetThumbnailUrl: creative.assetThumbnailUrl,
    assets:            (creative.assets as any) ?? [],
    metadata:          (creative.metadata as Record<string, unknown>) ?? {},
  };

  const start = Date.now();
  const existing = await findRef(d, creative.id, "creative", accountId);
  try {
    const ctx: AdapterContext = { accessToken: acct.accessToken, externalAccountId: acct.externalAccountId, connectionId: acct.connectionId };
    // No update path for creatives across most platforms — recreate when changed.
    const ref = await adapter.createCreative(ctx, input);
    // #978 — persist platform ids the adapter minted (e.g. the uploaded
    // TikTok video id) so the next sync reuses them instead of re-uploading.
    if (ref.metadataPatch) {
      await d.update(schema.paidMediaCreatives)
        .set({ metadata: { ...(input.metadata ?? {}), ...ref.metadataPatch }, updatedAt: new Date() })
        .where(eq(schema.paidMediaCreatives.id, creative.id));
    }
    await upsertRef(d, { platform: acct.platform, accountId, resourceKind: "creative", internalId: creative.id, externalId: ref.externalId });
    await recordSyncRun(d, { platform: acct.platform, accountId, direction: "push", operation: existing ? "recreate_creative" : "create_creative", resourceKind: "creative", internalId: creative.id, externalId: ref.externalId, request: input, response: ref.raw, success: true, durationMs: Date.now() - start });
    return { platform: acct.platform, accountId, externalId: ref.externalId, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncRun(d, { platform: acct.platform, accountId, direction: "push", operation: "create_creative", resourceKind: "creative", internalId: creative.id, request: input, errorMessage: message, success: false, durationMs: Date.now() - start });
    return { platform: acct.platform, accountId, success: false, error: message };
  }
}

export async function syncAdToAccount(deps: SyncDeps, adId: string, accountId: string): Promise<SyncResult> {
  const d = deps.db ?? getDb();
  const [ad] = await d.select().from(schema.paidMediaAds).where(eq(schema.paidMediaAds.id, adId)).limit(1);
  if (!ad) throw new Error(`Ad ${adId} not found`);
  const acct = await resolveAccount(d, deps.env, accountId);
  const adapter = getAdapter(deps.env, acct.platform);

  // Parent ad_set + creative must already be synced.
  const adSetRef    = await findRef(d, ad.adSetId, "ad_set", accountId);
  const creativeRef = ad.creativeId ? await findRef(d, ad.creativeId, "creative", accountId) : null;
  if (!adSetRef)    return { platform: acct.platform, accountId, success: false, error: "Parent ad set not yet synced" };
  if (!creativeRef) return { platform: acct.platform, accountId, success: false, error: "Linked creative not yet synced" };
  const [creative] = await d.select({ metadata: schema.paidMediaCreatives.metadata })
    .from(schema.paidMediaCreatives).where(eq(schema.paidMediaCreatives.id, ad.creativeId!)).limit(1);

  const input: AdapterAdInput = {
    internalId:         ad.id,
    externalAdSetId:    adSetRef.externalId,
    externalCreativeId: creativeRef.externalId,
    name:               ad.name,
    status:             ad.status as ResourceStatus,
    destinationUrl:     ad.destinationUrl,
    utmSource:          ad.utmSource,
    utmMedium:          ad.utmMedium,
    utmCampaign:        ad.utmCampaign,
    utmContent:         ad.utmContent,
    utmTerm:            ad.utmTerm,
    metadata:           (creative?.metadata as Record<string, unknown>) ?? {},
  };

  const start = Date.now();
  const existing = await findRef(d, ad.id, "ad", accountId);
  try {
    const ctx: AdapterContext = { accessToken: acct.accessToken, externalAccountId: acct.externalAccountId, connectionId: acct.connectionId };
    const ref = existing
      ? await adapter.updateAd(ctx, existing.externalId, input)
      : await adapter.createAd(ctx, input);
    await upsertRef(d, { platform: acct.platform, accountId, resourceKind: "ad", internalId: ad.id, externalId: ref.externalId, externalParentId: adSetRef.externalId });
    await recordSyncRun(d, { platform: acct.platform, accountId, direction: "push", operation: existing ? "update_ad" : "create_ad", resourceKind: "ad", internalId: ad.id, externalId: ref.externalId, request: input, response: ref.raw, success: true, durationMs: Date.now() - start });
    return { platform: acct.platform, accountId, externalId: ref.externalId, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncRun(d, { platform: acct.platform, accountId, direction: "push", operation: existing ? "update_ad" : "create_ad", resourceKind: "ad", internalId: ad.id, request: input, errorMessage: message, success: false, durationMs: Date.now() - start });
    return { platform: acct.platform, accountId, success: false, error: message };
  }
}

// Reporting pull + async-report resume live in sync-insights.ts.
export { pullInsightsFromAccount, resumePendingInsightReports } from "./sync-insights.js";
