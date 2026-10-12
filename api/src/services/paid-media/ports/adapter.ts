/**
 * PaidMediaAdapter — the single interface every external ad-platform
 * adapter implements. The campaign service in `../campaigns.ts` never
 * imports a specific platform; it dispatches through `getAdapter()` in
 * `./registry.ts`.
 *
 * Open/Closed: adding a new platform = add a new adapter module + one
 * line in registry.ts. No service-layer changes.
 */

import type {
  AdapterAdInput,
  AdapterAdSetInput,
  AdapterCampaignInput,
  AdapterCapabilities,
  AdapterContext,
  AdapterCreativeInput,
  AdapterResourceRef,
  InsightsQuery,
  InsightsResult,
  ListedAdAccount,
  OAuthAuthUrlOptions,
  OAuthTokenSet,
  PaidMediaPlatform,
} from "./types.js";

export class PaidMediaAdapterError extends Error {
  constructor(
    public readonly platform: PaidMediaPlatform,
    public readonly code:
      | "NOT_CONFIGURED"
      | "OAUTH_FAILED"
      | "API_ERROR"
      | "RATE_LIMITED"
      | "PERMISSION_DENIED"
      | "RESOURCE_NOT_FOUND"
      | "VALIDATION_ERROR",
    message: string,
    public readonly details?: unknown,
  ) {
    super(`[${platform}] ${code}: ${message}`);
    this.name = "PaidMediaAdapterError";
  }
}

/** Per-adapter runtime configuration sourced from CF Worker env. */
export interface AdapterConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
  /** Optional vendor developer token (Google Ads, Bing). */
  developerToken?: string | undefined;
  /** Optional app id used in some redirect URIs. */
  appId?: string | undefined;
}

export interface PaidMediaAdapter {
  readonly platform: PaidMediaPlatform;
  readonly config: AdapterConfig;

  /** Static metadata for UI gating. */
  capabilities(): AdapterCapabilities;

  /** Is the adapter ready to make calls (credentials present)? */
  isConfigured(): boolean;

  // ── OAuth ───────────────────────────────────────────────────────────────
  buildAuthUrl(opts: OAuthAuthUrlOptions): string;
  exchangeAuthCode(code: string, redirectUri: string): Promise<OAuthTokenSet>;
  refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet>;

  // ── Account discovery (after OAuth) ────────────────────────────────────
  listAdAccounts(accessToken: string): Promise<ListedAdAccount[]>;

  // ── Campaign hierarchy ─────────────────────────────────────────────────
  createCampaign(ctx: AdapterContext, input: AdapterCampaignInput): Promise<AdapterResourceRef>;
  updateCampaign(
    ctx: AdapterContext,
    externalId: string,
    input: Partial<AdapterCampaignInput>,
  ): Promise<AdapterResourceRef>;
  deleteCampaign(ctx: AdapterContext, externalId: string): Promise<void>;

  createAdSet(ctx: AdapterContext, input: AdapterAdSetInput): Promise<AdapterResourceRef>;
  updateAdSet(
    ctx: AdapterContext,
    externalId: string,
    input: Partial<AdapterAdSetInput>,
  ): Promise<AdapterResourceRef>;
  /** `parent` carries the external campaign id for platforms whose delete
   *  is campaign-scoped (Microsoft Advertising DeleteAdGroups). */
  deleteAdSet(ctx: AdapterContext, externalId: string, parent?: { externalCampaignId: string }): Promise<void>;

  createCreative(ctx: AdapterContext, input: AdapterCreativeInput): Promise<AdapterResourceRef>;

  createAd(ctx: AdapterContext, input: AdapterAdInput): Promise<AdapterResourceRef>;
  updateAd(
    ctx: AdapterContext,
    externalId: string,
    input: Partial<AdapterAdInput>,
  ): Promise<AdapterResourceRef>;
  /** `parent` carries the external ad set id for platforms whose delete
   *  is ad-group-scoped (Microsoft Advertising DeleteAds). */
  deleteAd(ctx: AdapterContext, externalId: string, parent?: { externalAdSetId: string }): Promise<void>;

  // ── Reporting ──────────────────────────────────────────────────────────
  /** Rows, or a pending async report (see PendingInsights). */
  pullInsights(ctx: AdapterContext, query: InsightsQuery): Promise<InsightsResult>;
}

/** Convenience helper for adapters: wrap fetch with platform-aware
 *  error mapping. Adapters should NOT call fetch directly — they should
 *  call this so 401/403/429 turn into typed errors with consistent
 *  semantics. */
export async function adapterFetch(
  platform: PaidMediaPlatform,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const res = await fetch(url, init);
  if (res.ok) return res;
  const body = await res.text().catch(() => "");
  if (res.status === 401 || res.status === 403) {
    throw new PaidMediaAdapterError(platform, "PERMISSION_DENIED", `${res.status}: ${body.slice(0, 500)}`);
  }
  if (res.status === 404) {
    throw new PaidMediaAdapterError(platform, "RESOURCE_NOT_FOUND", body.slice(0, 500));
  }
  if (res.status === 429) {
    throw new PaidMediaAdapterError(platform, "RATE_LIMITED", body.slice(0, 500));
  }
  if (res.status >= 400 && res.status < 500) {
    throw new PaidMediaAdapterError(platform, "VALIDATION_ERROR", `${res.status}: ${body.slice(0, 500)}`);
  }
  throw new PaidMediaAdapterError(platform, "API_ERROR", `${res.status}: ${body.slice(0, 500)}`);
}
