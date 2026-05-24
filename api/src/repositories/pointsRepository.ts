/**
 * PointsRepository — the gamification aggregate:
 *   • userPointsBalance        — spendable + lifetime counters + suspension
 *   • pointsLedger             — append-only event log
 *   • pointsActivityCounters   — gating counters (100-task threshold)
 *   • pointsStreaks            — daily-streak engine state
 *   • pointsFraudFlags         — open / reviewed fraud signals
 *   • badges / userBadges      — catalog + earnings
 *
 * One aggregate because all seven tables answer "what did this user
 * earn, what's their balance/streak, were they flagged, and what
 * badges did they unlock". Splitting fragments the same transactional
 * story (an award row also bumps balance, may bump a counter, may
 * advance a streak, may unlock a badge).
 *
 * Domain (rules, engines, fraud heuristics) lives in
 * `services/gamification/`; this file is just the typed Drizzle wrapper.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const {
  userPointsBalance,
  pointsLedger,
  pointsActivityCounters,
  pointsStreaks,
  pointsFraudFlags,
  badges,
  userBadges,
} = schema;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = any;

export type PointsBalanceRow = typeof userPointsBalance.$inferSelect;
export type PointsLedgerRow = typeof pointsLedger.$inferSelect;
export type PointsLedgerInsert = typeof pointsLedger.$inferInsert;
export type PointsCountersRow = typeof pointsActivityCounters.$inferSelect;
export type PointsStreakRow = typeof pointsStreaks.$inferSelect;
export type PointsFraudFlagRow = typeof pointsFraudFlags.$inferSelect;
export type PointsFraudFlagInsert = typeof pointsFraudFlags.$inferInsert;
export type BadgeRow = typeof badges.$inferSelect;
export type UserBadgeRow = typeof userBadges.$inferSelect;
export type UserBadgeInsert = typeof userBadges.$inferInsert;

export interface IPointsRepository {
  // ── balance ─────────────────────────────────────────────────────────
  findBalance(userId: string): Promise<PointsBalanceRow | null>;
  /** Atomically apply a points delta and bump the matching lifetime
   *  counter (earned for delta>0 on earn, redeemed for delta<0 on
   *  redeem, reversed for delta<0 on reverse). Upserts the row if the
   *  user has no balance record yet. */
  applyBalanceDelta(
    userId: string,
    delta: number,
    category: "earn" | "redeem" | "adjust" | "reverse" | "streak_bonus" | "badge_bonus",
  ): Promise<PointsBalanceRow>;
  setSuspension(
    userId: string,
    suspend: boolean,
    reason: string | null,
    actorId: string | null,
  ): Promise<PointsBalanceRow>;

  // ── ledger ──────────────────────────────────────────────────────────
  /** Insert a ledger row. Throws on dedup-uniq violation; callers that
   *  want idempotent inserts should catch and ignore the conflict. */
  insertLedger(input: PointsLedgerInsert): Promise<PointsLedgerRow>;
  /** Idempotent variant: inserts on conflict-do-nothing. Returns the
   *  existing or newly-inserted row, or null if the conflict swallowed
   *  the insert and we don't fetch the existing one for perf reasons. */
  insertLedgerIdempotent(input: PointsLedgerInsert): Promise<PointsLedgerRow | null>;
  findRecentLedger(userId: string, limit: number): Promise<PointsLedgerRow[]>;
  findLedgerByAction(
    userId: string,
    action: string,
    sinceMs: number,
    limit: number,
  ): Promise<PointsLedgerRow[]>;
  countEarnedSince(userId: string, sinceMs: number, action?: string): Promise<number>;
  sumEarnedSince(userId: string, sinceMs: number, action?: string): Promise<number>;
  /** Lifetime count of "earn" ledger rows for this user + action. Used
   *  by the badge engine to know "is this the 10th application?". */
  countEarnsByAction(userId: string, action: string): Promise<number>;

  // ── counters ────────────────────────────────────────────────────────
  findCounters(userId: string): Promise<PointsCountersRow | null>;
  incrementCounter(
    userId: string,
    kind: "user_task" | "system_task",
    delta: number,
  ): Promise<PointsCountersRow>;

  // ── streaks ─────────────────────────────────────────────────────────
  findStreak(userId: string): Promise<PointsStreakRow | null>;
  upsertStreak(
    userId: string,
    patch: {
      currentStreak: number;
      longestStreak: number;
      lastActivityDate: string; // YYYY-MM-DD
      lastBonusAt?: Date | null;
      lastBonusMilestone?: number;
    },
  ): Promise<PointsStreakRow>;

  // ── fraud ───────────────────────────────────────────────────────────
  insertFraudFlag(input: PointsFraudFlagInsert): Promise<PointsFraudFlagRow>;
  findOpenFraudFlags(limit: number): Promise<PointsFraudFlagRow[]>;
  findFraudFlagsForUser(userId: string): Promise<PointsFraudFlagRow[]>;
  resolveFraudFlag(
    flagId: string,
    decision: "confirmed" | "dismissed",
    reviewerId: string,
    notes: string | null,
  ): Promise<PointsFraudFlagRow>;

  // ── badges ──────────────────────────────────────────────────────────
  listBadges(): Promise<BadgeRow[]>;
  findBadgeBySlug(slug: string): Promise<BadgeRow | null>;
  listUserBadges(userId: string): Promise<UserBadgeRow[]>;
  awardBadge(input: UserBadgeInsert): Promise<UserBadgeRow | null>;

  // ── stats (superadmin) ──────────────────────────────────────────────
  globalStats(): Promise<{
    totalUsers: number;
    suspendedUsers: number;
    totalEarned: number;
    totalRedeemed: number;
    totalBalance: number;
    openFraudFlags: number;
  }>;
  topEarners(limit: number): Promise<Array<{ userId: string; lifetimeEarned: number; balance: number }>>;
}

