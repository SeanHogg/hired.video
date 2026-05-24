/**
 * Gamification aggregate — points, streaks, badges, fraud flags.
 *
 *   • userPointsBalance       — one row per user; balance + lifetime counters + suspension state
 *   • pointsLedger            — append-only log of every points event (earn/redeem/adjust/reverse)
 *   • pointsActivityCounters  — per-user rolling counters that gate user-generated tasks at 100
 *   • pointsStreaks           — daily streak engine state (current, longest, last activity)
 *   • pointsFraudFlags        — flags raised by the fraud engine, awaiting superadmin review
 *   • badges                  — global badge catalog
 *   • userBadges              — per-user earned-badge ledger
 *
 * Separate ledger from `userTokenBalance` on purpose: earned points are
 * suspendable / reversible for fraud, and we never want a fraud rollback
 * to touch purchased AI tokens. Redemption converts points → tokens or
 * a premium-month grant or a gift card at a fixed rate; that conversion
 * is recorded both in `pointsLedger` (debit) and the destination ledger
 * (token balance, plan override, or redemption row).
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  integer,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * Per-user points balance and suspension state. One row per user (unique
 * constraint on user_id, not PK, mirroring userTokenBalance for the same
 * Drizzle inference reason).
 */
export const userPointsBalance = pgTable("user_points_balance", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Currently spendable points. Never goes negative — redemption checks
   *  balance up front. May be zero while suspended. */
  balance: integer("balance").default(0).notNull(),
  /** Lifetime points ever earned (excluding refunds/reversals). Used for
   *  tier/level calculations once badges land. */
  lifetimeEarned: integer("lifetime_earned").default(0).notNull(),
  /** Lifetime points ever spent on redemptions. */
  lifetimeRedeemed: integer("lifetime_redeemed").default(0).notNull(),
  /** Lifetime points reversed by fraud rollback. Audit-only. */
  lifetimeReversed: integer("lifetime_reversed").default(0).notNull(),
  /** When true: awardPoints() is a no-op for this user and redemption is
   *  blocked. Set by fraud engine or superadmin; cleared by superadmin. */
  isSuspended: boolean("is_suspended").default(false).notNull(),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspendedReason: text("suspended_reason"),
  /** super_admin or system that set the suspension. NULL when the fraud
   *  engine flipped it autonomously. */
  suspendedBy: uuid("suspended_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserPointsBalance = typeof userPointsBalance.$inferSelect;
export type NewUserPointsBalance = typeof userPointsBalance.$inferInsert;

/**
 * Append-only ledger of every points event. Never updated; reversals
 * are written as new rows with negative `delta` and `reversesId` set to
 * the original row.
 */
export const pointsLedger = pgTable(
  "points_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Signed integer. Positive = earned; negative = spent or reversed. */
    delta: integer("delta").notNull(),
    /** earn | redeem | adjust | reverse | streak_bonus | badge_bonus. */
    category: varchar("category", { length: 20 }).notNull(),
    /** Action key from the catalog, e.g. "task.complete.system",
     *  "application.submitted", "ai.tool.used", "purchase.token_pack". */
    action: varchar("action", { length: 80 }).notNull(),
    /** Where the event originated. Used by analytics + dedup. */
    source: varchar("source", { length: 40 }).notNull(),
    /** Polymorphic FK — id of the originating entity (task row, usage
     *  ledger row, purchase row, redemption row). String to avoid forcing
     *  a uuid for non-uuid refs. NULL for streak bonuses / admin adjusts. */
    refId: text("ref_id"),
    refType: varchar("ref_type", { length: 40 }),
    /** If this row reverses an earlier earning, points to that row. */
    reversesId: uuid("reverses_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userCreatedIdx: index("points_ledger_user_created_idx").on(t.userId, t.createdAt),
    actionIdx: index("points_ledger_action_idx").on(t.action),
    refIdx: index("points_ledger_ref_idx").on(t.refType, t.refId),
    /** Dedup: at most one earn-row per (user, action, refId). The fraud
     *  engine writes reverse rows in a different `category`, so the
     *  category column participates in the uniqueness. */
    dedupIdx: uniqueIndex("points_ledger_dedup_uniq")
      .on(t.userId, t.action, t.refId, t.category)
      .where(sql`${t.refId} IS NOT NULL`),
  }),
);

export type PointsLedgerRow = typeof pointsLedger.$inferSelect;
export type NewPointsLedgerRow = typeof pointsLedger.$inferInsert;

/**
 * Rolling counters per user. Today the only counter that matters is
 * `userTaskCompletions` — drives the "user-generated tasks earn nothing
 * until 100 completions" gate.
 */
export const pointsActivityCounters = pgTable("points_activity_counters", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Closed user-generated tasks (TaskType < 10). Once ≥ 100, future
   *  user-generated task completions earn points. */
  userTaskCompletions: integer("user_task_completions").default(0).notNull(),
  /** Closed system-generated tasks (TaskType ≥ 10). Audit-only. */
  systemTaskCompletions: integer("system_task_completions").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PointsActivityCounters = typeof pointsActivityCounters.$inferSelect;

/**
 * Streak state. One row per user. `lastActivityDate` is the user's local
 * day (engine resolves user TZ before comparing).
 */
export const pointsStreaks = pgTable("points_streaks", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  currentStreak: integer("current_streak").default(0).notNull(),
  longestStreak: integer("longest_streak").default(0).notNull(),
  lastActivityDate: date("last_activity_date"),
  lastBonusAt: timestamp("last_bonus_at", { withTimezone: true }),
  /** Highest milestone (7, 14, 30, …) paid out in the *current* streak;
   *  resets when the streak resets. Lets the engine award once per
   *  milestone without re-paying on every subsequent day. */
  lastBonusMilestone: integer("last_bonus_milestone").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PointsStreaks = typeof pointsStreaks.$inferSelect;

/**
 * Fraud flags. Open flags surface in the superadmin review queue.
 * `severity = high` => engine auto-suspends. `medium` => engine flags
 * but lets earning continue; `low` => observational only.
 */
export const pointsFraudFlags = pgTable(
  "points_fraud_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 60 }).notNull(),
    severity: varchar("severity", { length: 10 }).notNull(),
    evidence: jsonb("evidence"),
    /** "open" until a superadmin reviews; then "confirmed" or "dismissed". */
    status: varchar("status", { length: 20 }).default("open").notNull(),
    autoSuspended: boolean("auto_suspended").default(false).notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewerNotes: text("reviewer_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userStatusIdx: index("points_fraud_flags_user_status_idx").on(t.userId, t.status),
    statusCreatedIdx: index("points_fraud_flags_status_created_idx").on(t.status, t.createdAt),
  }),
);

export type PointsFraudFlag = typeof pointsFraudFlags.$inferSelect;
export type NewPointsFraudFlag = typeof pointsFraudFlags.$inferInsert;

/**
 * Global badge catalog. Phase-1 ships the schema + a small seed (10-task,
 * 100-task, 7-day-streak). Phase-2 wires the award engine + UI.
 */
export const badges = pgTable("badges", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Stable slug used by the engine ("first_application", "streak_7"). */
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description").notNull(),
  tier: varchar("tier", { length: 20 }).default("bronze").notNull(),
  iconKey: varchar("icon_key", { length: 80 }),
  pointsReward: integer("points_reward").default(0).notNull(),
  /** Roles eligible (JSON array of UserRole). Empty = all roles. */
  roles: jsonb("roles").default([]).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Badge = typeof badges.$inferSelect;
export type NewBadge = typeof badges.$inferInsert;

export const userBadges = pgTable(
  "user_badges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    badgeId: uuid("badge_id")
      .notNull()
      .references(() => badges.id, { onDelete: "cascade" }),
    awardedFor: jsonb("awarded_for"),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userBadgeUniq: uniqueIndex("user_badges_user_badge_uniq").on(t.userId, t.badgeId),
    userAwardedIdx: index("user_badges_user_awarded_idx").on(t.userId, t.awardedAt),
  }),
);

export type UserBadge = typeof userBadges.$inferSelect;
export type NewUserBadge = typeof userBadges.$inferInsert;

/**
 * Point redemptions — Phase 3. One row per "user spent points for
 * something". Status drives the fulfillment lifecycle:
 *
 *   • `ai_credits` + `premium_month` complete synchronously (state goes
 *     pending → fulfilled in the same request).
 *   • `gift_card` calls Tremendous async; state walks pending →
 *     queued (Tremendous accepted the order) → fulfilled (Tremendous
 *     dispatched) or → failed. A SuperAdmin can manually mark a flagged
 *     `gift_card` redemption as `approved` before it dispatches when
 *     the user crosses the $599 1099-MISC YTD threshold (`requires_kyc`
 *     = true and `kyc_completed_at` IS NULL stops auto-dispatch).
 */
export const pointRedemptions = pgTable(
  "point_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SKU id from REDEMPTION_CATALOG, e.g. "ai_credits_100k". */
    skuId: varchar("sku_id", { length: 80 }).notNull(),
    /** Coarse kind (denormalised from the SKU for query convenience). */
    kind: varchar("kind", { length: 30 }).notNull(),
    /** Points debited at redemption time (frozen for audit even if the
     *  catalog price changes later). */
    pointsCost: integer("points_cost").notNull(),
    /** USD-cents value the user redeemed. For ai_credits + premium_month
     *  this is the equivalent retail value (used for KYC threshold
     *  tracking — IRS treats gift cards differently but all earned-
     *  redemption value counts toward the W-9 line). */
    valueCents: integer("value_cents").notNull(),
    /** "pending" | "approved" | "queued" | "fulfilled" | "failed" |
     *  "cancelled". */
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    /** Tremendous order id for gift cards. NULL for AI credits + premium. */
    vendorOrderId: varchar("vendor_order_id", { length: 100 }),
    /** Free-form per-kind grant payload (token count, plan slug+days,
     *  gift-card delivery email + recipient name). */
    grantPayload: jsonb("grant_payload").notNull(),
    /** When the engine completes synchronous fulfillment (ai_credits /
     *  premium_month) OR when Tremendous reports the order shipped. */
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    /** Set when status='failed' or 'cancelled'. */
    failureReason: text("failure_reason"),
    /** When the redemption requires manual SuperAdmin approval (W-9
     *  threshold crossing, suspicious-looking activity flagged by the
     *  fraud engine). */
    requiresKyc: boolean("requires_kyc").default(false).notNull(),
    /** Set when the user completes / SuperAdmin records W-9. Stays NULL
     *  if the user is below the threshold. */
    kycCompletedAt: timestamp("kyc_completed_at", { withTimezone: true }),
    /** SuperAdmin who approved a flagged redemption (null when auto-
     *  approved). */
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userCreatedIdx: index("point_redemptions_user_created_idx").on(t.userId, t.createdAt),
    statusIdx: index("point_redemptions_status_idx").on(t.status),
    vendorOrderIdx: index("point_redemptions_vendor_order_idx").on(t.vendorOrderId),
  }),
);

