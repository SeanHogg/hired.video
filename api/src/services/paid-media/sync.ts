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

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { decryptSecret } from "./secrets.js";
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

type DbHandle = ReturnType<typeof getDb>;

export interface SyncDeps {
  db?: DbHandle;
  env: PaidMediaEnv;
  /** Optional override for now() — tests pin time. */
  now?: () => Date;
}

interface ResolvedAccount {
  accountId: string;
  connectionId: string;
  platform: PaidMediaPlatform;
  externalAccountId: string;
  accessToken: string;
}

async function resolveAccount(d: DbHandle, env: PaidMediaEnv, accountId: string): Promise<ResolvedAccount> {
  const [account] = await d.select().from(schema.paidMediaAccounts).where(eq(schema.paidMediaAccounts.id, accountId)).limit(1);
  if (!account) throw new Error(`paid_media_accounts ${accountId} not found`);
  const [connection] = await d.select().from(schema.paidMediaConnections).where(eq(schema.paidMediaConnections.id, account.connectionId)).limit(1);
  if (!connection) throw new Error(`paid_media_connections ${account.connectionId} not found`);
  const accessToken = await ensureFreshToken(d, env, connection);
  return {
    accountId,
    connectionId: connection.id,
    platform:     account.platform as PaidMediaPlatform,
    externalAccountId: account.externalAccountId,
    accessToken,
  };
}

/** Decrypt the connection's access token and refresh it if expired
 *  (or about to expire within 60s). Persists the new token+expiry. */
async function ensureFreshToken(d: DbHandle, env: PaidMediaEnv, connection: typeof schema.paidMediaConnections.$inferSelect): Promise<string> {
  const now = Date.now();
  const expiresAt = connection.accessTokenExpiresAt ? connection.accessTokenExpiresAt.getTime() : null;
  if (expiresAt && expiresAt - now > 60_000) {
    return decryptSecret(env, connection.accessTokenEnc);
  }
  if (!connection.refreshTokenEnc) {
    // No refresh path — caller must reconnect. Mark expired so UI can prompt.
    if (connection.status !== "expired") {
      await d.update(schema.paidMediaConnections)
        .set({ status: "expired", lastError: "Access token expired and no refresh_token available", updatedAt: new Date() })
        .where(eq(schema.paidMediaConnections.id, connection.id));
    }
    return decryptSecret(env, connection.accessTokenEnc); // surface to adapter so the platform returns its own 401
  }
  const refreshToken = await decryptSecret(env, connection.refreshTokenEnc);
  const adapter = getAdapter(env, connection.platform as PaidMediaPlatform);
  const tokens = await adapter.refreshAccessToken(refreshToken);
  const { encryptSecret } = await import("./secrets.js");
  const accessTokenEnc = await encryptSecret(env, tokens.accessToken);
  const refreshTokenEnc = tokens.refreshToken ? await encryptSecret(env, tokens.refreshToken) : connection.refreshTokenEnc;
  await d.update(schema.paidMediaConnections)
    .set({
      accessTokenEnc,
      refreshTokenEnc,
      accessTokenExpiresAt: tokens.expiresAt,
      status:               "active",
      lastError:            null,
      updatedAt:            new Date(),
    })
    .where(eq(schema.paidMediaConnections.id, connection.id));
  return tokens.accessToken;
}

async function findRef(d: DbHandle, internalId: string, resourceKind: string, accountId: string): Promise<typeof schema.paidMediaPlatformRefs.$inferSelect | null> {
  const [row] = await d.select().from(schema.paidMediaPlatformRefs).where(
    and(
      eq(schema.paidMediaPlatformRefs.internalId, internalId),
      eq(schema.paidMediaPlatformRefs.resourceKind, resourceKind),
      eq(schema.paidMediaPlatformRefs.accountId, accountId),
    ),
  ).limit(1);
  return row ?? null;
}

async function upsertRef(
  d: DbHandle,
  args: {
    platform: PaidMediaPlatform;
    accountId: string;
    resourceKind: string;
    internalId: string;
    externalId: string;
    externalParentId?: string | null;
    error?: string | null;
  },
): Promise<void> {
  const existing = await findRef(d, args.internalId, args.resourceKind, args.accountId);
  if (existing) {
    await d.update(schema.paidMediaPlatformRefs)
      .set({
        externalId:       args.externalId,
        externalParentId: args.externalParentId ?? existing.externalParentId,
        syncStatus:       args.error ? "error" : "synced",
        lastSyncedAt:     new Date(),
        lastError:        args.error ?? null,
        updatedAt:        new Date(),
      })
      .where(eq(schema.paidMediaPlatformRefs.id, existing.id));
    return;
  }
  await d.insert(schema.paidMediaPlatformRefs).values({
    platform:         args.platform,
    accountId:        args.accountId,
    resourceKind:     args.resourceKind,
    internalId:       args.internalId,
    externalId:       args.externalId,
    externalParentId: args.externalParentId ?? null,
    syncStatus:       args.error ? "error" : "synced",
    lastSyncedAt:     new Date(),
    lastError:        args.error ?? null,
  } as any);
}

