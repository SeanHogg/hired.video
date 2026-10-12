/**
 * Advertising & Campaign Management Schema
 *
 * Implements the industry-standard 4-level hierarchy:
 *   Ad Account (implicit — userId) → Campaign → Ad Set → Ad
 *
 * Also includes:
 *   - jobBoosts      — self-serve sponsored job placements (gap #106)
 *   - enrichmentCredits / enrichmentTransactions — contact enrichment balance (gap #96)
 *   - careerResilienceReports — AI career risk analysis (gap #103)
 */

import {
  pgTable, uuid, text, varchar, integer, boolean, timestamp, jsonb, index, numeric,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { jobItems } from "./jobs.js";
import { companyProfiles } from "./companies.js";

// ---------------------------------------------------------------------------
// Boosts (polymorphic) — promote any user-generated subject. See
// migration 0034_polymorphic_boosts.sql. Co-exists with the legacy
// jobBoosts + companyBoosts tables defined further down; new code
// should target this table.
// ---------------------------------------------------------------------------
export const boosts = pgTable("boosts", {
  id:                    uuid("id").primaryKey().defaultRandom(),
  userId:                uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subjectType:           varchar("subject_type", { length: 32 }).notNull(),
  subjectId:             uuid("subject_id").notNull(),
  placementType:         varchar("placement_type", { length: 32 }).notNull().default("feed_top"),
  pricingModel:          varchar("pricing_model", { length: 16 }).notNull().default("flat"),
  budgetCents:           integer("budget_cents").notNull(),
  spentCents:            integer("spent_cents").notNull().default(0),
  rateUnitCents:         integer("rate_unit_cents"),
  status:                varchar("status", { length: 20 }).notNull().default("pending_payment"),
  impressions:           integer("impressions").notNull().default(0),
  clicks:                integer("clicks").notNull().default(0),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  startsAt:              timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt:                timestamp("ends_at", { withTimezone: true }),
  createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:             timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_boosts_subject").on(t.subjectType, t.subjectId),
  // Subject + recency — renderer orders by created_at to break ties when
  // multiple boosts overlap on the same subject.
  index("idx_boosts_subject_created").on(t.subjectType, t.subjectId, t.createdAt.desc()),
  index("idx_boosts_user").on(t.userId),
  index("idx_boosts_status_active").on(t.status, t.endsAt).where(sql`status = 'active'`),
  index("idx_boosts_stripe_pi").on(t.stripePaymentIntentId).where(sql`stripe_payment_intent_id IS NOT NULL`),
  check("boosts_budget_cents_check", sql`${t.budgetCents} >= 100`),
  check("boosts_spent_cents_nonneg", sql`${t.spentCents} >= 0`),
  check("boosts_budget_cents_nonneg", sql`${t.budgetCents} >= 0`),
  check("boosts_spent_le_budget", sql`${t.spentCents} <= ${t.budgetCents}`),
]);

export type Boost = typeof boosts.$inferSelect;
export type NewBoost = typeof boosts.$inferInsert;

// ---------------------------------------------------------------------------
// Job Boosts — self-serve sponsored placement for a job listing (gap #106)
// ---------------------------------------------------------------------------
export const jobBoosts = pgTable("job_boosts", {
  id:                    uuid("id").primaryKey().defaultRandom(),
  jobId:                 uuid("job_id").notNull().references(() => jobItems.id, { onDelete: "cascade" }),
  userId:                uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  placementType:         text("placement_type").notNull(), // search_top | discovery_feed | both
  pricingModel:          text("pricing_model").notNull(),  // cpm | cpc
  budgetCents:           integer("budget_cents").notNull(),
  spentCents:            integer("spent_cents").notNull().default(0),
  rateUnitCents:         integer("rate_unit_cents").notNull().default(500), // $5.00 CPM or $0.05 CPC
  status:                text("status").notNull().default("active"), // active | paused | completed | cancelled
  impressions:           integer("impressions").notNull().default(0),
  clicks:                integer("clicks").notNull().default(0),
  applications:          integer("applications").notNull().default(0),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  // Polymorphic target (#176, mig 0516) — always ('job', job_id). Nullable
  // at the column level so push never truncates; the service always writes
  // it and 0516 backfilled every legacy row.
  subjectType:           varchar("subject_type", { length: 32 }),
  subjectId:             uuid("subject_id"),
  startsAt:              timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt:                timestamp("ends_at", { withTimezone: true }),
  createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:             timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_job_boosts_job").on(t.jobId),
  index("idx_job_boosts_user").on(t.userId),
  index("idx_job_boosts_status").on(t.status),
  index("idx_job_boosts_subject_created").on(t.subjectType, t.subjectId, t.createdAt.desc()),
  check("job_boosts_subject_check", sql`${t.subjectType} IS NULL OR (${t.subjectType} = 'job' AND ${t.subjectId} = ${t.jobId})`),
]);

// ---------------------------------------------------------------------------
// Company Boosts — self-serve featured company profile placement (gap #107)
// Mirrors `jobBoosts` but targets a `companyProfiles` row instead of a job.
// Surfaces the company in directory featured slots, dashboard spotlight,
// and discovery-feed company cards based on `placementType`.
// ---------------------------------------------------------------------------
export const companyBoosts = pgTable("company_boosts", {
  id:                    uuid("id").primaryKey().defaultRandom(),
  companyId:             uuid("company_id").notNull().references(() => companyProfiles.id, { onDelete: "cascade" }),
  userId:                uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),  // owner who paid
  placementType:         text("placement_type").notNull(),           // directory_featured | dashboard_spotlight | discovery_feed | all
  pricingModel:          text("pricing_model").notNull(),            // flat | cpm
  budgetCents:           integer("budget_cents").notNull(),
  spentCents:            integer("spent_cents").notNull().default(0),
  rateUnitCents:         integer("rate_unit_cents").notNull().default(500),
  status:                text("status").notNull().default("active"), // active | paused | completed | cancelled
  impressions:           integer("impressions").notNull().default(0),
  clicks:                integer("clicks").notNull().default(0),
  follows:               integer("follows").notNull().default(0),    // company-page follows attributed
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  // Polymorphic target (#176, mig 0516) — always ('company', company_id).
  subjectType:           varchar("subject_type", { length: 32 }),
  subjectId:             uuid("subject_id"),
  startsAt:              timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt:                timestamp("ends_at", { withTimezone: true }),
  createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:             timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_company_boosts_company").on(t.companyId),
  index("idx_company_boosts_user").on(t.userId),
  index("idx_company_boosts_status").on(t.status),
  index("idx_company_boosts_subject_created").on(t.subjectType, t.subjectId, t.createdAt.desc()),
  check("company_boosts_subject_check", sql`${t.subjectType} IS NULL OR (${t.subjectType} = 'company' AND ${t.subjectId} = ${t.companyId})`),
]);

