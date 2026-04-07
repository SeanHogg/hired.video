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
  pgTable, uuid, text, integer, boolean, timestamp, jsonb, index, numeric,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Job Boosts — self-serve sponsored placement for a job listing (gap #106)
// ---------------------------------------------------------------------------
export const jobBoosts = pgTable("job_boosts", {
  id:                    uuid("id").primaryKey().defaultRandom(),
  jobId:                 text("job_id").notNull(),
  userId:                text("user_id").notNull(),
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
  startsAt:              timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt:                timestamp("ends_at", { withTimezone: true }),
  createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:             timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_job_boosts_job").on(t.jobId),
  index("idx_job_boosts_user").on(t.userId),
  index("idx_job_boosts_status").on(t.status),
]);

// ---------------------------------------------------------------------------
// Company Boosts — self-serve featured company profile placement (gap #107)
// Mirrors `jobBoosts` but targets a `companyProfiles` row instead of a job.
// Surfaces the company in directory featured slots, dashboard spotlight,
// and discovery-feed company cards based on `placementType`.
// ---------------------------------------------------------------------------
export const companyBoosts = pgTable("company_boosts", {
  id:                    uuid("id").primaryKey().defaultRandom(),
  companyId:             text("company_id").notNull(),
  userId:                text("user_id").notNull(),                 // owner who paid
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
  startsAt:              timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt:                timestamp("ends_at", { withTimezone: true }),
  createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:             timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_company_boosts_company").on(t.companyId),
  index("idx_company_boosts_user").on(t.userId),
  index("idx_company_boosts_status").on(t.status),
]);

// ---------------------------------------------------------------------------
// Ad Campaigns — Level 1: strategic objective grouping (gap #108)
// ---------------------------------------------------------------------------
export const adCampaigns = pgTable("ad_campaigns", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      text("user_id").notNull(),
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
  campaignId:        text("campaign_id").notNull(),
  userId:            text("user_id").notNull(),
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
  adSetId:        text("ad_set_id").notNull(),
  userId:         text("user_id").notNull(),
  name:           text("name").notNull(),
  headline:       text("headline").notNull(),
  description:    text("description"),
  ctaText:        text("cta_text").notNull().default("Apply Now"), // Apply Now | Learn More | Watch Our Story | View Jobs
  ctaUrl:         text("cta_url"),
  imageUrl:       text("image_url"),
  videoUrl:       text("video_url"),
  destinationUrl: text("destination_url"), // supports {CAMPAIGN_ID}, {AD_SET_ID}, {AD_ID} macros
  variantGroup:   text("variant_group"),   // A | B for A/B testing
  status:         text("status").notNull().default("draft"), // draft | active | paused | rejected
  impressions:    integer("impressions").notNull().default(0),
  clicks:         integer("clicks").notNull().default(0),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_ads_ad_set").on(t.adSetId),
  index("idx_ads_user").on(t.userId),
]);

// ---------------------------------------------------------------------------
// Enrichment Credits (gap #96)
// ---------------------------------------------------------------------------
export const enrichmentCredits = pgTable("enrichment_credits", {
  id:             uuid("id").primaryKey().defaultRandom(),
  userId:         text("user_id").notNull().unique(),
  balance:        integer("balance").notNull().default(0),
  totalPurchased: integer("total_purchased").notNull().default(0),
  totalConsumed:  integer("total_consumed").notNull().default(0),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const enrichmentTransactions = pgTable("enrichment_transactions", {
  id:            uuid("id").primaryKey().defaultRandom(),
  userId:        text("user_id").notNull(),
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
// Career Resilience Reports (gap #103)
// ---------------------------------------------------------------------------
export const careerResilienceReports = pgTable("career_resilience_reports", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      text("user_id").notNull(),
  currentRole: text("current_role").notNull(),
  riskScore:   integer("risk_score").notNull(),         // 0-100 (higher = more at risk from AI)
  reportJson:  jsonb("report_json").notNull().default("{}"), // { skillGaps, adjacentRoles, retrainingRoadmap, salaryTrajectory, marketSignals }
  shareToken:  text("share_token").unique(),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_career_resilience_user").on(t.userId),
]);
