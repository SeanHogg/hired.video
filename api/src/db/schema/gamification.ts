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
