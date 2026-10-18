/**
 * Paid Media — external ad-platform integration (Meta, Google Ads,
 * LinkedIn, TikTok, Microsoft/Bing).
 *
 * Distinct from `advertising.ts` which models internal on-platform
 * promotion (search_top / discovery_feed boosts). These tables describe
 * campaigns that run on third-party ad networks.
 *
 * Ownership: every workspace-owned row carries (user_id, company_id)
 * gated by services/studio/workspace.ts → canActFor(). Personal/company
 * /delegated rows are filtered with buildOwnershipFilter(). SuperAdmin
 * uses a "house" workspace selection that resolves to (HOUSE_USER_ID, null).
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

/** Supported external ad networks. Adapters in
 *  services/paid-media/adapters/<platform>/ implement PaidMediaAdapter
 *  for each. */
export const PAID_MEDIA_PLATFORMS = ["meta", "google", "linkedin", "tiktok", "bing"] as const;
export type PaidMediaPlatform = (typeof PAID_MEDIA_PLATFORMS)[number];

// ─── Connections ────────────────────────────────────────────────────────────
// OAuth credentials per workspace per platform live in provider_connections
// (purpose "ads", W3-C migration 0600). Ids were kept, so
// paid_media_accounts.connection_id still names the same row.

// ─── Ad Accounts (one workspace may link many accounts per platform — agencies) ─
export const paidMediaAccounts = pgTable(
  "paid_media_accounts",
  {
    id:               uuid("id").primaryKey().defaultRandom(),
    connectionId:     uuid("connection_id").notNull(),
    userId:           uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    companyId:        uuid("company_id"),
    platform:         varchar("platform", { length: 16 }).notNull(),
    externalAccountId: text("external_account_id").notNull(), // act_XXXX (Meta), customer_id (Google), etc.
    name:             text("name").notNull(),
    currencyCode:     varchar("currency_code", { length: 8 }),
    timeZone:         varchar("time_zone", { length: 64 }),
    isPrimary:        boolean("is_primary").notNull().default(false),
    status:           varchar("status", { length: 24 }).notNull().default("active"),
    metadata:         jsonb("metadata").notNull().default("{}"),
    createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_paid_media_accounts_owner").on(t.userId, t.companyId),
    index("idx_paid_media_accounts_connection").on(t.connectionId),
    uniqueIndex("uq_paid_media_account_external").on(t.platform, t.externalAccountId, t.connectionId),
  ],
);

// ─── Campaign (platform-neutral) ───────────────────────────────────────────
// One row per logical campaign — may be pushed to multiple platforms via
// paid_media_platform_refs.
export const paidMediaCampaigns = pgTable(
  "paid_media_campaigns",
  {
    id:                 uuid("id").primaryKey().defaultRandom(),
    userId:             uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    companyId:          uuid("company_id"),
    name:               text("name").notNull(),
    // platform-neutral objective; adapters translate to platform-specific
    // values. AWARENESS | TRAFFIC | LEAD_GENERATION | CONVERSIONS |
    // VIDEO_VIEWS | APP_INSTALLS | JOB_APPLICATIONS (hired.video-specific).
    objective:          varchar("objective", { length: 32 }).notNull().default("TRAFFIC"),
    status:             varchar("status", { length: 24 }).notNull().default("draft"),
    // Total budget in MINOR CURRENCY UNITS (cents). Adapter converts to
    // platform's required scale.
    budgetCents:        bigint("budget_cents", { mode: "number" }),
    dailyBudgetCents:   bigint("daily_budget_cents", { mode: "number" }),
    spentCents:         bigint("spent_cents", { mode: "number" }).notNull().default(0),
    currencyCode:       varchar("currency_code", { length: 8 }).notNull().default("USD"),
    startAt:            timestamp("start_at", { withTimezone: true }),
    endAt:              timestamp("end_at", { withTimezone: true }),
    // Optional link to a hired.video subject this campaign promotes
    // (job posting, company page, creator profile, studio project).
    // subjectType + subjectId are intentionally a polymorphic loose
    // reference to match boosts.subject_type — no DB-level FK.
    subjectType:        varchar("subject_type", { length: 32 }),
    subjectId:          uuid("subject_id"),
    notes:              text("notes"),
    metadata:           jsonb("metadata").notNull().default("{}"),
    createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_paid_media_campaigns_owner").on(t.userId, t.companyId),
    index("idx_paid_media_campaigns_status").on(t.status),
    index("idx_paid_media_campaigns_subject").on(t.subjectType, t.subjectId),
    check("paid_media_campaigns_objective_check", sql`${t.objective} IN ('AWARENESS', 'TRAFFIC', 'LEAD_GENERATION', 'CONVERSIONS', 'VIDEO_VIEWS', 'APP_INSTALLS', 'JOB_APPLICATIONS')`),
    check("paid_media_campaigns_status_check", sql`${t.status} IN ('draft', 'active', 'paused', 'completed', 'archived')`),
    check("paid_media_campaigns_spent_cents_nonneg", sql`${t.spentCents} >= 0`),
    check("paid_media_campaigns_budget_cents_nonneg", sql`${t.budgetCents} IS NULL OR ${t.budgetCents} >= 0`),
    check("paid_media_campaigns_subject_type_check", sql`${t.subjectType} IS NULL OR ${t.subjectType} IN ('job', 'company', 'service', 'voice_clone', 'video', 'article', 'template', 'resume', 'event', 'studio_project', 'user_profile')`),
  ],
);