// ---------------------------------------------------------------------------
// Ad Campaigns — Level 1: strategic objective grouping (gap #108)
// ---------------------------------------------------------------------------
export const adCampaigns = pgTable("ad_campaigns", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name:        text("name").notNull(),
  objective:   text("objective").notNull().default("TRAFFIC"), // AWARENESS | TRAFFIC | APPLICATIONS | EMPLOYER_BRAND
  status:      text("status").notNull().default("draft"),      // draft | active | paused | completed | archived
  budgetCents: integer("budget_cents"),
  spentCents:  integer("spent_cents").notNull().default(0),
  startAt:     timestamp("start_at", { withTimezone: true }),
  endAt:       timestamp("end_at", { withTimezone: true }),
  notes:       text("notes"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_ad_campaigns_user").on(t.userId),
  index("idx_ad_campaigns_status").on(t.status),
]);

// ---------------------------------------------------------------------------
// Ad Sets — Level 2: targeting, budget, schedule, bid strategy (gap #108/#109)
// ---------------------------------------------------------------------------
export const adSets = pgTable("ad_sets", {
  id:                uuid("id").primaryKey().defaultRandom(),
  campaignId:        uuid("campaign_id").notNull().references(() => adCampaigns.id, { onDelete: "cascade" }),
  userId:            uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name:              text("name").notNull(),
  placementType:     text("placement_type").notNull().default("search_top"), // search_top | discovery_feed | both | email | push
  pricingModel:      text("pricing_model").notNull().default("cpc"),         // cpm | cpc | auto
  bidStrategy:       text("bid_strategy").notNull().default("manual"),       // manual | maximize_clicks | maximize_impressions | target_cpa
  bidAmountCents:    integer("bid_amount_cents"),
  budgetCents:       integer("budget_cents"),
  spentCents:        integer("spent_cents").notNull().default(0),
  targetingJson:     jsonb("targeting_json").notNull().default("{}"),         // { geo, skills, experienceLevel, roles, openToWork, devicePlatform, dayparting, excludeApplicants }
  frequencyCapCount: integer("frequency_cap_count").default(5),
  frequencyCapHours: integer("frequency_cap_hours").default(24),
  status:            text("status").notNull().default("draft"),               // draft | active | paused | completed
  impressions:       integer("impressions").notNull().default(0),
  clicks:            integer("clicks").notNull().default(0),
  applications:      integer("applications").notNull().default(0),
  startAt:           timestamp("start_at", { withTimezone: true }),
  endAt:             timestamp("end_at", { withTimezone: true }),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_ad_sets_campaign").on(t.campaignId),
  index("idx_ad_sets_user").on(t.userId),
]);

