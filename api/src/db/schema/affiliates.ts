import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  numeric,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const affiliateProfiles = pgTable("affiliate_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  referralCode: varchar("referral_code", { length: 50 }).notNull().unique(),
  commissionRate: numeric("commission_rate").default("0.10").notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  totalEarned: numeric("total_earned").default("0").notNull(),
  totalPaid: numeric("total_paid").default("0").notNull(),
  payoutEmail: varchar("payout_email", { length: 255 }),
  // Sectors this affiliate specializes in (healthcare creator,
  // trades creator, etc.). Empty array = generalist. Specialist
  // bonus applies when a referral's landing_sector matches one of
  // these. See shared/sectors.ts Sector enum.
  specialtySectors: jsonb("specialty_sectors").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AffiliateProfile = typeof affiliateProfiles.$inferSelect;
export type NewAffiliateProfile = typeof affiliateProfiles.$inferInsert;

export const affiliateReferrals = pgTable("affiliate_referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateId: uuid("affiliate_id").notNull().references(() => affiliateProfiles.id, { onDelete: "cascade" }),
  referredUserId: uuid("referred_user_id").references(() => users.id, { onDelete: "set null" }),
  referralCode: varchar("referral_code", { length: 50 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  // Sector landing page / article the referral arrived through. Drives
  // vertical conversion analytics and specialist bonuses (see
  // affiliateProfiles.specialtySectors). Nullable for non-sector
  // landings (homepage, etc.).
  landingSector: varchar("landing_sector", { length: 64 }),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_affiliate_referrals_sector").on(t.landingSector, t.createdAt.desc().nullsFirst()).where(sql`"landing_sector" IS NOT NULL`),
  index("idx_affiliate_referrals_affiliate_created").on(t.affiliateId, t.createdAt.desc().nullsFirst()),
  // #2305 — legacy UNIQUE (migration 0116_user_attribution_columns.sql); duplicates resolved by 0518_dedupe_unique_indexes.sql.
  uniqueIndex("uq_affiliate_referrals_referred_user")
    .on(t.referredUserId)
    .where(sql`referred_user_id IS NOT NULL`),
]);

export type AffiliateReferral = typeof affiliateReferrals.$inferSelect;
export type NewAffiliateReferral = typeof affiliateReferrals.$inferInsert;

export const affiliateConversions = pgTable("affiliate_conversions", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateId: uuid("affiliate_id").notNull().references(() => affiliateProfiles.id, { onDelete: "cascade" }),
  referralId: uuid("referral_id").references(() => affiliateReferrals.id, { onDelete: "set null" }),
  conversionType: varchar("conversion_type", { length: 100 }).notNull(),
  revenue: numeric("revenue").notNull(),
  commission: numeric("commission").notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_affiliate_conversions_affiliate_created").on(t.affiliateId, t.createdAt.desc().nullsFirst()),
  index("idx_affiliate_conversions_referral_id").on(t.referralId),
]);

export type AffiliateConversion = typeof affiliateConversions.$inferSelect;
export type NewAffiliateConversion = typeof affiliateConversions.$inferInsert;

export const affiliatePayouts = pgTable("affiliate_payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateId: uuid("affiliate_id").notNull().references(() => affiliateProfiles.id, { onDelete: "cascade" }),
  amount: numeric("amount").notNull(),
  currency: varchar("currency", { length: 10 }).default("USD").notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  payoutMethod: varchar("payout_method", { length: 50 }),
  transactionId: text("transaction_id"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_affiliate_payouts_affiliate_id").on(t.affiliateId),
]);

export type AffiliatePayout = typeof affiliatePayouts.$inferSelect;
export type NewAffiliatePayout = typeof affiliatePayouts.$inferInsert;

// ─── Affiliate scaling: ambassador tiers + click tracking (#74) ───────────────

// Tier thresholds: affiliates automatically graduate on conversion milestones.
// bronze → silver at 10 conversions, silver → gold at 50, gold → platinum at 200.
export const affiliateTiers = pgTable("affiliate_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 50 }).notNull().unique(), // "bronze" | "silver" | "gold" | "platinum"
  label: varchar("label", { length: 100 }).notNull(),
  minConversions: integer("min_conversions").default(0).notNull(),
  commissionRate: numeric("commission_rate").notNull(), // override rate for this tier
  bonusPercentage: numeric("bonus_percentage").default("0").notNull(), // extra % on recruiter deals
  perks: jsonb("perks").default([]).$type<string[]>(), // e.g. ["Early access", "Priority support"]
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AffiliateTier = typeof affiliateTiers.$inferSelect;

// Per-click tracking for affiliate links (UTM-level analytics)
export const affiliateLinkClicks = pgTable("affiliate_link_clicks", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateId: uuid("affiliate_id").notNull().references(() => affiliateProfiles.id, { onDelete: "cascade" }),
  referralCode: varchar("referral_code", { length: 50 }).notNull(),
  // Destination page slug (e.g. "/jobs/123", "/signup")
  targetPath: varchar("target_path", { length: 500 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  referer: text("referer"),
  // Whether this click eventually converted (FK to referrals)
  convertedReferralId: uuid("converted_referral_id").references(() => affiliateReferrals.id, { onDelete: "set null" }),
  // Sector landing page this click went to (e.g. /sectors/healthcare).
  // Nullable for non-sector landings. Powers per-sector CTR analytics
  // and matches the affiliateReferrals.landingSector schema.
  landingSector: varchar("landing_sector", { length: 64 }),
  clickedAt: timestamp("clicked_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_affiliate_link_clicks_sector").on(t.landingSector, t.clickedAt.desc().nullsFirst()).where(sql`"landing_sector" IS NOT NULL`),
  index("idx_affiliate_link_clicks_affiliate_id").on(t.affiliateId),
  index("idx_affiliate_link_clicks_converted_referral_id").on(t.convertedReferralId),
]);

export type AffiliateLinkClick = typeof affiliateLinkClicks.$inferSelect;
