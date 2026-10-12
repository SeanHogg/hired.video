/**
 * Platform-neutral types for paid media. Every adapter consumes and
 * produces these shapes — platform-specific request/response payloads
 * stay inside adapters/<platform>/.
 *
 * If you find yourself adding a field that only makes sense for one
 * platform, push it into `metadata` instead. Cross-platform parity is
 * the point of this layer.
 */

import type { PaidMediaPlatform } from "../../../db/schema/paidmedia.js";

export type { PaidMediaPlatform };

// ─── Objectives ────────────────────────────────────────────────────────────
export const CAMPAIGN_OBJECTIVES = [
  "AWARENESS",
  "TRAFFIC",
  "LEAD_GENERATION",
  "CONVERSIONS",
  "VIDEO_VIEWS",
  "APP_INSTALLS",
  "JOB_APPLICATIONS",
] as const;
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

// ─── Status ────────────────────────────────────────────────────────────────
export const RESOURCE_STATUS = ["draft", "active", "paused", "archived", "completed", "error"] as const;
export type ResourceStatus = (typeof RESOURCE_STATUS)[number];

// ─── Targeting (platform-neutral spec) ────────────────────────────────────
// Adapters translate the relevant subset into their platform's targeting
// DSL. Adapters MUST silently ignore fields they don't support — never
// throw on unknown keys — and report unsupported fields in
// `Adapter.describeCapabilities()` so the UI can warn the user.
export interface TargetingSpec {
  geo?: {
    countries?: string[];         // ISO 3166-1 alpha-2
    regions?: string[];           // platform-specific region IDs (resolved per platform)
    cities?: Array<{ name: string; country: string; radiusKm?: number }>;
  };
  demographics?: {
    ageMin?: number;              // 18-65
    ageMax?: number;
    genders?: Array<"male" | "female" | "all">;
    languages?: string[];         // BCP-47 codes
  };
  interests?: string[];           // platform-specific interest IDs
  behaviors?: string[];           // platform-specific behavior IDs
  jobTitles?: string[];           // LinkedIn-flavored; other adapters approximate
  industries?: string[];
  seniorities?: string[];
  skills?: string[];
  educationLevels?: string[];
  // Custom audiences referenced by paid_media_audiences.id
  customAudienceIds?: string[];
  lookalikeAudienceIds?: string[];
  excludeAudienceIds?: string[];
  // Placements (where the ad runs)
  placements?: Array<
    | "feed"
    | "stories"
    | "reels"
    | "search"
    | "display"
    | "youtube"
    | "audience_network"
    | "messenger"
    | "shorts"
    | "in_stream"
  >;
  devicePlatforms?: Array<"mobile" | "desktop" | "tablet" | "connected_tv">;
  operatingSystems?: Array<"ios" | "android" | "windows" | "macos">;
  dayparting?: Array<{ dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; startHour: number; endHour: number }>;
}

// ─── Domain projections passed to adapters ────────────────────────────────
// These are our internal model rows projected into the shape the adapter
// needs. The service layer in services/paid-media/campaigns.ts builds
// these projections — adapters don't read the DB themselves.

export interface AdapterContext {
  /** Encrypted-then-decrypted access token. Caller is responsible for refresh. */
  accessToken: string;
  /** External ad account id (e.g. "act_123" for Meta, "1234567890" for Google). */
  externalAccountId: string;
  /** Internal connection id, used for sync_runs audit trail. */
  connectionId: string;
  /** Adapter timezone-aware "now" — accept Date for testability. */
  now?: Date;
}

export interface AdapterCampaignInput {
  internalId: string;
  name: string;
  objective: CampaignObjective;
  status: ResourceStatus;
  budgetCents: number | null;
  dailyBudgetCents: number | null;
  currencyCode: string;
  startAt: Date | null;
  endAt: Date | null;
  metadata: Record<string, unknown>;
}

export interface AdapterAdSetInput {
  internalId: string;
  externalCampaignId: string;
  name: string;
  status: ResourceStatus;
  bidStrategy: string;
  bidAmountCents: number | null;
  optimizationGoal: string;
  dailyBudgetCents: number | null;
  lifetimeBudgetCents: number | null;
  targeting: TargetingSpec;
  frequencyCapImpressions: number | null;
  frequencyCapHours: number | null;
  startAt: Date | null;
  endAt: Date | null;
}