// ---------------------------------------------------------------------------
// Ads — Level 3: creative unit with A/B variant support (gap #110)
// ---------------------------------------------------------------------------
export const ads = pgTable("ads", {
  id:             uuid("id").primaryKey().defaultRandom(),
  adSetId:        uuid("ad_set_id").notNull().references(() => adSets.id, { onDelete: "cascade" }),
  userId:         uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name:           text("name").notNull(),
  headline:       text("headline").notNull(),
  description:    text("description"),
  ctaText:        text("cta_text").notNull().default("Apply Now"), // Apply Now | Learn More | Watch Our Story | View Jobs
  ctaUrl:         text("cta_url"),
  imageUrl:       text("image_url"),
  videoUrl:       text("video_url"),
  destinationUrl: text("destination_url"), // supports {CAMPAIGN_ID}, {AD_SET_ID}, {AD_ID} macros
  variantGroup:   text("variant_group"),   // A | B for A/B testing
  // What the ad promotes (#176, mig 0516) — any AD_SUBJECT_TYPES value
  // (shared/ad-content-target.ts). Both null = a plain destination-URL ad.
  subjectType:    varchar("subject_type", { length: 32 }),
  subjectId:      uuid("subject_id"),
  status:         text("status").notNull().default("draft"), // draft | active | paused | rejected
  impressions:    integer("impressions").notNull().default(0),
  clicks:         integer("clicks").notNull().default(0),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_ads_ad_set").on(t.adSetId),
  index("idx_ads_user").on(t.userId),
  index("idx_ads_subject_created").on(t.subjectType, t.subjectId, t.createdAt.desc()),
  // Same list as AD_SUBJECT_TYPES (guarded by ad-content-target-migration.test.ts).
  check("ads_subject_check", sql`(${t.subjectType} IS NULL AND ${t.subjectId} IS NULL) OR (${t.subjectId} IS NOT NULL AND ${t.subjectType} IN ('job', 'company', 'article', 'course', 'template', 'video', 'studio_project', 'resume', 'service', 'voice_clone', 'event', 'user_profile'))`),
]);

// ---------------------------------------------------------------------------
// Enrichment Credits (gap #96)
// ---------------------------------------------------------------------------
export const enrichmentCredits = pgTable("enrichment_credits", {
  id:             uuid("id").primaryKey().defaultRandom(),
  userId:         uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  balance:        integer("balance").notNull().default(0),
  totalPurchased: integer("total_purchased").notNull().default(0),
  totalConsumed:  integer("total_consumed").notNull().default(0),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const enrichmentTransactions = pgTable("enrichment_transactions", {
  id:            uuid("id").primaryKey().defaultRandom(),
  userId:        uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type:          text("type").notNull(), // purchase | deduction | refund | monthly_grant
  amount:        integer("amount").notNull(),    // positive = credit, negative = debit
  balanceAfter:  integer("balance_after").notNull(),
  description:   text("description"),
  referenceId:   text("reference_id"),           // Stripe charge ID or enriched contact ID
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_enrichment_tx_user").on(t.userId),
]);

// ---------------------------------------------------------------------------
// Campaign Dollars (#169) — ad/boost credit balance redeemable from
// gamification points. Mirrors enrichment_credits + Tremendous flow but
// terminates in an internal ledger that the boosts checkout consumes
// before charging a card. Points → cents at a per-user snapshot rate.
// ---------------------------------------------------------------------------
export const campaignDollarsBalance = pgTable("campaign_dollars_balance", {
  id:                   uuid("id").primaryKey().defaultRandom(),
  userId:               uuid("user_id").notNull().unique(),
  balanceCents:         integer("balance_cents").notNull().default(0),
  lifetimeGrantedCents: integer("lifetime_granted_cents").notNull().default(0),
  lifetimeSpentCents:   integer("lifetime_spent_cents").notNull().default(0),
  /** Snapshotted on first opt-in. Falls back to platform default when
   *  NULL. Insulates the user from later global rate adjustments. */
  rateCentsPer1kPoints: integer("rate_cents_per_1k_points"),
  createdAt:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CampaignDollarsBalance = typeof campaignDollarsBalance.$inferSelect;
export type NewCampaignDollarsBalance = typeof campaignDollarsBalance.$inferInsert;

export const campaignDollarsTransactions = pgTable(
  "campaign_dollars_transactions",
  {
    id:                  uuid("id").primaryKey().defaultRandom(),
    userId:              uuid("user_id").notNull(),
    /** "grant_redemption" | "boost_spend" | "ad_spend" | "refund" */
    kind:                varchar("kind", { length: 32 }).notNull(),
    /** Signed: positive = credit, negative = debit. */
    amountCents:         integer("amount_cents").notNull(),
    balanceAfterCents:   integer("balance_after_cents").notNull(),
    referenceId:         text("reference_id"),
    referenceType:       varchar("reference_type", { length: 40 }),
    description:         text("description"),
    createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_campaign_dollars_tx_user").on(t.userId, t.createdAt),
  ],
);

export type CampaignDollarsTransaction = typeof campaignDollarsTransactions.$inferSelect;
export type NewCampaignDollarsTransaction = typeof campaignDollarsTransactions.$inferInsert;

// ---------------------------------------------------------------------------
// Career Resilience Reports (gap #103)
// ---------------------------------------------------------------------------
export const careerResilienceReports = pgTable("career_resilience_reports", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  currentRole: text("current_role").notNull(),
  riskScore:   integer("risk_score").notNull(),         // 0-100 (higher = more at risk from AI)
  reportJson:  jsonb("report_json").notNull().default("{}"), // { skillGaps, adjacentRoles, retrainingRoadmap, salaryTrajectory, marketSignals }
  shareToken:  text("share_token").unique(),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_career_resilience_user").on(t.userId),
]);