export type PointRedemption = typeof pointRedemptions.$inferSelect;
export type NewPointRedemption = typeof pointRedemptions.$inferInsert;

/**
 * Per-user tax / W-9 status. Populated when the user crosses the
 * $599 1099-MISC YTD threshold, OR pre-emptively by a SuperAdmin for a
 * known high-redemption user. `ytd_redemption_cents` resets each
 * calendar year via a cron (or lazy on first redemption of the new
 * year — engine checks the `ytdRedemptionYear` field).
 *
 * We deliberately store only the last 4 digits of the SSN/EIN — the
 * full id never lives in the DB; W-9 PDFs go to KYC vendor storage and
 * we hold the pointer.
 */
export const userTaxStatus = pgTable("user_tax_status", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  w9CollectedAt: timestamp("w9_collected_at", { withTimezone: true }),
  /** "personal" | "business" — drives 1099-MISC vs 1099-NEC. */
  taxClassification: varchar("tax_classification", { length: 20 }),
  taxIdLast4: varchar("tax_id_last4", { length: 4 }),
  legalName: text("legal_name"),
  address: jsonb("address"),
  /** Running YTD value of points redeemed (USD cents). Updated on each
   *  redemption fulfilment. */
  ytdRedemptionCents: integer("ytd_redemption_cents").default(0).notNull(),
  ytdRedemptionYear: integer("ytd_redemption_year")
    .default(sql`EXTRACT(YEAR FROM NOW())::int`)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserTaxStatus = typeof userTaxStatus.$inferSelect;