export class PointsRepository implements IPointsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  // ── balance ──────────────────────────────────────────────────────────

  async findBalance(userId: string): Promise<PointsBalanceRow | null> {
    const [row] = await this.db
      .select()
      .from(userPointsBalance)
      .where(eq(userPointsBalance.userId, userId))
      .limit(1);
    return (row as PointsBalanceRow) ?? null;
  }

  async applyBalanceDelta(
    userId: string,
    delta: number,
    category: "earn" | "redeem" | "adjust" | "reverse" | "streak_bonus" | "badge_bonus",
  ): Promise<PointsBalanceRow> {
    const earnedAdd = delta > 0 && (category === "earn" || category === "streak_bonus" || category === "badge_bonus")
      ? delta
      : 0;
    const redeemedAdd = delta < 0 && category === "redeem" ? -delta : 0;
    const reversedAdd = delta < 0 && category === "reverse" ? -delta : 0;

    const [row] = await this.db
      .insert(userPointsBalance)
      .values({
        userId,
        balance: delta > 0 ? delta : 0,
        lifetimeEarned: earnedAdd,
        lifetimeRedeemed: redeemedAdd,
        lifetimeReversed: reversedAdd,
      })
      .onConflictDoUpdate({
        target: userPointsBalance.userId,
        set: {
          balance: sql`GREATEST(${userPointsBalance.balance} + ${delta}, 0)`,
          lifetimeEarned: sql`${userPointsBalance.lifetimeEarned} + ${earnedAdd}`,
          lifetimeRedeemed: sql`${userPointsBalance.lifetimeRedeemed} + ${redeemedAdd}`,
          lifetimeReversed: sql`${userPointsBalance.lifetimeReversed} + ${reversedAdd}`,
          updatedAt: this.now(),
        },
      })
      .returning();
    return row as PointsBalanceRow;
  }

  async setSuspension(
    userId: string,
    suspend: boolean,
    reason: string | null,
    actorId: string | null,
  ): Promise<PointsBalanceRow> {
    const [row] = await this.db
      .insert(userPointsBalance)
      .values({
        userId,
        isSuspended: suspend,
        suspendedAt: suspend ? this.now() : null,
        suspendedReason: suspend ? reason : null,
        suspendedBy: suspend ? actorId : null,
      })
      .onConflictDoUpdate({
        target: userPointsBalance.userId,
        set: {
          isSuspended: suspend,
          suspendedAt: suspend ? this.now() : null,
          suspendedReason: suspend ? reason : null,
          suspendedBy: suspend ? actorId : null,
          updatedAt: this.now(),
        },
      })
      .returning();
    return row as PointsBalanceRow;
  }

  // ── ledger ────────────────────────────────────────────────────────────

  async insertLedger(input: PointsLedgerInsert): Promise<PointsLedgerRow> {
    const [row] = await this.db.insert(pointsLedger).values(input).returning();
    return row as PointsLedgerRow;
  }

  async insertLedgerIdempotent(input: PointsLedgerInsert): Promise<PointsLedgerRow | null> {
    // Dedup unique index is (user_id, action, ref_id, category) where ref_id
    // is not null. For null ref_id the conflict path is N/A — those rows
    // (streak bonuses, admin adjusts) come from callers that already
    // ensure uniqueness via lastBonusMilestone or a separate guard.
    const [row] = await this.db
      .insert(pointsLedger)
      .values(input)
      .onConflictDoNothing()
      .returning();
    return (row as PointsLedgerRow) ?? null;
  }

  async findRecentLedger(userId: string, limit: number): Promise<PointsLedgerRow[]> {
    const rows = await this.db
      .select()
      .from(pointsLedger)
      .where(eq(pointsLedger.userId, userId))
      .orderBy(desc(pointsLedger.createdAt))
      .limit(limit);
    return rows as PointsLedgerRow[];
  }

  async findLedgerByAction(
    userId: string,
    action: string,
    sinceMs: number,
    limit: number,
  ): Promise<PointsLedgerRow[]> {
    const cutoff = new Date(Date.now() - sinceMs);
    const rows = await this.db
      .select()
      .from(pointsLedger)
      .where(
        and(
          eq(pointsLedger.userId, userId),
          eq(pointsLedger.action, action),
          gte(pointsLedger.createdAt, cutoff),
        ),
      )
      .orderBy(desc(pointsLedger.createdAt))
      .limit(limit);
    return rows as PointsLedgerRow[];
  }

  async countEarnedSince(userId: string, sinceMs: number, action?: string): Promise<number> {
    const cutoff = new Date(Date.now() - sinceMs);
    const conditions = [
      eq(pointsLedger.userId, userId),
      gte(pointsLedger.createdAt, cutoff),
      eq(pointsLedger.category, "earn"),
    ];
    if (action) conditions.push(eq(pointsLedger.action, action));
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(pointsLedger)
      .where(and(...conditions));
    return row?.c ?? 0;
  }

  async sumEarnedSince(userId: string, sinceMs: number, action?: string): Promise<number> {
    const cutoff = new Date(Date.now() - sinceMs);
    const conditions = [
      eq(pointsLedger.userId, userId),
      gte(pointsLedger.createdAt, cutoff),
      eq(pointsLedger.category, "earn"),
    ];
    if (action) conditions.push(eq(pointsLedger.action, action));
    const [row] = await this.db
      .select({ s: sql<number>`coalesce(sum(${pointsLedger.delta}), 0)::int` })
      .from(pointsLedger)
      .where(and(...conditions));
    return row?.s ?? 0;
  }

  // ── counters ──────────────────────────────────────────────────────────

  async findCounters(userId: string): Promise<PointsCountersRow | null> {
    const [row] = await this.db
      .select()
      .from(pointsActivityCounters)
      .where(eq(pointsActivityCounters.userId, userId))
      .limit(1);
    return (row as PointsCountersRow) ?? null;
  }

  async incrementCounter(
    userId: string,
    kind: "user_task" | "system_task",
    delta: number,
  ): Promise<PointsCountersRow> {
    const isUser = kind === "user_task";
    const [row] = await this.db
      .insert(pointsActivityCounters)
      .values({
        userId,
        userTaskCompletions: isUser ? delta : 0,
        systemTaskCompletions: isUser ? 0 : delta,
      })
      .onConflictDoUpdate({
        target: pointsActivityCounters.userId,
        set: {
          userTaskCompletions: isUser
            ? sql`${pointsActivityCounters.userTaskCompletions} + ${delta}`
            : pointsActivityCounters.userTaskCompletions,
          systemTaskCompletions: !isUser
            ? sql`${pointsActivityCounters.systemTaskCompletions} + ${delta}`
            : pointsActivityCounters.systemTaskCompletions,
          updatedAt: this.now(),
        },
      })
      .returning();
    return row as PointsCountersRow;
  }

  // ── streaks ───────────────────────────────────────────────────────────

  async findStreak(userId: string): Promise<PointsStreakRow | null> {
    const [row] = await this.db
      .select()
      .from(pointsStreaks)
      .where(eq(pointsStreaks.userId, userId))
      .limit(1);
    return (row as PointsStreakRow) ?? null;
  }

  async upsertStreak(
    userId: string,
    patch: {
      currentStreak: number;
      longestStreak: number;
      lastActivityDate: string;
      lastBonusAt?: Date | null;
      lastBonusMilestone?: number;
    },
  ): Promise<PointsStreakRow> {
    const [row] = await this.db
      .insert(pointsStreaks)
      .values({
        userId,
        currentStreak: patch.currentStreak,
        longestStreak: patch.longestStreak,
        lastActivityDate: patch.lastActivityDate,
        lastBonusAt: patch.lastBonusAt ?? null,
        lastBonusMilestone: patch.lastBonusMilestone ?? 0,
      })
      .onConflictDoUpdate({
        target: pointsStreaks.userId,
        set: {
          currentStreak: patch.currentStreak,
          longestStreak: patch.longestStreak,
          lastActivityDate: patch.lastActivityDate,
          ...(patch.lastBonusAt !== undefined ? { lastBonusAt: patch.lastBonusAt } : {}),
          ...(patch.lastBonusMilestone !== undefined
            ? { lastBonusMilestone: patch.lastBonusMilestone }
            : {}),
          updatedAt: this.now(),
        },
      })
      .returning();
    return row as PointsStreakRow;
  }

  // ── fraud ─────────────────────────────────────────────────────────────

  async insertFraudFlag(input: PointsFraudFlagInsert): Promise<PointsFraudFlagRow> {
    const [row] = await this.db.insert(pointsFraudFlags).values(input).returning();
    return row as PointsFraudFlagRow;
  }

  async findOpenFraudFlags(limit: number): Promise<PointsFraudFlagRow[]> {
    const rows = await this.db
      .select()
      .from(pointsFraudFlags)
      .where(eq(pointsFraudFlags.status, "open"))
      .orderBy(desc(pointsFraudFlags.createdAt))
      .limit(limit);
    return rows as PointsFraudFlagRow[];
  }

  async findFraudFlagsForUser(userId: string): Promise<PointsFraudFlagRow[]> {
    const rows = await this.db
      .select()
      .from(pointsFraudFlags)
      .where(eq(pointsFraudFlags.userId, userId))
      .orderBy(desc(pointsFraudFlags.createdAt));
    return rows as PointsFraudFlagRow[];
  }

  async resolveFraudFlag(
    flagId: string,
    decision: "confirmed" | "dismissed",
    reviewerId: string,
    notes: string | null,
  ): Promise<PointsFraudFlagRow> {
    const [row] = await this.db
      .update(pointsFraudFlags)
      .set({
        status: decision,
        reviewedAt: this.now(),
        reviewedBy: reviewerId,
        reviewerNotes: notes,
      })
      .where(eq(pointsFraudFlags.id, flagId))
      .returning();
    return row as PointsFraudFlagRow;
  }

  // ── badges ────────────────────────────────────────────────────────────

  async listBadges(): Promise<BadgeRow[]> {
    return (await this.db.select().from(badges).where(eq(badges.isActive, true))) as BadgeRow[];
  }

  async findBadgeBySlug(slug: string): Promise<BadgeRow | null> {
    const [row] = await this.db.select().from(badges).where(eq(badges.slug, slug)).limit(1);
    return (row as BadgeRow) ?? null;
  }

  async listUserBadges(userId: string): Promise<UserBadgeRow[]> {
    const rows = await this.db
      .select()
      .from(userBadges)
      .where(eq(userBadges.userId, userId))
      .orderBy(desc(userBadges.awardedAt));
    return rows as UserBadgeRow[];
  }

  async awardBadge(input: UserBadgeInsert): Promise<UserBadgeRow | null> {
    const [row] = await this.db
      .insert(userBadges)
      .values(input)
      .onConflictDoNothing()
      .returning();
    return (row as UserBadgeRow) ?? null;
  }

  // ── stats ─────────────────────────────────────────────────────────────

  async globalStats() {
    const [bal] = await this.db
      .select({
        totalUsers: sql<number>`count(*)::int`,
        suspendedUsers: sql<number>`sum(case when ${userPointsBalance.isSuspended} then 1 else 0 end)::int`,
        totalEarned: sql<number>`coalesce(sum(${userPointsBalance.lifetimeEarned}), 0)::int`,
        totalRedeemed: sql<number>`coalesce(sum(${userPointsBalance.lifetimeRedeemed}), 0)::int`,
        totalBalance: sql<number>`coalesce(sum(${userPointsBalance.balance}), 0)::int`,
      })
      .from(userPointsBalance);
    const [fraud] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(pointsFraudFlags)
      .where(eq(pointsFraudFlags.status, "open"));
    return {
      totalUsers: bal?.totalUsers ?? 0,
      suspendedUsers: bal?.suspendedUsers ?? 0,
      totalEarned: bal?.totalEarned ?? 0,
      totalRedeemed: bal?.totalRedeemed ?? 0,
      totalBalance: bal?.totalBalance ?? 0,
      openFraudFlags: fraud?.c ?? 0,
    };
  }

  async topEarners(limit: number) {
    const rows = await this.db
      .select({
        userId: userPointsBalance.userId,
        lifetimeEarned: userPointsBalance.lifetimeEarned,
        balance: userPointsBalance.balance,
      })
      .from(userPointsBalance)
      .orderBy(desc(userPointsBalance.lifetimeEarned))
      .limit(limit);
    return rows as Array<{ userId: string; lifetimeEarned: number; balance: number }>;
  }
}
