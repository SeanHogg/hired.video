/**
 * In-memory IPointsRepository for engine tests.
 *
 * The gamification engines (PointsEngine, RedemptionEngine) depend on the
 * `IPointsRepository` interface, not a raw Drizzle db — so the natural test
 * seam is a fake repo, not buildFakeDb. This fake keeps real semantics for
 * the behaviours the engines lean on:
 *
 *   • insertLedgerIdempotent dedups on (userId, action, refId, category)
 *     when refId is non-null (mirrors points_ledger_dedup_uniq).
 *   • applyBalanceDelta clamps balance at 0 and bumps the matching lifetime
 *     counter, exactly like the SQL GREATEST(...) upsert.
 *   • sumEarnedSince / countEarnsByAction filter on category='earn'.
 *   • awardBadgeOnce enforces once-per-(user,badge); awardBadgeRepeatable
 *     always inserts (migration 0099 semantics).
 *
 * A leak (wrong dedup, un-clamped balance, miscounted earns) surfaces as a
 * wrong assertion, not an un-exercised path.
 */

import type {
  IPointsRepository,
  PointsBalanceRow,
  PointsLedgerRow,
  PointsLedgerInsert,
  PointsCountersRow,
  PointsStreakRow,
  PointsTaskStreakRow,
  PointsFraudFlagRow,
  PointsFraudFlagInsert,
  BadgeRow,
  UserBadgeRow,
  UserBadgeInsert,
  PointRedemptionRow,
  PointRedemptionInsert,
  UserTaxStatusRow,
} from "../../../repositories/pointsRepository.js";

let _seq = 0;
export const uid = () => `00000000-0000-4000-8000-${String(++_seq).padStart(12, "0")}`;

type Category = "earn" | "redeem" | "adjust" | "reverse" | "streak_bonus" | "badge_bonus";

export class FakePointsRepo implements IPointsRepository {
  balances = new Map<string, PointsBalanceRow>();
  ledger: PointsLedgerRow[] = [];
  counters = new Map<string, PointsCountersRow>();
  streaks = new Map<string, PointsStreakRow>();
  taskStreaks = new Map<string, PointsTaskStreakRow>();
  fraudFlags: PointsFraudFlagRow[] = [];
  badges: BadgeRow[] = [];
  userBadges: UserBadgeRow[] = [];
  redemptions: PointRedemptionRow[] = [];
  taxStatus = new Map<string, UserTaxStatusRow>();
  campaignGrants: Array<{ userId: string; amountCents: number; redemptionId: string }> = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  // ── balance ─────────────────────────────────────────────────────────
  async findBalance(userId: string): Promise<PointsBalanceRow | null> {
    return this.balances.get(userId) ?? null;
  }

  async applyBalanceDelta(userId: string, delta: number, category: Category): Promise<PointsBalanceRow> {
    const earnedAdd =
      delta > 0 && (category === "earn" || category === "streak_bonus" || category === "badge_bonus")
        ? delta
        : 0;
    const redeemedAdd = delta < 0 && category === "redeem" ? -delta : 0;
    const reversedAdd = delta < 0 && category === "reverse" ? -delta : 0;

    const existing = this.balances.get(userId);
    const row: PointsBalanceRow = existing
      ? {
          ...existing,
          balance: Math.max(existing.balance + delta, 0),
          lifetimeEarned: existing.lifetimeEarned + earnedAdd,
          lifetimeRedeemed: existing.lifetimeRedeemed + redeemedAdd,
          lifetimeReversed: existing.lifetimeReversed + reversedAdd,
          updatedAt: this.now(),
        }
      : ({
          id: uid(),
          userId,
          balance: Math.max(delta, 0),
          lifetimeEarned: earnedAdd,
          lifetimeRedeemed: redeemedAdd,
          lifetimeReversed: reversedAdd,
          isSuspended: false,
          suspendedAt: null,
          suspendedReason: null,
          suspendedBy: null,
          updatedAt: this.now(),
        } as PointsBalanceRow);
    this.balances.set(userId, row);
    return row;
  }