export interface AdapterCreativeInput {
  internalId: string;
  name: string;
  format: "single_image" | "single_video" | "carousel" | "collection" | "text";
  headline?: string | null;
  primaryText?: string | null;
  description?: string | null;
  ctaText: string;
  assetUrl?: string | null;
  assetThumbnailUrl?: string | null;
  assets: Array<{ url: string; thumbnailUrl?: string; headline?: string; description?: string; destinationUrl?: string }>;
  /** paid_media_creatives.metadata — platform ids cached from earlier
   *  syncs (e.g. TikTok video ids per advertiser, #978). */
  metadata?: Record<string, unknown>;
}

export interface AdapterAdInput {
  internalId: string;
  externalAdSetId: string;
  externalCreativeId: string;
  name: string;
  status: ResourceStatus;
  destinationUrl: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  /** The linked creative's metadata (platform ids such as the TikTok
   *  identity), so ad creation doesn't re-derive them. */
  metadata?: Record<string, unknown>;
}

// ─── Adapter results ──────────────────────────────────────────────────────
export interface AdapterResourceRef {
  externalId: string;
  /** Optional URL to the resource in the platform's admin UI. */
  externalUrl?: string;
  /** Raw response captured for sync_runs.response_payload. */
  raw?: unknown;
  /** Keys the sync service merges into the internal row's `metadata`
   *  (e.g. an uploaded TikTok video id, #978). */
  metadataPatch?: Record<string, unknown>;
}

export interface InsightRow {
  externalId: string;
  resourceKind: "campaign" | "ad_set" | "ad";
  date: string; // YYYY-MM-DD in account TZ
  impressions: number;
  clicks: number;
  spendCents: number;
  conversions: number;
  videoViews: number;
  rawMetrics: Record<string, unknown>;
}

export interface InsightsQuery {
  resourceKind: "campaign" | "ad_set" | "ad";
  /** Pull insights for these external resource IDs only. Empty/undefined = all in account. */
  externalIds?: string[];
  /** ISO date YYYY-MM-DD, inclusive. */
  since: string;
  /** ISO date YYYY-MM-DD, inclusive. */
  until: string;
  /** Async-report platforms (Microsoft Reporting v13): the report already
   *  submitted for this query on an earlier run — poll it instead of
   *  submitting a new one. */
  pendingReportId?: string;
}

/** An async report that isn't ready yet. The sync service records the id
 *  and a later run (POST /insights/pull or the resume sweep) polls it —
 *  adapters never block-poll inside one request (Workers Free). */
export interface PendingInsights {
  pending: true;
  reportRequestId: string;
}

export type InsightsResult = InsightRow[] | PendingInsights;

export function isPendingInsights(r: InsightsResult): r is PendingInsights {
  return !Array.isArray(r) && r.pending === true;
}

// ─── OAuth ────────────────────────────────────────────────────────────────
export interface OAuthAuthUrlOptions {
  redirectUri: string;
  state: string;
  /** Optional scope override. When omitted the adapter uses its default scope set. */
  scopes?: string[];
}

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string;
  /** Platform-side user identity captured during exchange. */
  externalUserId?: string;
  externalUserHandle?: string;
}

// ─── Listing platform ad accounts after OAuth ────────────────────────────
export interface ListedAdAccount {
  externalAccountId: string;
  name: string;
  currencyCode?: string;
  timeZone?: string;
  metadata?: Record<string, unknown>;
}

// ─── Capabilities (UI uses to warn about unsupported features) ───────────
export interface AdapterCapabilities {
  /** Which TargetingSpec keys actually carry through to the platform. */
  targeting: Array<keyof TargetingSpec>;
  /** Which CampaignObjectives this platform maps cleanly. */
  objectives: CampaignObjective[];
  /** Whether server-side conversions API is supported. */
  supportsConversions: boolean;
  /** Whether the adapter supports pulling reporting. */
  supportsReporting: boolean;
  /** Whether the adapter supports custom audience push. */
  supportsAudienceSync: boolean;
  /** Documentation URL for this platform's ad API. */
  docsUrl: string;
}