// ─── Ad Sets / Ad Groups ───────────────────────────────────────────────────
export const paidMediaAdSets = pgTable(
  "paid_media_ad_sets",
  {
    id:                uuid("id").primaryKey().defaultRandom(),
    campaignId:        uuid("campaign_id").notNull().references(() => paidMediaCampaigns.id, { onDelete: "cascade" }),
    userId:            uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    companyId:         uuid("company_id"),
    name:              text("name").notNull(),
    status:            varchar("status", { length: 24 }).notNull().default("draft"),
    // Bidding
    bidStrategy:       varchar("bid_strategy", { length: 32 }).notNull().default("AUTO"), // AUTO | LOWEST_COST | COST_CAP | TARGET_CPA | MANUAL_CPC
    bidAmountCents:    bigint("bid_amount_cents", { mode: "number" }),
    optimizationGoal:  varchar("optimization_goal", { length: 32 }).notNull().default("LINK_CLICKS"),
    // Budget at ad-set level (may be null when budget lives on campaign)
    dailyBudgetCents:  bigint("daily_budget_cents", { mode: "number" }),
    lifetimeBudgetCents: bigint("lifetime_budget_cents", { mode: "number" }),
    // Platform-neutral targeting spec — adapters translate to each
    // platform's targeting DSL. Shape documented in
    // services/paid-media/ports/types.ts (TargetingSpec).
    targeting:         jsonb("targeting").notNull().default("{}"),
    frequencyCapImpressions: integer("frequency_cap_impressions"),
    frequencyCapHours: integer("frequency_cap_hours"),
    startAt:           timestamp("start_at", { withTimezone: true }),
    endAt:             timestamp("end_at", { withTimezone: true }),
    createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_paid_media_ad_sets_campaign").on(t.campaignId),
    index("idx_paid_media_ad_sets_owner").on(t.userId, t.companyId),
  ],
);

// ─── Ads ───────────────────────────────────────────────────────────────────
export const paidMediaAds = pgTable(
  "paid_media_ads",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    adSetId:      uuid("ad_set_id").notNull().references(() => paidMediaAdSets.id, { onDelete: "cascade" }),
    userId:       text("user_id").notNull(),
    companyId:    uuid("company_id"),
    name:         text("name").notNull(),
    status:       varchar("status", { length: 24 }).notNull().default("draft"),
    creativeId:   uuid("creative_id"),                  // FK to paid_media_creatives — added in next migration after creatives table created
    destinationUrl: text("destination_url").notNull(),  // supports {CAMPAIGN_ID}, {AD_SET_ID}, {AD_ID}, {PLATFORM}, {CLICK_ID} macros
    utmSource:    text("utm_source"),
    utmMedium:    text("utm_medium"),
    utmCampaign:  text("utm_campaign"),
    utmContent:   text("utm_content"),
    utmTerm:      text("utm_term"),
    variantGroup: varchar("variant_group", { length: 16 }), // A | B | C ... — for A/B/n testing within an ad set
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_paid_media_ads_ad_set").on(t.adSetId),
    index("idx_paid_media_ads_owner").on(t.userId, t.companyId),
    index("idx_paid_media_ads_creative").on(t.creativeId),
  ],
);