  async setSuspension(
    userId: string,
    suspend: boolean,
    reason: string | null,
    actorId: string | null,
  ): Promise<PointsBalanceRow> {
    const existing = this.balances.get(userId);
    const base: PointsBalanceRow =
      existing ??
      ({
        id: uid(),
        userId,
        balance: 0,
        lifetimeEarned: 0,
        lifetimeRedeemed: 0,
        lifetimeReversed: 0,
        isSuspended: false,
        suspendedAt: null,
        suspendedReason: null,
        suspendedBy: null,
        updatedAt: this.now(),
      } as PointsBalanceRow);
    const row: PointsBalanceRow = {
      ...base,
      isSuspended: suspend,
      suspendedAt: suspend ? this.now() : null,
      suspendedReason: suspend ? reason : null,
      suspendedBy: suspend ? actorId : null,
      updatedAt: this.now(),
    };
    this.balances.set(userId, row);
    return row;
  }

  // ── ledger ──────────────────────────────────────────────────────────
  private buildLedgerRow(input: PointsLedgerInsert): PointsLedgerRow {
    return {
      id: uid(),
      userId: input.userId,
      delta: input.delta,
      category: input.category,
      action: input.action,
      source: input.source,
      refId: input.refId ?? null,
      refType: input.refType ?? null,
      reversesId: input.reversesId ?? null,
      metadata: input.metadata ?? null,
      createdAt: this.now(),
    } as PointsLedgerRow;
  }

  async insertLedger(input: PointsLedgerInsert): Promise<PointsLedgerRow> {
    const row = this.buildLedgerRow(input);
    this.ledger.push(row);
    return row;
  }

  async insertLedgerIdempotent(input: PointsLedgerInsert): Promise<PointsLedgerRow | null> {
    if (input.refId != null) {
      const dup = this.ledger.find(
        (r) =>
          r.userId === input.userId &&
          r.action === input.action &&
          r.refId === input.refId &&
          r.category === input.category,
      );
      if (dup) return null;
    }
    return this.insertLedger(input);
  }

