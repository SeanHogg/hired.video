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

import { and, desc, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const {
  users,
  sessions,
  userPointsBalance,
  pointsLedger,
  pointsActivityCounters,
  pointsStreaks,
  pointsTaskStreaks,
  pointsFraudFlags,
  badges,
  userBadges,
  pointRedemptions,
  userTaxStatus,
  campaignDollarsBalance,
  campaignDollarsTransactions,
} = schema;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = any;

export type PointsBalanceRow = typeof userPointsBalance.$inferSelect;
export type PointsLedgerRow = typeof pointsLedger.$inferSelect;
export type PointsLedgerInsert = typeof pointsLedger.$inferInsert;
export type PointsCountersRow = typeof pointsActivityCounters.$inferSelect;
export type PointsStreakRow = typeof pointsStreaks.$inferSelect;
export type PointsTaskStreakRow = typeof pointsTaskStreaks.$inferSelect;
export type PointsFraudFlagRow = typeof pointsFraudFlags.$inferSelect;
export type PointsFraudFlagInsert = typeof pointsFraudFlags.$inferInsert;
export type BadgeRow = typeof badges.$inferSelect;
export type UserBadgeRow = typeof userBadges.$inferSelect;
export type UserBadgeInsert = typeof userBadges.$inferInsert;
export type PointRedemptionRow = typeof pointRedemptions.$inferSelect;
export type PointRedemptionInsert = typeof pointRedemptions.$inferInsert;
export type UserTaxStatusRow = typeof userTaxStatus.$inferSelect;

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
  /** #1136 — task-completion streak (parallel counter; same shape as the
   *  general streak, advances only on task.complete.* actions). */
  findTaskStreak(userId: string): Promise<PointsTaskStreakRow | null>;
  upsertTaskStreak(
    userId: string,
    patch: {
      currentStreak: number;
      longestStreak: number;
      lastActivityDate: string; // YYYY-MM-DD
      lastBonusAt?: Date | null;
      lastBonusMilestone?: number;
    },
  ): Promise<PointsTaskStreakRow>;

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
  /** #1117 — count OTHER accounts that share this user's signup IP (sybil
   *  ring signal). 0 when the user has no recorded signup IP. */
  countAccountsOnSignupIp(userId: string): Promise<number>;
  /** #1117 — count OTHER accounts that share any of this user's device
   *  fingerprints (device-clustering signal). 0 when none recorded. */
  countAccountsOnDeviceFingerprint(userId: string): Promise<number>;

  // ── badges ──────────────────────────────────────────────────────────
  listBadges(): Promise<BadgeRow[]>;
  findBadgeBySlug(slug: string): Promise<BadgeRow | null>;
  listUserBadges(userId: string): Promise<UserBadgeRow[]>;
  /** Insert a user_badges row only if no row exists for (userId, badgeId).
   *  Use for non-repeatable badges. Returns null when already earned. */
  awardBadgeOnce(input: UserBadgeInsert): Promise<UserBadgeRow | null>;
  /** Always insert a new user_badges row. Use for repeatable badges
   *  (streak rungs); each call records another earn. */
  awardBadgeRepeatable(input: UserBadgeInsert): Promise<UserBadgeRow>;
  /** Per-user roll-up: for each badge id the user has earned, return the
   *  total count + the latest awardedAt + the full earn-timestamp list.
   *  Drives the gallery's "earned N times, latest on…" rendering. */
  listUserBadgeEarns(userId: string): Promise<Array<{
    badgeId: string;
    earnCount: number;
    latestAwardedAt: Date;
    earnedAt: Date[];
  }>>;

  // ── redemptions ─────────────────────────────────────────────────────
  insertRedemption(input: PointRedemptionInsert): Promise<PointRedemptionRow>;
  updateRedemption(
    id: string,
    patch: Partial<{
      status: string;
      vendorOrderId: string | null;
      fulfilledAt: Date | null;
      failureReason: string | null;
      approvedBy: string | null;
      approvedAt: Date | null;
      kycCompletedAt: Date | null;
      metadata: Record<string, unknown> | null;
    }>,
  ): Promise<PointRedemptionRow>;
  findRedemptionsForUser(userId: string, limit: number): Promise<PointRedemptionRow[]>;
  findRedemptionsByStatus(status: string, limit: number): Promise<PointRedemptionRow[]>;
  findRedemptionById(id: string): Promise<PointRedemptionRow | null>;

  // ── tax status ──────────────────────────────────────────────────────
  findTaxStatus(userId: string): Promise<UserTaxStatusRow | null>;
  /** Adds `addCents` to the YTD redemption running total. Auto-resets
   *  to `addCents` when the stored `ytdRedemptionYear` is older than
   *  the current year. */
  bumpYtdRedemption(userId: string, addCents: number, currentYear: number): Promise<UserTaxStatusRow>;
  /** Record that the user filed their W-9 (or that a SA confirmed it
   *  out-of-band). Upserts the tax_status row if one doesn't exist. */
  markW9Collected(
    userId: string,
    args: { legalName: string; taxIdLast4: string; taxClassification: "personal" | "business" },
  ): Promise<UserTaxStatusRow>;

  // ── campaign dollars (#169 — internal credit currency) ─────────────
  /** Grant Campaign $ into the user's balance. Idempotent on
   *  `redemptionId` — re-running the same id is a no-op. */
  grantCampaignDollars(args: {
    userId: string;
    amountCents: number;
    redemptionId: string;
    description: string;
  }): Promise<void>;
  /** Current Campaign $ balance row (null if user never received any). */
  findCampaignDollarsBalance(userId: string): Promise<unknown>;
  /** Latest N Campaign $ transactions for the user, newest first. */
  listCampaignDollarsTransactions(userId: string, limit: number): Promise<unknown[]>;
  /** Debit Campaign $ atomically; idempotent on (referenceId, referenceType). */
  spendCampaignDollars(args: {
    userId: string;
    maxCents: number;
    referenceId: string;
    referenceType: "boost_checkout" | "ad_spend";
    description: string;
  }): Promise<{ spentCents: number; balanceAfterCents: number }>;

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

  async countEarnsByAction(userId: string, action: string): Promise<number> {
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(pointsLedger)
      .where(
        and(
          eq(pointsLedger.userId, userId),
          eq(pointsLedger.action, action),
          eq(pointsLedger.category, "earn"),
        ),
      );
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

  // ── task streak (#1136) — same logic, different table ──────────────────

  async findTaskStreak(userId: string): Promise<PointsTaskStreakRow | null> {
    const [row] = await this.db
      .select()
      .from(pointsTaskStreaks)
      .where(eq(pointsTaskStreaks.userId, userId))
      .limit(1);
    return (row as PointsTaskStreakRow) ?? null;
  }

  async upsertTaskStreak(
    userId: string,
    patch: {
      currentStreak: number;
      longestStreak: number;
      lastActivityDate: string;
      lastBonusAt?: Date | null;
      lastBonusMilestone?: number;
    },
  ): Promise<PointsTaskStreakRow> {
    const [row] = await this.db
      .insert(pointsTaskStreaks)
      .values({
        userId,
        currentStreak: patch.currentStreak,
        longestStreak: patch.longestStreak,
        lastActivityDate: patch.lastActivityDate,
        lastBonusAt: patch.lastBonusAt ?? null,
        lastBonusMilestone: patch.lastBonusMilestone ?? 0,
      })
      .onConflictDoUpdate({
        target: pointsTaskStreaks.userId,
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
    return row as PointsTaskStreakRow;
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

  // #1117 — fraud-cluster signals. Bounded single-row counts; the engine
  // caller caches these (slow-changing) so they don't hit the DB on every
  // user-task award.
  async countAccountsOnSignupIp(userId: string): Promise<number> {
    const [me] = await this.db
      .select({ ip: users.signupIp })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!me?.ip) return 0;
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.signupIp, me.ip), ne(users.id, userId)));
    return row?.c ?? 0;
  }

  async countAccountsOnDeviceFingerprint(userId: string): Promise<number> {
    const myRows = await this.db
      .select({ fp: sessions.deviceFingerprint })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNotNull(sessions.deviceFingerprint)));
    const fps = [...new Set(myRows.map((r) => r.fp).filter((f): f is string => Boolean(f)))];
    if (fps.length === 0) return 0;
    const rows = await this.db
      .select({ uid: sessions.userId })
      .from(sessions)
      .where(and(inArray(sessions.deviceFingerprint, fps), ne(sessions.userId, userId)));
    return new Set(rows.map((r) => r.uid)).size;
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

  async awardBadgeOnce(input: UserBadgeInsert): Promise<UserBadgeRow | null> {
    // Application-side guard against duplicate award. The unique
    // constraint was dropped in migration 0099 so repeatable streak
    // badges could accumulate rows; non-repeatable badges keep the
    // once-per-user invariant via this pre-insert check.
    //
    // `userId` and `badgeId` are NOT NULL in the schema (FK constraints
    // would reject a NULL insert anyway), so we validate before the
    // query rather than papering over with a non-null assertion.
    if (!input.userId || !input.badgeId) {
      throw new Error("awardBadgeOnce requires userId + badgeId");
    }
    const [existing] = await this.db
      .select({ id: userBadges.id })
      .from(userBadges)
      .where(and(eq(userBadges.userId, input.userId), eq(userBadges.badgeId, input.badgeId)))
      .limit(1);
    if (existing) return null;
    const [row] = await this.db.insert(userBadges).values(input).returning();
    return row as UserBadgeRow;
  }

  async awardBadgeRepeatable(input: UserBadgeInsert): Promise<UserBadgeRow> {
    const [row] = await this.db.insert(userBadges).values(input).returning();
    return row as UserBadgeRow;
  }

  async listUserBadgeEarns(userId: string) {
    const rows = await this.db
      .select({
        badgeId: userBadges.badgeId,
        awardedAt: userBadges.awardedAt,
      })
      .from(userBadges)
      .where(eq(userBadges.userId, userId))
      .orderBy(desc(userBadges.awardedAt));
    const map = new Map<
      string,
      { earnCount: number; latestAwardedAt: Date; earnedAt: Date[] }
    >();
    for (const r of rows as Array<{ badgeId: string; awardedAt: Date }>) {
      const cur = map.get(r.badgeId);
      if (cur) {
        cur.earnCount += 1;
        cur.earnedAt.push(r.awardedAt);
        if (r.awardedAt > cur.latestAwardedAt) cur.latestAwardedAt = r.awardedAt;
      } else {
        map.set(r.badgeId, {
          earnCount: 1,
          latestAwardedAt: r.awardedAt,
          earnedAt: [r.awardedAt],
        });
      }
    }
    return Array.from(map.entries()).map(([badgeId, v]) => ({ badgeId, ...v }));
  }

  // ── redemptions ───────────────────────────────────────────────────────

  async insertRedemption(input: PointRedemptionInsert): Promise<PointRedemptionRow> {
    const [row] = await this.db.insert(pointRedemptions).values(input).returning();
    return row as PointRedemptionRow;
  }

  async updateRedemption(
    id: string,
    patch: Partial<{
      status: string;
      vendorOrderId: string | null;
      fulfilledAt: Date | null;
      failureReason: string | null;
      approvedBy: string | null;
      approvedAt: Date | null;
      kycCompletedAt: Date | null;
      metadata: Record<string, unknown> | null;
    }>,
  ): Promise<PointRedemptionRow> {
    const [row] = await this.db
      .update(pointRedemptions)
      .set({ ...patch, updatedAt: this.now() })
      .where(eq(pointRedemptions.id, id))
      .returning();
    return row as PointRedemptionRow;
  }

  async findRedemptionsForUser(userId: string, limit: number): Promise<PointRedemptionRow[]> {
    const rows = await this.db
      .select()
      .from(pointRedemptions)
      .where(eq(pointRedemptions.userId, userId))
      .orderBy(desc(pointRedemptions.createdAt))
      .limit(limit);
    return rows as PointRedemptionRow[];
  }

  async findRedemptionsByStatus(status: string, limit: number): Promise<PointRedemptionRow[]> {
    const rows = await this.db
      .select()
      .from(pointRedemptions)
      .where(eq(pointRedemptions.status, status))
      .orderBy(desc(pointRedemptions.createdAt))
      .limit(limit);
    return rows as PointRedemptionRow[];
  }

  async findRedemptionById(id: string): Promise<PointRedemptionRow | null> {
    const [row] = await this.db
      .select()
      .from(pointRedemptions)
      .where(eq(pointRedemptions.id, id))
      .limit(1);
    return (row as PointRedemptionRow) ?? null;
  }

  // ── tax status ────────────────────────────────────────────────────────

  async findTaxStatus(userId: string): Promise<UserTaxStatusRow | null> {
    const [row] = await this.db
      .select()
      .from(userTaxStatus)
      .where(eq(userTaxStatus.userId, userId))
      .limit(1);
    return (row as UserTaxStatusRow) ?? null;
  }

  async bumpYtdRedemption(
    userId: string,
    addCents: number,
    currentYear: number,
  ): Promise<UserTaxStatusRow> {
    // Year-rollover semantics: when the stored row's `ytdRedemptionYear`
    // is earlier than `currentYear`, replace (not add) — first
    // redemption of a new tax year starts fresh.
    const [row] = await this.db
      .insert(userTaxStatus)
      .values({
        userId,
        ytdRedemptionCents: addCents,
        ytdRedemptionYear: currentYear,
      })
      .onConflictDoUpdate({
        target: userTaxStatus.userId,
        set: {
          ytdRedemptionCents: sql`
            CASE WHEN ${userTaxStatus.ytdRedemptionYear} < ${currentYear}
              THEN ${addCents}
              ELSE ${userTaxStatus.ytdRedemptionCents} + ${addCents}
            END
          `,
          ytdRedemptionYear: currentYear,
          updatedAt: this.now(),
        },
      })
      .returning();
    return row as UserTaxStatusRow;
  }

  /** #169 — Grant Campaign $ into the user's balance. Idempotent on the
   *  redemption row: re-running the same `redemptionId` is a no-op. */
  async grantCampaignDollars(args: {
    userId: string;
    amountCents: number;
    redemptionId: string;
    description: string;
  }): Promise<void> {
    // Dedup guard: if a transaction with this reference_id already exists
    // we're processing a retry — skip both the balance bump and the
    // transaction insert.
    const existing = await this.db
      .select({ id: campaignDollarsTransactions.id })
      .from(campaignDollarsTransactions)
      .where(
        and(
          eq(campaignDollarsTransactions.referenceId, args.redemptionId),
          eq(campaignDollarsTransactions.referenceType, "redemption"),
        ),
      )
      .limit(1);
    if (existing.length > 0) return;

    const [bumped] = await this.db
      .insert(campaignDollarsBalance)
      .values({
        userId: args.userId,
        balanceCents: args.amountCents,
        lifetimeGrantedCents: args.amountCents,
      })
      .onConflictDoUpdate({
        target: campaignDollarsBalance.userId,
        set: {
          balanceCents: sql`${campaignDollarsBalance.balanceCents} + ${args.amountCents}`,
          lifetimeGrantedCents: sql`${campaignDollarsBalance.lifetimeGrantedCents} + ${args.amountCents}`,
          updatedAt: this.now(),
        },
      })
      .returning();

    await this.db.insert(campaignDollarsTransactions).values({
      userId: args.userId,
      kind: "grant_redemption",
      amountCents: args.amountCents,
      balanceAfterCents: bumped.balanceCents,
      referenceId: args.redemptionId,
      referenceType: "redemption",
      description: args.description,
    });
  }

  /** Read current Campaign $ balance row. Used by /api/campaign-dollars
   *  + by boost checkout. */
  async findCampaignDollarsBalance(userId: string) {
    const [row] = await this.db
      .select()
      .from(campaignDollarsBalance)
      .where(eq(campaignDollarsBalance.userId, userId))
      .limit(1);
    return row ?? null;
  }

  /** #177 — Debit Campaign $ to pay (part of) a boost or ad order. Caller
   *  passes the maximum it'd like to draw; returns the amount actually
   *  spent (≤ requested). Atomicity: a single conditional UPDATE with
   *  RETURNING means the spend never goes negative even under concurrent
   *  calls. The transaction row is written only if balance moved. */
  async spendCampaignDollars(args: {
    userId: string;
    maxCents: number;
    referenceId: string;
    referenceType: "boost_checkout" | "ad_spend";
    description: string;
  }): Promise<{ spentCents: number; balanceAfterCents: number }> {
    if (args.maxCents <= 0) return { spentCents: 0, balanceAfterCents: 0 };

    const existing = await this.db
      .select({ id: campaignDollarsTransactions.id })
      .from(campaignDollarsTransactions)
      .where(
        and(
          eq(campaignDollarsTransactions.referenceId, args.referenceId),
          eq(campaignDollarsTransactions.referenceType, args.referenceType),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      const [bal] = await this.db
        .select({ balanceCents: campaignDollarsBalance.balanceCents })
        .from(campaignDollarsBalance)
        .where(eq(campaignDollarsBalance.userId, args.userId))
        .limit(1);
      return { spentCents: 0, balanceAfterCents: bal?.balanceCents ?? 0 };
    }

    const [current] = await this.db
      .select({ balanceCents: campaignDollarsBalance.balanceCents })
      .from(campaignDollarsBalance)
      .where(eq(campaignDollarsBalance.userId, args.userId))
      .limit(1);
    const have = current?.balanceCents ?? 0;
    const spend = Math.min(have, args.maxCents);
    if (spend <= 0) return { spentCents: 0, balanceAfterCents: have };

    const [bumped] = await this.db
      .update(campaignDollarsBalance)
      .set({
        balanceCents: sql`${campaignDollarsBalance.balanceCents} - ${spend}`,
        lifetimeSpentCents: sql`${campaignDollarsBalance.lifetimeSpentCents} + ${spend}`,
        updatedAt: this.now(),
      })
      .where(
        and(
          eq(campaignDollarsBalance.userId, args.userId),
          sql`${campaignDollarsBalance.balanceCents} >= ${spend}`,
        ),
      )
      .returning();
    if (!bumped) return { spentCents: 0, balanceAfterCents: have };

    await this.db.insert(campaignDollarsTransactions).values({
      userId: args.userId,
      kind: args.referenceType === "boost_checkout" ? "boost_spend" : "ad_spend",
      amountCents: -spend,
      balanceAfterCents: bumped.balanceCents,
      referenceId: args.referenceId,
      referenceType: args.referenceType,
      description: args.description,
    });
    return { spentCents: spend, balanceAfterCents: bumped.balanceCents };
  }

  async listCampaignDollarsTransactions(userId: string, limit: number) {
    return await this.db
      .select()
      .from(campaignDollarsTransactions)
      .where(eq(campaignDollarsTransactions.userId, userId))
      .orderBy(desc(campaignDollarsTransactions.createdAt))
      .limit(limit);
  }

  async markW9Collected(
    userId: string,
    args: { legalName: string; taxIdLast4: string; taxClassification: "personal" | "business" },
  ): Promise<UserTaxStatusRow> {
    const [row] = await this.db
      .insert(userTaxStatus)
      .values({
        userId,
        legalName: args.legalName,
        taxIdLast4: args.taxIdLast4,
        taxClassification: args.taxClassification,
        w9CollectedAt: this.now(),
      })
      .onConflictDoUpdate({
        target: userTaxStatus.userId,
        set: {
          legalName: args.legalName,
          taxIdLast4: args.taxIdLast4,
          taxClassification: args.taxClassification,
          w9CollectedAt: this.now(),
          updatedAt: this.now(),
        },
      })
      .returning();
    return row as UserTaxStatusRow;
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