// ─── Creatives (reusable asset + copy bundles) ────────────────────────────
export const paidMediaCreatives = pgTable(
  "paid_media_creatives",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    userId:       text("user_id").notNull(),
    companyId:    uuid("company_id"),
    name:         text("name").notNull(),
    // single_image | single_video | carousel | collection | text
    format:       varchar("format", { length: 24 }).notNull().default("single_image"),
    headline:     text("headline"),
    primaryText:  text("primary_text"),
    description:  text("description"),
    ctaText:      varchar("cta_text", { length: 32 }).notNull().default("LEARN_MORE"),
    // Primary asset URL (R2/S3). For carousel/collection, see assets[].
    assetUrl:     text("asset_url"),
    assetThumbnailUrl: text("asset_thumbnail_url"),
    // Optional binding to a hired.video studio project so creator-edited
    // videos can flow into campaigns without re-uploading.
    studioProjectId: uuid("studio_project_id"),
    // assets: Array<{ url; thumbnailUrl?; headline?; description?; destinationUrl? }>
    assets:       jsonb("assets").notNull().default("[]"),
    metadata:     jsonb("metadata").notNull().default("{}"),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_paid_media_creatives_owner").on(t.userId, t.companyId),
    index("idx_paid_media_creatives_studio_project").on(t.studioProjectId),
  ],
);

// ─── Platform Refs (our_id ↔ platform external_id mapping) ────────────────
// Lets a single internal campaign/ad-set/ad/creative fan out to N
// platforms. Resource kinds: "campaign" | "ad_set" | "ad" | "creative".
export const paidMediaPlatformRefs = pgTable(
  "paid_media_platform_refs",
  {
    id:               uuid("id").primaryKey().defaultRandom(),
    platform:         varchar("platform", { length: 16 }).notNull(),
    accountId:        uuid("account_id").notNull().references(() => paidMediaAccounts.id, { onDelete: "cascade" }),
    resourceKind:     varchar("resource_kind", { length: 16 }).notNull(), // campaign | ad_set | ad | creative | audience
    internalId:       uuid("internal_id").notNull(),
    externalId:       text("external_id").notNull(),
    externalParentId: text("external_parent_id"),
    syncStatus:       varchar("sync_status", { length: 24 }).notNull().default("pending"), // pending | synced | error | deleted
    lastSyncedAt:     timestamp("last_synced_at", { withTimezone: true }),
    lastError:        text("last_error"),
    createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_paid_media_ref_internal_account").on(t.internalId, t.resourceKind, t.accountId),
    index("idx_paid_media_refs_external").on(t.platform, t.externalId),
    index("idx_paid_media_refs_account").on(t.accountId),
  ],
);

// ─── Sync Runs (audit + idempotency) ──────────────────────────────────────
export const paidMediaSyncRuns = pgTable(
  "paid_media_sync_runs",
  {
    id:             uuid("id").primaryKey().defaultRandom(),
    userId:         text("user_id"),
    companyId:      uuid("company_id"),
    platform:       varchar("platform", { length: 16 }).notNull(),
    accountId:      uuid("account_id"),
    direction:      varchar("direction", { length: 8 }).notNull(), // push | pull
    operation:      varchar("operation", { length: 32 }).notNull(), // create_campaign | update_ad_set | pull_insights | ...
    resourceKind:   varchar("resource_kind", { length: 16 }),
    internalId:     uuid("internal_id"),
    externalId:     text("external_id"),
    idempotencyKey: text("idempotency_key"),
    requestPayload: jsonb("request_payload"),
    responsePayload: jsonb("response_payload"),
    success:        boolean("success").notNull(),
    errorCode:      text("error_code"),
    errorMessage:   text("error_message"),
    durationMs:     integer("duration_ms"),
    createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_paid_media_sync_runs_platform").on(t.platform, t.createdAt),
    index("idx_paid_media_sync_runs_internal").on(t.internalId),
    // Retention sweep age scan (mig 0652).
    index("idx_paid_media_sync_runs_created_at").on(t.createdAt),
    uniqueIndex("uq_paid_media_sync_idempotency")
      .on(t.platform, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
  ],
);

// ─── Insights (per-day rollup pulled from each platform) ──────────────────
export const paidMediaInsights = pgTable(
  "paid_media_insights",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    platform:     varchar("platform", { length: 16 }).notNull(),
    accountId:    uuid("account_id").notNull().references(() => paidMediaAccounts.id, { onDelete: "cascade" }),
    resourceKind: varchar("resource_kind", { length: 16 }).notNull(), // campaign | ad_set | ad
    internalId:   uuid("internal_id"),
    externalId:   text("external_id").notNull(),
    date:         varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD in account TZ
    impressions:  bigint("impressions", { mode: "number" }).notNull().default(0),
    clicks:       bigint("clicks", { mode: "number" }).notNull().default(0),
    spendCents:   bigint("spend_cents", { mode: "number" }).notNull().default(0),
    conversions:  bigint("conversions", { mode: "number" }).notNull().default(0),
    videoViews:   bigint("video_views", { mode: "number" }).notNull().default(0),
    rawMetrics:   jsonb("raw_metrics").notNull().default("{}"),
    fetchedAt:    timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_paid_media_insights_day")
      .on(t.platform, t.externalId, t.resourceKind, t.date),
    index("idx_paid_media_insights_internal").on(t.internalId, t.date),
    index("idx_paid_media_insights_account").on(t.accountId, t.date),
  ],
);