async function recordSyncRun(d: DbHandle, args: {
  platform: PaidMediaPlatform;
  accountId: string;
  direction: "push" | "pull";
  operation: string;
  resourceKind?: string;
  internalId?: string;
  externalId?: string;
  idempotencyKey?: string;
  request?: unknown;
  response?: unknown;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  durationMs: number;
}): Promise<void> {
  await d.insert(schema.paidMediaSyncRuns).values({
    platform:        args.platform,
    accountId:       args.accountId,
    direction:       args.direction,
    operation:       args.operation,
    resourceKind:    args.resourceKind ?? null,
    internalId:      args.internalId ?? null,
    externalId:      args.externalId ?? null,
    idempotencyKey:  args.idempotencyKey ?? null,
    requestPayload:  args.request ?? null,
    responsePayload: args.response ?? null,
    success:         args.success,
    errorCode:       args.errorCode ?? null,
    errorMessage:    args.errorMessage ?? null,
    durationMs:      args.durationMs,
  } as any);
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
  };

  const start = Date.now();
  const existing = await findRef(d, creative.id, "creative", accountId);
  try {
    const ctx: AdapterContext = { accessToken: acct.accessToken, externalAccountId: acct.externalAccountId, connectionId: acct.connectionId };
    // No update path for creatives across most platforms — recreate when changed.
    const ref = await adapter.createCreative(ctx, input);
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

/** Pull insights from a platform for a date range and persist into
 *  paid_media_insights. Caller passes externalIds (typically all
 *  campaign external IDs in the account). */
export async function pullInsightsFromAccount(deps: SyncDeps, args: {
  accountId: string;
  resourceKind: "campaign" | "ad_set" | "ad";
  externalIds?: string[];
  since: string;
  until: string;
}): Promise<{ count: number }> {
  const d = deps.db ?? getDb();
  const acct = await resolveAccount(d, deps.env, args.accountId);
  const adapter = getAdapter(deps.env, acct.platform);
  const start = Date.now();
  try {
    const ctx: AdapterContext = { accessToken: acct.accessToken, externalAccountId: acct.externalAccountId, connectionId: acct.connectionId };
    const rows = await adapter.pullInsights(ctx, { resourceKind: args.resourceKind, externalIds: args.externalIds, since: args.since, until: args.until });
    // Map externalId → internalId via paid_media_platform_refs.
    const refs = await d.select().from(schema.paidMediaPlatformRefs)
      .where(and(eq(schema.paidMediaPlatformRefs.accountId, args.accountId), eq(schema.paidMediaPlatformRefs.resourceKind, args.resourceKind)));
    const internalByExternal = new Map(refs.map((r) => [r.externalId, r.internalId]));
    for (const row of rows) {
      await d.insert(schema.paidMediaInsights).values({
        platform:     acct.platform,
        accountId:    args.accountId,
        resourceKind: row.resourceKind,
        internalId:   internalByExternal.get(row.externalId) ?? null,
        externalId:   row.externalId,
        date:         row.date,
        impressions:  row.impressions,
        clicks:       row.clicks,
        spendCents:   row.spendCents,
        conversions:  row.conversions,
        videoViews:   row.videoViews,
        rawMetrics:   row.rawMetrics,
      } as any).onConflictDoUpdate({
        target: [schema.paidMediaInsights.platform, schema.paidMediaInsights.externalId, schema.paidMediaInsights.resourceKind, schema.paidMediaInsights.date],
        set: {
          impressions:  row.impressions,
          clicks:       row.clicks,
          spendCents:   row.spendCents,
          conversions:  row.conversions,
          videoViews:   row.videoViews,
          rawMetrics:   row.rawMetrics,
          fetchedAt:    new Date(),
        },
      });
    }
    await recordSyncRun(d, { platform: acct.platform, accountId: args.accountId, direction: "pull", operation: "pull_insights", resourceKind: args.resourceKind, success: true, durationMs: Date.now() - start, response: { count: rows.length } });
    return { count: rows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncRun(d, { platform: acct.platform, accountId: args.accountId, direction: "pull", operation: "pull_insights", resourceKind: args.resourceKind, success: false, errorMessage: message, durationMs: Date.now() - start });
    throw err;
  }
}
