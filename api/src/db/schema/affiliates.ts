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
} from "drizzle-orm/pg-core";
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
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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
});

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
});

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
  clickedAt: timestamp("clicked_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AffiliateLinkClick = typeof affiliateLinkClicks.$inferSelect;