// ─── Pixel Configuration (per workspace) ──────────────────────────────────
// Holds the per-platform pixel/tag IDs for the workspace AND the
// CAPI access tokens. Pixel IDs are public (rendered in HTML); access
// tokens are encrypted at rest.
export const paidMediaPixels = pgTable(
  "paid_media_pixels",
  {
    id:                  uuid("id").primaryKey().defaultRandom(),
    userId:              text("user_id").notNull(),
    companyId:           uuid("company_id"),
    // Public IDs (safe to render).
    metaPixelId:         text("meta_pixel_id"),
    googleAdsConversionId: text("google_ads_conversion_id"),
    googleAdsConversionLabel: text("google_ads_conversion_label"),
    ga4MeasurementId:    text("ga4_measurement_id"),
    linkedInPartnerId:   text("linkedin_partner_id"),
    tiktokPixelId:       text("tiktok_pixel_id"),
    bingUetTagId:        text("bing_uet_tag_id"),
    // CAPI/Events API access tokens (server-side fan-out). Encrypted.
    metaCapiTokenEnc:    text("meta_capi_token_enc"),
    tiktokAccessTokenEnc: text("tiktok_access_token_enc"),
    linkedInCapiTokenEnc: text("linkedin_capi_token_enc"),
    bingUetApiTokenEnc:  text("bing_uet_api_token_enc"),
    ga4ApiSecretEnc:     text("ga4_api_secret_enc"),
    // Verification state per platform (CAPI test event success).
    verified:            jsonb("verified").notNull().default("{}"), // { meta?: true, google?: true, ... }
    createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_paid_media_pixels_workspace").on(t.userId, t.companyId),
    check("paid_media_pixels_meta_capi_token_enc_enc_format_check", sql`${t.metaCapiTokenEnc} IS NULL OR ${t.metaCapiTokenEnc} LIKE 'v1.aes-gcm.hkdf:%' OR ${t.metaCapiTokenEnc} ~ '^[A-Za-z0-9+/=]+\\.[A-Za-z0-9+/=]+$' OR ${t.metaCapiTokenEnc} ~ '^[0-9a-fA-F]+:[0-9a-fA-F]+$'`),
    check("paid_media_pixels_tiktok_access_token_enc_enc_format_check", sql`${t.tiktokAccessTokenEnc} IS NULL OR ${t.tiktokAccessTokenEnc} LIKE 'v1.aes-gcm.hkdf:%' OR ${t.tiktokAccessTokenEnc} ~ '^[A-Za-z0-9+/=]+\\.[A-Za-z0-9+/=]+$' OR ${t.tiktokAccessTokenEnc} ~ '^[0-9a-fA-F]+:[0-9a-fA-F]+$'`),
    check("paid_media_pixels_linkedin_capi_token_enc_enc_format_check", sql`${t.linkedInCapiTokenEnc} IS NULL OR ${t.linkedInCapiTokenEnc} LIKE 'v1.aes-gcm.hkdf:%' OR ${t.linkedInCapiTokenEnc} ~ '^[A-Za-z0-9+/=]+\\.[A-Za-z0-9+/=]+$' OR ${t.linkedInCapiTokenEnc} ~ '^[0-9a-fA-F]+:[0-9a-fA-F]+$'`),
    check("paid_media_pixels_bing_uet_api_token_enc_enc_format_check", sql`${t.bingUetApiTokenEnc} IS NULL OR ${t.bingUetApiTokenEnc} LIKE 'v1.aes-gcm.hkdf:%' OR ${t.bingUetApiTokenEnc} ~ '^[A-Za-z0-9+/=]+\\.[A-Za-z0-9+/=]+$' OR ${t.bingUetApiTokenEnc} ~ '^[0-9a-fA-F]+:[0-9a-fA-F]+$'`),
    check("paid_media_pixels_ga4_api_secret_enc_enc_format_check", sql`${t.ga4ApiSecretEnc} IS NULL OR ${t.ga4ApiSecretEnc} LIKE 'v1.aes-gcm.hkdf:%' OR ${t.ga4ApiSecretEnc} ~ '^[A-Za-z0-9+/=]+\\.[A-Za-z0-9+/=]+$' OR ${t.ga4ApiSecretEnc} ~ '^[0-9a-fA-F]+:[0-9a-fA-F]+$'`),
  ],
);

