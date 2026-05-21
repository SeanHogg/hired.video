/**
 * Creators / Promo Video Marketplace (gap #101)
 *
 * Lets any user opt-in to provide creative services (primarily promo video
 * production) to other users on the platform. Built on top of the existing
 * `serviceOfferings` / `serviceInquiries` lead-gen primitives.
 *
 * Tables:
 *   - creatorProfiles                   — opt-in flag, terms acceptance, payout details, aggregate stats
 *   - portfolioItems                    — creator media gallery, with one featured item per creator
 *   - promoProjects                     — the production transaction (escrow + state)
 *   - promoProjectRevisions             — submitted cuts (max 3 included, paid extras)
 *   - promoProjectExtraRevisionPurchases — line items when customer buys revisions 4+
 *   - promoProjectReviews               — customer rating + review after acceptance
 *
 * Scene-level / time-coded comments reuse the existing `studioReviewComments`
 * table from studiofeatures.ts (Frame.io-style review system).
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { conversations } from "./messaging.js";
import { serviceInquiries, serviceOfferings } from "./services.js";

// ---------------------------------------------------------------------------
// Creator Profile — extension of userProfiles for opted-in service providers.
// One row per user. Created on first opt-in. Required to accept paid leads.
// ---------------------------------------------------------------------------
export const creatorProfiles = pgTable(
  "creator_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

    // Enrollment lifecycle. ended_at = null is the active row (enforced by
    // partial unique index on user_id). Cancelling the entire program sets
    // ended_at; re-enrolling inserts a new row. Cancelling a single program
    // just flips the per-program flag below.
    endedAt: timestamp("ended_at", { withTimezone: true }),

    // Per-program enrollment flags. is_active below is derived (true when at
    // least one of these is true and ended_at IS NULL); kept as a real column
    // so existing read paths don't have to change.
    videoActive: boolean("video_active").default(false).notNull(),
    voiceActive: boolean("voice_active").default(false).notNull(),
    servicesActive: boolean("services_active").default(false).notNull(),
    articlesActive: boolean("articles_active").default(false).notNull(),
    coursesActive: boolean("courses_active").default(false).notNull(),
    templatesActive: boolean("templates_active").default(false).notNull(),

    // Opt-in state
    isActive: boolean("is_active").default(false).notNull(),
    displayName: varchar("display_name", { length: 255 }),
    tagline: varchar("tagline", { length: 255 }),
    bio: text("bio"),
    categories: jsonb("categories").$type<string[]>().default([]).notNull(), // promo_video | resume_video | personal_brand | etc.
    languages: jsonb("languages").$type<string[]>().default([]).notNull(),

    // Creator Terms acceptance is recorded centrally in legal_document_acceptances
    // (kind = 'creator_terms'). The /opt-in route verifies acceptance there.

    // Payout / tax info lives on `payout_profiles` (one row per user — taxes
    // follow the person, not the per-program enrollment row). Migration 0092
    // dropped the duplicate columns that previously shadowed those fields
    // here; consumers should JOIN payout_profiles by user_id.

    // Pricing defaults applied to new promo projects when creator hasn't set a
    // per-project price. The actual project price comes from the linked
    // serviceInquiry / serviceOffering.
    defaultPriceCents: integer("default_price_cents").default(0).notNull(),
    extraRevisionPriceCents: integer("extra_revision_price_cents").default(0).notNull(),
    averageDeliveryDays: integer("average_delivery_days"),

    // Platform fee in basis points. Snapshotted on the creator's profile at
    // opt-in time from either `DEFAULT_PLATFORM_FEE_BPS` or the user's
    // `creatorPlatformFeeBpsOverride` (admin-settable). Stored per-creator so
    // future rate changes don't affect historical projects. The CC processing
    // fee is additionally charged to the buyer at checkout.
    // Default 500 = 5% platform fee, 95% to creator.
    platformFeeBps: integer("platform_fee_bps").default(500).notNull(),

    // Aggregate stats — denormalised for fast profile/discovery rendering.
    completedProjectsCount: integer("completed_projects_count").default(0).notNull(),
    totalEarnedCents: integer("total_earned_cents").default(0).notNull(),
    averageRating: real("average_rating"), // 0..5, null until first review
    ratingCount: integer("rating_count").default(0).notNull(),
    responseHours: real("response_hours"), // rolling avg of first-response time

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_creator_profiles_active").on(t.isActive),
    index("idx_creator_profiles_rating").on(t.averageRating),
    uniqueIndex("uq_creator_profiles_user_active")
      .on(t.userId)
      .where(sql`${t.endedAt} IS NULL`),
    index("idx_creator_profiles_user_ended_at").on(t.userId, t.endedAt),
  ],
);

export type CreatorProfile = typeof creatorProfiles.$inferSelect;
export type NewCreatorProfile = typeof creatorProfiles.$inferInsert;

// ---------------------------------------------------------------------------
// Portfolio Items — gallery of creator work shown on their public profile.
// One creator can mark a single item as featured (enforced by partial unique
// index on isFeatured = true).
// ---------------------------------------------------------------------------
export const portfolioItems = pgTable(
  "portfolio_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    mediaType: varchar("media_type", { length: 20 }).notNull(), // 'video' | 'image'
    mediaUrl: text("media_url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    durationMs: integer("duration_ms"),

    // Provenance: was this auto-added from a delivered platform project, or
    // uploaded externally by the creator?
    source: varchar("source", { length: 20 }).default("upload").notNull(), // 'upload' | 'promo_project'
    sourcePromoProjectId: uuid("source_promo_project_id"), // FK added below to avoid cycle
    customerConsent: boolean("customer_consent").default(false).notNull(), // required when source=promo_project

    category: varchar("category", { length: 100 }),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),

    isFeatured: boolean("is_featured").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isPublic: boolean("is_public").default(true).notNull(),
    viewCount: integer("view_count").default(0).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_portfolio_items_user").on(t.userId),
    // Enforce at most one featured item per creator (partial unique index).
    uniqueIndex("uq_portfolio_featured_per_user")
      .on(t.userId)
      .where(sql`${t.isFeatured} = true`),
  ],
);

export type PortfolioItem = typeof portfolioItems.$inferSelect;
export type NewPortfolioItem = typeof portfolioItems.$inferInsert;

// ---------------------------------------------------------------------------
// Promo Projects — the actual production transaction.
//
// Lifecycle:
//   brief -> in_progress -> revision_1 -> revision_2 -> revision_3 -> delivered
//   delivered -> accepted (escrow released) | disputed (admin resolves)
//
// Revisions are capped at 3 included; revision_4+ requires a paid line item
// in promoProjectExtraRevisionPurchases.
// ---------------------------------------------------------------------------
export const promoProjects = pgTable(
  "promo_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Parties
    customerId: uuid("customer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),

    // Source: the lead form submission that spawned this project
    inquiryId: uuid("inquiry_id").references(() => serviceInquiries.id, { onDelete: "set null" }),
    serviceOfferingId: uuid("service_offering_id").references(() => serviceOfferings.id, { onDelete: "set null" }),

    // Collaboration thread (1:1 or group). Pre-existing or auto-created on
    // promo project creation. Comments and brief discussion live here.
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),

    // The studio project the creator is editing. Stored as text to match the
    // studiofeatures.ts convention (which uses string project IDs).
    studioProjectId: text("studio_project_id"),

    // Brief inputs the customer attached
    briefResumeId: uuid("brief_resume_id"),
    briefJobId: uuid("brief_job_id"),
    briefNotes: text("brief_notes"),
    briefAssets: jsonb("brief_assets").$type<Array<{ url: string; type: string; name?: string }>>().default([]).notNull(),

    title: varchar("title", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).default("brief").notNull(),
    // brief | in_progress | delivered | accepted | disputed | cancelled | refunded

    // Revision counters
    revisionsAllowed: integer("revisions_allowed").default(3).notNull(),
    revisionsUsed: integer("revisions_used").default(0).notNull(),

    // Money (in cents). Snapshotted at order creation so future fee changes
    // don't retroactively affect this transaction.
    priceCents: integer("price_cents").notNull(),
    currency: varchar("currency", { length: 10 }).default("USD").notNull(),
    platformFeeBps: integer("platform_fee_bps").default(1500).notNull(),
    platformFeeCents: integer("platform_fee_cents").default(0).notNull(),
    creatorCutCents: integer("creator_cut_cents").default(0).notNull(),

    // Escrow
    paymentRef: text("payment_ref"),                                        // Stripe / Helcim payment id
    paidAt: timestamp("paid_at", { withTimezone: true }),
    escrowReleasedAt: timestamp("escrow_released_at", { withTimezone: true }),
    autoReleaseAt: timestamp("auto_release_at", { withTimezone: true }),    // 7 days post-delivery

    // Delivery
    deliveredVideoUrl: text("delivered_video_url"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    // Customer permission to add the delivered video to creator's portfolio
    portfolioConsent: boolean("portfolio_consent").default(false).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_promo_projects_customer").on(t.customerId),
    index("idx_promo_projects_creator").on(t.creatorId),
    index("idx_promo_projects_status").on(t.status),
    index("idx_promo_projects_inquiry").on(t.inquiryId),
  ],
);

export type PromoProject = typeof promoProjects.$inferSelect;
export type NewPromoProject = typeof promoProjects.$inferInsert;

// ---------------------------------------------------------------------------
// Promo Project Revisions — one row per submitted cut.
// Allows the creator to branch from any prior cut and gives the customer a
// clear approval/changes-requested decision per revision.
// ---------------------------------------------------------------------------
export const promoProjectRevisions = pgTable(
  "promo_project_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => promoProjects.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(), // 1-indexed
    isPaidExtra: boolean("is_paid_extra").default(false).notNull(), // true for revisions 4+

    // Snapshot of the storyboard at the time of submission so the creator can
    // branch from any prior cut without losing state.
    storyboardSnapshot: jsonb("storyboard_snapshot"),
    videoUrl: text("video_url"),
    thumbnailUrl: text("thumbnail_url"),
    durationMs: integer("duration_ms"),
    creatorNotes: text("creator_notes"),

    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),

    customerDecision: varchar("customer_decision", { length: 20 }).default("pending").notNull(),
    // pending | approved | changes_requested
    customerFeedback: text("customer_feedback"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_promo_revisions_project").on(t.projectId),
    uniqueIndex("uq_promo_revisions_project_number").on(t.projectId, t.revisionNumber),
  ],
);

export type PromoProjectRevision = typeof promoProjectRevisions.$inferSelect;
export type NewPromoProjectRevision = typeof promoProjectRevisions.$inferInsert;

// ---------------------------------------------------------------------------
// Extra Revision Purchases — when a customer buys revisions beyond the
// included 3. Each row is its own line item / payment so we can refund or
// dispute it independently.
// ---------------------------------------------------------------------------
export const promoProjectExtraRevisionPurchases = pgTable(
  "promo_project_extra_revision_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => promoProjects.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull().references(() => users.id, { onDelete: "cascade" }),

    priceCents: integer("price_cents").notNull(),
    currency: varchar("currency", { length: 10 }).default("USD").notNull(),
    platformFeeBps: integer("platform_fee_bps").default(1500).notNull(),
    platformFeeCents: integer("platform_fee_cents").default(0).notNull(),
    creatorCutCents: integer("creator_cut_cents").default(0).notNull(),

    paymentRef: text("payment_ref"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    revisionsAdded: integer("revisions_added").default(1).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_extra_rev_purchases_project").on(t.projectId),
  ],
);

export type PromoProjectExtraRevisionPurchase = typeof promoProjectExtraRevisionPurchases.$inferSelect;
export type NewPromoProjectExtraRevisionPurchase = typeof promoProjectExtraRevisionPurchases.$inferInsert;

// Promo project reviews are now stored in the polymorphic `reviews`
// table (subject_type='promo_project'). See
// api/src/db/schema/reviews.ts and shared/reviews/subject-descriptors.ts.
// Migration 0032 backfilled the legacy `promo_project_reviews` rows
// into `reviews` and dropped the original table; the cached
// creatorProfiles.averageRating + ratingCount columns will be wired
// to the new source in Phase D.
