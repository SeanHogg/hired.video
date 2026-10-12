import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, text, integer, boolean, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * coupon_codes / coupon_redemptions — SuperAdmin-issued Pro comp codes
 * (migration 0500). See shared/coupons.ts. The grant itself lives in
 * `user_plan_overrides`; these tables record the codes and redemptions.
 */
export const couponCodes = pgTable(
  "coupon_codes",
  {
    id:              uuid("id").primaryKey().defaultRandom(),
    code:            varchar("code", { length: 32 }).notNull(),
    durationDays:    integer("duration_days").notNull().default(30),
    maxRedemptions:  integer("max_redemptions"),
    /** Denormalised COUNT(coupon_redemptions) — see migration 0500. */
    redemptionCount: integer("redemption_count").notNull().default(0),
    expiresAt:       timestamp("expires_at", { withTimezone: true }),
    isActive:        boolean("is_active").notNull().default(true),
    note:            text("note").notNull().default(""),
    createdBy:       uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt:       timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt:       timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_coupon_codes_code").on(t.code),
    index("idx_coupon_codes_created").on(t.createdAt.desc().nullsFirst()),
    check("coupon_codes_duration_days_check", sql`${t.durationDays} BETWEEN 1 AND 365`),
    check("coupon_codes_max_redemptions_check", sql`${t.maxRedemptions} IS NULL OR ${t.maxRedemptions} > 0`),
    check("coupon_codes_redemption_count_check", sql`${t.redemptionCount} >= 0`),
  ],
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    couponId:     uuid("coupon_id").notNull().references(() => couponCodes.id, { onDelete: "cascade" }),
    userId:       uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    grantedUntil: timestamp("granted_until", { withTimezone: true }).notNull(),
    redeemedAt:   timestamp("redeemed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_coupon_redemptions_coupon_user").on(t.couponId, t.userId),
    index("idx_coupon_redemptions_coupon_redeemed").on(t.couponId, t.redeemedAt.desc().nullsFirst()),
    index("idx_coupon_redemptions_user").on(t.userId),
  ],
);

export type CouponCodeRow = typeof couponCodes.$inferSelect;
export type CouponRedemptionRow = typeof couponRedemptions.$inferSelect;