// ─── Conversions (server-side CAPI fan-out queue + log) ──────────────────
// Every conversion event (signup, subscribe, paid_upgrade, lead, etc.)
// captured server-side is written here, then fanned out to every
// platform whose pixel is configured. Stored AFTER fan-out so we have a
// durable, queryable record for attribution debugging.
export const paidMediaConversions = pgTable(
  "paid_media_conversions",
  {
    id:                 uuid("id").primaryKey().defaultRandom(),
    userId:             text("user_id"),                // hired.video user (the one converting, when known)
    workspaceUserId:    text("workspace_user_id"),     // workspace that owns the pixels — where the event fires
    workspaceCompanyId: uuid("workspace_company_id"),
    eventName:          varchar("event_name", { length: 64 }).notNull(),
    eventTime:          timestamp("event_time", { withTimezone: true }).notNull().defaultNow(),
    valueCents:         bigint("value_cents", { mode: "number" }),
    currencyCode:       varchar("currency_code", { length: 8 }).notNull().default("USD"),
    // Click IDs captured at landing time, written by middleware/click-id-capture.ts.
    fbclid:             text("fbclid"),
    gclid:              text("gclid"),
    liFatId:            text("li_fat_id"),
    ttclid:             text("ttclid"),
    msclkid:            text("msclkid"),
    // User identifiers for advanced matching. Hashed before send by
    // services/paid-media/conversions/capi.ts (SHA-256, normalised).
    emailHashed:        text("email_hashed"),
    phoneHashed:        text("phone_hashed"),
    externalIdHashed:   text("external_id_hashed"),    // hired.video user id, SHA-256
    ipAddress:          varchar("ip_address", { length: 64 }),
    userAgent:          text("user_agent"),
    sourceUrl:          text("source_url"),
    properties:         jsonb("properties").notNull().default("{}"),
    // Per-platform delivery results: { meta: "sent"|"failed"|"skipped", google: ..., ... }
    deliveryResults:    jsonb("delivery_results").notNull().default("{}"),
    createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_paid_media_conversions_workspace").on(t.workspaceUserId, t.workspaceCompanyId),
    index("idx_paid_media_conversions_user").on(t.userId),
    index("idx_paid_media_conversions_event").on(t.eventName, t.eventTime),
  ],
);

// ─── Type exports ─────────────────────────────────────────────────────────
export type PaidMediaAccount = typeof paidMediaAccounts.$inferSelect;
export type NewPaidMediaAccount = typeof paidMediaAccounts.$inferInsert;
export type PaidMediaCampaign = typeof paidMediaCampaigns.$inferSelect;
export type NewPaidMediaCampaign = typeof paidMediaCampaigns.$inferInsert;
export type PaidMediaAdSet = typeof paidMediaAdSets.$inferSelect;
export type NewPaidMediaAdSet = typeof paidMediaAdSets.$inferInsert;
export type PaidMediaAd = typeof paidMediaAds.$inferSelect;
export type NewPaidMediaAd = typeof paidMediaAds.$inferInsert;
export type PaidMediaCreative = typeof paidMediaCreatives.$inferSelect;
export type NewPaidMediaCreative = typeof paidMediaCreatives.$inferInsert;
export type PaidMediaPlatformRef = typeof paidMediaPlatformRefs.$inferSelect;
export type NewPaidMediaPlatformRef = typeof paidMediaPlatformRefs.$inferInsert;
export type PaidMediaSyncRun = typeof paidMediaSyncRuns.$inferSelect;
export type NewPaidMediaSyncRun = typeof paidMediaSyncRuns.$inferInsert;
export type PaidMediaInsight = typeof paidMediaInsights.$inferSelect;
export type NewPaidMediaInsight = typeof paidMediaInsights.$inferInsert;
export type PaidMediaPixels = typeof paidMediaPixels.$inferSelect;
export type NewPaidMediaPixels = typeof paidMediaPixels.$inferInsert;
export type PaidMediaConversion = typeof paidMediaConversions.$inferSelect;
export type NewPaidMediaConversion = typeof paidMediaConversions.$inferInsert;