  async findRecentLedger(userId: string, limit: number): Promise<PointsLedgerRow[]> {
    return this.ledger
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async findLedgerByAction(
    userId: string,
    action: string,
    sinceMs: number,
    limit: number,
  ): Promise<PointsLedgerRow[]> {
    const cutoff = this.now().getTime() - sinceMs;
    return this.ledger
      .filter((r) => r.userId === userId && r.action === action && r.createdAt.getTime() >= cutoff)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async countEarnedSince(userId: string, sinceMs: number, action?: string): Promise<number> {
    const cutoff = this.now().getTime() - sinceMs;
    return this.ledger.filter(
      (r) =>
        r.userId === userId &&
        r.category === "earn" &&
        r.createdAt.getTime() >= cutoff &&
        (!action || r.action === action),
    ).length;
  }

  async sumEarnedSince(userId: string, sinceMs: number, action?: string): Promise<number> {
    const cutoff = this.now().getTime() - sinceMs;
    return this.ledger
      .filter(
        (r) =>
          r.userId === userId &&
          r.category === "earn" &&
          r.createdAt.getTime() >= cutoff &&
          (!action || r.action === action),
      )
      .reduce((s, r) => s + r.delta, 0);
  }

  async countEarnsByAction(userId: string, action: string): Promise<number> {
    return this.ledger.filter(
      (r) => r.userId === userId && r.action === action && r.category === "earn",
    ).length;
  }

  // ── counters ────────────────────────────────────────────────────────
  async findCounters(userId: string): Promise<PointsCountersRow | null> {
    return this.counters.get(userId) ?? null;
  }

  async incrementCounter(
    userId: string,
    kind: "user_task" | "system_task",
    delta: number,
  ): Promise<PointsCountersRow> {
    const isUser = kind === "user_task";
    const existing = this.counters.get(userId);
    const row: PointsCountersRow = {
      userId,
      userTaskCompletions: (existing?.userTaskCompletions ?? 0) + (isUser ? delta : 0),
      systemTaskCompletions: (existing?.systemTaskCompletions ?? 0) + (isUser ? 0 : delta),
      updatedAt: this.now(),
    } as PointsCountersRow;
    this.counters.set(userId, row);
    return row;
  }

  /** Test helper: set the user-task counter directly (gate setup). */
  setUserTaskCount(userId: string, count: number) {
    this.counters.set(userId, {
      userId,
      userTaskCompletions: count,
      systemTaskCompletions: 0,
      updatedAt: this.now(),
    } as PointsCountersRow);
  }

  // ── streaks ─────────────────────────────────────────────────────────
  async findStreak(userId: string): Promise<PointsStreakRow | null> {
    return this.streaks.get(userId) ?? null;
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
    const existing = this.streaks.get(userId);
    const row: PointsStreakRow = {
      userId,
      currentStreak: patch.currentStreak,
      longestStreak: patch.longestStreak,
      lastActivityDate: patch.lastActivityDate,
      lastBonusAt: patch.lastBonusAt ?? existing?.lastBonusAt ?? null,
      lastBonusMilestone: patch.lastBonusMilestone ?? existing?.lastBonusMilestone ?? 0,
      updatedAt: this.now(),
    } as PointsStreakRow;
    this.streaks.set(userId, row);
    return row;
  }

  async findTaskStreak(userId: string): Promise<PointsTaskStreakRow | null> {
    return this.taskStreaks.get(userId) ?? null;
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
    const existing = this.taskStreaks.get(userId);
    const row: PointsTaskStreakRow = {
      userId,
      currentStreak: patch.currentStreak,
      longestStreak: patch.longestStreak,
      lastActivityDate: patch.lastActivityDate,
      lastBonusAt: patch.lastBonusAt ?? existing?.lastBonusAt ?? null,
      lastBonusMilestone: patch.lastBonusMilestone ?? existing?.lastBonusMilestone ?? 0,
      updatedAt: this.now(),
    } as PointsTaskStreakRow;
    this.taskStreaks.set(userId, row);
    return row;
  }

  // ── fraud ───────────────────────────────────────────────────────────
  async insertFraudFlag(input: PointsFraudFlagInsert): Promise<PointsFraudFlagRow> {
    const row: PointsFraudFlagRow = {
      id: uid(),
      userId: input.userId,
      kind: input.kind,
      severity: input.severity,
      evidence: input.evidence ?? null,
      status: input.status ?? "open",
      autoSuspended: input.autoSuspended ?? false,
      reviewedAt: null,
      reviewedBy: null,
      reviewerNotes: null,
      createdAt: this.now(),
    } as PointsFraudFlagRow;
    this.fraudFlags.push(row);
    return row;
  }

  async findOpenFraudFlags(limit: number): Promise<PointsFraudFlagRow[]> {
    return this.fraudFlags.filter((f) => f.status === "open").slice(0, limit);
  }

  async findFraudFlagsForUser(userId: string): Promise<PointsFraudFlagRow[]> {
    return this.fraudFlags.filter((f) => f.userId === userId);
  }

  async resolveFraudFlag(
    flagId: string,
    decision: "confirmed" | "dismissed",
    reviewerId: string,
    notes: string | null,
  ): Promise<PointsFraudFlagRow> {
    const f = this.fraudFlags.find((x) => x.id === flagId)!;
    f.status = decision;
    f.reviewedBy = reviewerId;
    f.reviewerNotes = notes;
    f.reviewedAt = this.now();
    return f;
  }

  // #1117 — cluster-signal counts; tests set these to exercise the heuristics.
  signupIpAccounts = 0;
  deviceFpAccounts = 0;
  async countAccountsOnSignupIp(): Promise<number> {
    return this.signupIpAccounts;
  }
  async countAccountsOnDeviceFingerprint(): Promise<number> {
    return this.deviceFpAccounts;
  }

  // ── badges ──────────────────────────────────────────────────────────
  seedBadge(b: Partial<BadgeRow> & { slug: string; name: string }): BadgeRow {
    const row: BadgeRow = {
      id: b.id ?? uid(),
      slug: b.slug,
      name: b.name,
      description: b.description ?? "",
      tier: b.tier ?? "bronze",
      iconKey: b.iconKey ?? null,
      pointsReward: b.pointsReward ?? 0,
      roles: b.roles ?? [],
      isRepeatable: b.isRepeatable ?? false,
      isActive: b.isActive ?? true,
      createdAt: this.now(),
    } as BadgeRow;
    this.badges.push(row);
    return row;
  }

  async listBadges(): Promise<BadgeRow[]> {
    return this.badges.filter((b) => b.isActive);
  }

  async findBadgeBySlug(slug: string): Promise<BadgeRow | null> {
    return this.badges.find((b) => b.slug === slug) ?? null;
  }

  async listUserBadges(userId: string): Promise<UserBadgeRow[]> {
    return this.userBadges.filter((ub) => ub.userId === userId);
  }

  async awardBadgeOnce(input: UserBadgeInsert): Promise<UserBadgeRow | null> {
    if (!input.userId || !input.badgeId) throw new Error("awardBadgeOnce requires userId + badgeId");
    const existing = this.userBadges.find(
      (ub) => ub.userId === input.userId && ub.badgeId === input.badgeId,
    );
    if (existing) return null;
    const row: UserBadgeRow = {
      id: uid(),
      userId: input.userId,
      badgeId: input.badgeId,
      awardedFor: input.awardedFor ?? null,
      awardedAt: this.now(),
    } as UserBadgeRow;
    this.userBadges.push(row);
    return row;
  }

  async awardBadgeRepeatable(input: UserBadgeInsert): Promise<UserBadgeRow> {
    const row: UserBadgeRow = {
      id: uid(),
      userId: input.userId,
      badgeId: input.badgeId,
      awardedFor: input.awardedFor ?? null,
      awardedAt: this.now(),
    } as UserBadgeRow;
    this.userBadges.push(row);
    return row;
  }

  async listUserBadgeEarns(userId: string) {
    const map = new Map<string, { earnCount: number; latestAwardedAt: Date; earnedAt: Date[] }>();
    for (const ub of this.userBadges.filter((x) => x.userId === userId)) {
      const cur = map.get(ub.badgeId);
      if (cur) {
        cur.earnCount += 1;
        cur.earnedAt.push(ub.awardedAt);
        if (ub.awardedAt > cur.latestAwardedAt) cur.latestAwardedAt = ub.awardedAt;
      } else {
        map.set(ub.badgeId, { earnCount: 1, latestAwardedAt: ub.awardedAt, earnedAt: [ub.awardedAt] });
      }
    }
    return Array.from(map.entries()).map(([badgeId, v]) => ({ badgeId, ...v }));
  }

  // ── redemptions ─────────────────────────────────────────────────────
  async insertRedemption(input: PointRedemptionInsert): Promise<PointRedemptionRow> {
    const row: PointRedemptionRow = {
      id: uid(),
      userId: input.userId,
      skuId: input.skuId,
      kind: input.kind,
      pointsCost: input.pointsCost,
      valueCents: input.valueCents,
      status: input.status ?? "pending",
      vendorOrderId: null,
      grantPayload: input.grantPayload,
      fulfilledAt: null,
      failureReason: null,
      requiresKyc: input.requiresKyc ?? false,
      kycCompletedAt: null,
      approvedBy: null,
      approvedAt: null,
      metadata: input.metadata ?? null,
      createdAt: this.now(),
      updatedAt: this.now(),
    } as PointRedemptionRow;
    this.redemptions.push(row);
    return row;
  }

  async updateRedemption(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<PointRedemptionRow> {
    const row = this.redemptions.find((r) => r.id === id)!;
    Object.assign(row, patch, { updatedAt: this.now() });
    return row;
  }

  async findRedemptionsForUser(userId: string, limit: number): Promise<PointRedemptionRow[]> {
    return this.redemptions.filter((r) => r.userId === userId).slice(0, limit);
  }

  async findRedemptionsByStatus(status: string, limit: number): Promise<PointRedemptionRow[]> {
    return this.redemptions.filter((r) => r.status === status).slice(0, limit);
  }

  async findRedemptionById(id: string): Promise<PointRedemptionRow | null> {
    return this.redemptions.find((r) => r.id === id) ?? null;
  }

  // ── tax status ──────────────────────────────────────────────────────
  async findTaxStatus(userId: string): Promise<UserTaxStatusRow | null> {
    return this.taxStatus.get(userId) ?? null;
  }

  async bumpYtdRedemption(
    userId: string,
    addCents: number,
    currentYear: number,
  ): Promise<UserTaxStatusRow> {
    const existing = this.taxStatus.get(userId);
    const sameYear = existing && existing.ytdRedemptionYear === currentYear;
    const row: UserTaxStatusRow = {
      userId,
      w9CollectedAt: existing?.w9CollectedAt ?? null,
      taxClassification: existing?.taxClassification ?? null,
      taxIdLast4: existing?.taxIdLast4 ?? null,
      legalName: existing?.legalName ?? null,
      address: existing?.address ?? null,
      ytdRedemptionCents: (sameYear ? existing!.ytdRedemptionCents : 0) + addCents,
      ytdRedemptionYear: currentYear,
      updatedAt: this.now(),
    } as UserTaxStatusRow;
    this.taxStatus.set(userId, row);
    return row;
  }

  /** Test helper: seed a tax-status row. */
  setTaxStatus(userId: string, row: Partial<UserTaxStatusRow>) {
    this.taxStatus.set(userId, {
      userId,
      w9CollectedAt: null,
      taxClassification: null,
      taxIdLast4: null,
      legalName: null,
      address: null,
      ytdRedemptionCents: 0,
      ytdRedemptionYear: this.now().getUTCFullYear(),
      updatedAt: this.now(),
      ...row,
    } as UserTaxStatusRow);
  }

  async markW9Collected(
    userId: string,
    args: { legalName: string; taxIdLast4: string; taxClassification: "personal" | "business" },
  ): Promise<UserTaxStatusRow> {
    const existing = this.taxStatus.get(userId);
    const row: UserTaxStatusRow = {
      userId,
      w9CollectedAt: this.now(),
      taxClassification: args.taxClassification,
      taxIdLast4: args.taxIdLast4,
      legalName: args.legalName,
      address: existing?.address ?? null,
      ytdRedemptionCents: existing?.ytdRedemptionCents ?? 0,
      ytdRedemptionYear: existing?.ytdRedemptionYear ?? this.now().getUTCFullYear(),
      updatedAt: this.now(),
    } as UserTaxStatusRow;
    this.taxStatus.set(userId, row);
    return row;
  }

  // ── campaign dollars ────────────────────────────────────────────────
  async grantCampaignDollars(args: {
    userId: string;
    amountCents: number;
    redemptionId: string;
    description: string;
  }): Promise<void> {
    if (this.campaignGrants.some((g) => g.redemptionId === args.redemptionId)) return;
    this.campaignGrants.push({
      userId: args.userId,
      amountCents: args.amountCents,
      redemptionId: args.redemptionId,
    });
  }

  async findCampaignDollarsBalance(): Promise<unknown> {
    return null;
  }
  async listCampaignDollarsTransactions(): Promise<unknown[]> {
    return [];
  }
  async spendCampaignDollars(): Promise<{ spentCents: number; balanceAfterCents: number }> {
    return { spentCents: 0, balanceAfterCents: 0 };
  }

  // ── stats ───────────────────────────────────────────────────────────
  async globalStats() {
    return {
      totalUsers: this.balances.size,
      suspendedUsers: [...this.balances.values()].filter((b) => b.isSuspended).length,
      totalEarned: 0,
      totalRedeemed: 0,
      totalBalance: 0,
      openFraudFlags: this.fraudFlags.filter((f) => f.status === "open").length,
    };
  }

  async topEarners(): Promise<Array<{ userId: string; lifetimeEarned: number; balance: number }>> {
    return [];
  }

  async findStreaksAtRisk(
    lastActiveYmd: string,
    minStreak: number,
    limit: number,
  ): Promise<Array<{ userId: string; currentStreak: number }>> {
    return [...this.streaks.values()]
      .filter(
        (s) => s.lastActivityDate === lastActiveYmd && s.currentStreak >= minStreak,
      )
      .slice(0, limit)
      .map((s) => ({ userId: s.userId, currentStreak: s.currentStreak }));
  }

  async topByLifetimeEarned(
    limit: number,
    userIds?: string[],
  ): Promise<Array<{ userId: string; lifetimeEarned: number }>> {
    if (userIds && userIds.length === 0) return [];
    const set = userIds ? new Set(userIds) : null;
    return [...this.balances.values()]
      .filter((b) => !b.isSuspended && (!set || set.has(b.userId)))
      .sort((a, b) => b.lifetimeEarned - a.lifetimeEarned)
      .slice(0, limit)
      .map((b) => ({ userId: b.userId, lifetimeEarned: b.lifetimeEarned }));
  }

  async countAheadByLifetimeEarned(threshold: number, userIds?: string[]): Promise<number> {
    if (userIds && userIds.length === 0) return 0;
    const set = userIds ? new Set(userIds) : null;
    return [...this.balances.values()].filter(
      (b) => !b.isSuspended && b.lifetimeEarned > threshold && (!set || set.has(b.userId)),
    ).length;
  }
}
