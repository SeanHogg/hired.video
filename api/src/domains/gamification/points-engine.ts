/**
 * Points engine. The single chokepoint every "user did action X" event
 * funnels through. Responsibilities:
 *
 *   1. Resolve the rule for the action key.
 *   2. Filter by user role (no-op when the rule's role list doesn't
 *      include the caller's role).
 *   3. Check suspension; no-op if suspended.
 *   4. Apply the 100-task gate for `requiresUserTaskGate` rules.
 *   5. Apply daily cap (sum of earned points for this action today).
 *   6. Idempotently write a ledger row (dedup on (user, action, refId)).
 *   7. Apply the balance delta.
 *   8. Drive the streak engine for STREAK_SIGNAL_ACTIONS.
 *   9. Hand off to the fraud engine after writes for user-generated
 *      task completions.
 *
 * Refunds, redemptions, and manual adjustments use the lower-level
 * write methods (writeAdjustment, applyRedemption, reverseAward) and
 * skip role/gate/cap checks.
 */

import type { IPointsRepository, PointsLedgerRow } from "../../repositories/pointsRepository.js";
import type { UserRole } from "../../../../shared/user-roles.js";
import {
  ACTIONS,
  getRule,
  POINTS_CATALOG,
  STREAK_SIGNAL_ACTIONS,
  USER_TASK_GATE_THRESHOLD,
  type ActionKey,
  type PointsRule,
} from "./rules.js";
import { rollStreak, localDay } from "./streak-engine.js";
import { evaluate as evaluateFraud } from "./fraud-engine.js";
import { evaluateBadges } from "./badge-engine.js";

export interface AwardContext {
  userId: string;
  role: UserRole;
  /** Unique reference for dedup. For tasks, the task id; for purchases,
   *  the purchase row id; for AI tool runs, the tool_run id. Required
   *  for any action that could fire twice for the same underlying
   *  event. Use a synthetic key (e.g. `daily:2026-05-23`) for actions
   *  that should fire at most once per day. */
  refId?: string | null;
  refType?: string | null;
  /** Free-form metadata attached to the ledger row. */
  metadata?: Record<string, unknown> | null;
}

export type AwardOutcome =
  | { status: "awarded"; delta: number; balance: number; ledgerId: string }
  | { status: "no-op"; reason: AwardSkipReason };

export type AwardSkipReason =
  | "unknown_action"
  | "role_mismatch"
  | "suspended"
  | "user_task_gate_not_met"
  | "daily_cap_hit"
  | "duplicate";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PointsEngineOpts {
  now?: () => Date;
  /** Hook called when the streak engine awards a milestone bonus
   *  that has a badge slug. The badge engine listens on this to award
   *  the user_badges row + the badge_bonus ledger entry. */
  onBadgeUnlock?: (userId: string, badgeSlug: string) => Promise<void>;
  /** Resolve the user's IANA timezone for the streak engine's day
   *  boundary. Injected (rather than fetched inline) so the engine
   *  stays free of any direct cross-aggregate DB access. Returns null
   *  when the timezone can't be determined — the streak engine falls
   *  back to UTC. */
  getUserTimezone?: (userId: string) => Promise<string | null>;
}

export class PointsEngine {
  constructor(
    private readonly repo: IPointsRepository,
    private readonly opts: PointsEngineOpts = {},
  ) {}

  private now(): Date {
    return this.opts.now ? this.opts.now() : new Date();
  }

  // ── public API ──────────────────────────────────────────────────────

  /**
   * Award points for an action. Always safe to call — every filter
   * short-circuits with a typed `no-op` outcome. Callers should NOT
   * branch on the outcome; just call and move on.
   */
  async awardForAction(action: ActionKey | string, ctx: AwardContext): Promise<AwardOutcome> {
    const rule = getRule(action);
    if (!rule) return { status: "no-op", reason: "unknown_action" };

    if (rule.roles.length > 0 && !rule.roles.includes(ctx.role)) {
      return { status: "no-op", reason: "role_mismatch" };
    }

    const balance = await this.repo.findBalance(ctx.userId);
    if (balance?.isSuspended) {
      return { status: "no-op", reason: "suspended" };
    }

    // 100-task gate. The caller for user-generated task completions
    // already increments the counter BEFORE calling award (so the
    // 100th completion itself doesn't earn — only completions 101+).
    if (rule.requiresUserTaskGate) {
      const counters = await this.repo.findCounters(ctx.userId);
      const userTaskCount = counters?.userTaskCompletions ?? 0;
      if (userTaskCount < USER_TASK_GATE_THRESHOLD) {
        // Still record a zero-points ledger row so the activity feed
        // shows "this would have earned X if the gate were open".
        await this.recordZeroEarning(rule, ctx, {
          ...(ctx.metadata ?? {}),
          gateBlocked: true,
          gateThreshold: USER_TASK_GATE_THRESHOLD,
          gateCount: userTaskCount,
        });
        // Drive the streak even when the gate blocks the payout.
        await this.maybeAdvanceStreak(action, ctx);
        return { status: "no-op", reason: "user_task_gate_not_met" };
      }
    }

    // Daily cap.
    let pointsToAward = rule.points;
    if (rule.dailyCapPoints != null) {
      const earnedToday = await this.repo.sumEarnedSince(ctx.userId, DAY_MS, rule.key);
      const remaining = Math.max(rule.dailyCapPoints - earnedToday, 0);
      if (remaining <= 0) {
        await this.recordZeroEarning(rule, ctx, {
          ...(ctx.metadata ?? {}),
          dailyCapHit: true,
          dailyCapPoints: rule.dailyCapPoints,
        });
        await this.maybeAdvanceStreak(action, ctx);
        return { status: "no-op", reason: "daily_cap_hit" };
      }
      pointsToAward = Math.min(rule.points, remaining);
    }

    // Idempotent write — dedup on (user, action, refId, category).
    const inserted = await this.repo.insertLedgerIdempotent({
      userId: ctx.userId,
      delta: pointsToAward,
      category: "earn",
      action: rule.key,
      source: rule.source ?? rule.key.split(".")[0],
      refId: ctx.refId ?? null,
      refType: ctx.refType ?? null,
      metadata: ctx.metadata ?? null,
    });

    if (!inserted) {
      // Same (user, action, refId, category) already present → already
      // earned. Still drive the streak; the duplicate signal is fine.
      await this.maybeAdvanceStreak(action, ctx);
      return { status: "no-op", reason: "duplicate" };
    }

    const updatedBalance = await this.repo.applyBalanceDelta(ctx.userId, pointsToAward, "earn");

    await this.maybeAdvanceStreak(action, ctx);
    await this.maybeUnlockBadges(rule.key, ctx.userId);

    // Run fraud heuristics for user-task completions only (v1 scope).
    if (rule.key === ACTIONS.TASK_COMPLETE_USER) {
      await this.runFraudCheck(ctx.userId);
    }

    return {
      status: "awarded",
      delta: pointsToAward,
      balance: updatedBalance.balance,
      ledgerId: inserted.id,
    };
  }

  /**
   * Increment a counter (typically called before `awardForAction` for
   * user-task completions so the 100-task gate measures completions
   * inclusive of the current one).
   */
  async incrementTaskCounter(
    userId: string,
    kind: "user_task" | "system_task",
    delta = 1,
  ): Promise<{ userTaskCompletions: number; systemTaskCompletions: number }> {
    const row = await this.repo.incrementCounter(userId, kind, delta);
    return {
      userTaskCompletions: row.userTaskCompletions,
      systemTaskCompletions: row.systemTaskCompletions,
    };
  }

  /**
   * Manual ledger write for adjust/reverse/redemption. Bypasses role
   * and cap checks; the caller (superadmin route, redemption engine,
   * fraud engine) is trusted.
   */
  async writeManualLedger(input: {
    userId: string;
    delta: number;
    category: "adjust" | "redeem" | "reverse" | "streak_bonus" | "badge_bonus";
    action: string;
    source: string;
    refId?: string | null;
    refType?: string | null;
    reversesId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<PointsLedgerRow> {
    const row = await this.repo.insertLedger({
      userId: input.userId,
      delta: input.delta,
      category: input.category,
      action: input.action,
      source: input.source,
      refId: input.refId ?? null,
      refType: input.refType ?? null,
      reversesId: input.reversesId ?? null,
      metadata: input.metadata ?? null,
    });
    await this.repo.applyBalanceDelta(input.userId, input.delta, input.category);
    return row;
  }

  // ── internals ───────────────────────────────────────────────────────

  /** Write a `delta=0` earn-row so the activity feed shows the blocked
   *  attempt without affecting the balance. Dedup-uniq still applies,
   *  so repeated blocked attempts on the same refId collapse to one
   *  audit row. */
  private async recordZeroEarning(
    rule: PointsRule,
    ctx: AwardContext,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.repo.insertLedgerIdempotent({
      userId: ctx.userId,
      delta: 0,
      category: "earn",
      action: rule.key,
      source: rule.source ?? rule.key.split(".")[0],
      refId: ctx.refId ?? null,
      refType: ctx.refType ?? null,
      metadata,
    });
  }

  private async maybeAdvanceStreak(action: string, ctx: AwardContext): Promise<void> {
    if (!STREAK_SIGNAL_ACTIONS.has(action as ActionKey)) return;

    const [current, timezone] = await Promise.all([
      this.repo.findStreak(ctx.userId),
      this.opts.getUserTimezone ? this.opts.getUserTimezone(ctx.userId) : Promise.resolve(null),
    ]);
    const out = rollStreak({
      current: current
        ? {
            currentStreak: current.currentStreak,
            longestStreak: current.longestStreak,
            lastActivityDate: current.lastActivityDate ?? null,
            lastBonusMilestone: current.lastBonusMilestone,
          }
        : null,
      activityDate: localDay(timezone, this.now()),
    });

    await this.repo.upsertStreak(ctx.userId, {
      currentStreak: out.next.currentStreak,
      longestStreak: out.next.longestStreak,
      lastActivityDate: out.next.lastActivityDate,
      lastBonusAt: out.next.lastBonusAt ?? null,
      lastBonusMilestone: out.next.lastBonusMilestone,
    });

    if (out.milestoneAwarded) {
      const milestone = out.milestoneAwarded;
      await this.writeManualLedger({
        userId: ctx.userId,
        delta: milestone.bonus,
        category: "streak_bonus",
        action: ACTIONS.STREAK_BONUS,
        source: "streak",
        // Synthetic refId guarantees one bonus per milestone per streak
        // even if maybeAdvanceStreak fires concurrently.
        refId: `streak:${milestone.day}:${out.next.lastActivityDate}`,
        refType: "streak_milestone",
        metadata: { milestoneDay: milestone.day, currentStreak: out.next.currentStreak },
      });

      if (milestone.badgeSlug && this.opts.onBadgeUnlock) {
        await this.opts.onBadgeUnlock(ctx.userId, milestone.badgeSlug);
      }
    }
  }

  private async maybeUnlockBadges(action: string, userId: string): Promise<void> {
    if (!this.opts.onBadgeUnlock) return;
    const [counters, totalEarns, earned] = await Promise.all([
      this.repo.findCounters(userId),
      this.repo.countEarnsByAction(userId, action),
      this.repo.listUserBadges(userId),
    ]);

    // Resolve slugs the user already holds — listUserBadges returns
    // user_badge rows keyed by badgeId, so we need the slug → id
    // mapping from the catalog. Cheaper to do this here than to extend
    // the repo with a join.
    const allBadges = await this.repo.listBadges();
    const idToSlug = new Map(allBadges.map((b) => [b.id, b.slug]));
    const earnedSlugs = new Set<string>();
    for (const ub of earned) {
      const slug = idToSlug.get(ub.badgeId);
      if (slug) earnedSlugs.add(slug);
    }

    const toUnlock = evaluateBadges({
      action,
      counters,
      totalEarnsForAction: totalEarns,
      alreadyEarnedSlugs: earnedSlugs,
    });

    for (const slug of toUnlock) {
      await this.opts.onBadgeUnlock(userId, slug);
    }
  }

  private async runFraudCheck(userId: string): Promise<void> {
    // Pull recent user-task ledger rows and shape them for the engine.
    const recent = await this.repo.findLedgerByAction(
      userId,
      ACTIONS.TASK_COMPLETE_USER,
      60 * 60 * 1000, // 1h
      500,
    );

    // Bucket by minute for the per-minute peak heuristic.
    const buckets = new Map<number, number>();
    for (const row of recent) {
      const minuteBucket = Math.floor(row.createdAt.getTime() / 60_000);
      buckets.set(minuteBucket, (buckets.get(minuteBucket) ?? 0) + 1);
    }
    const recentBuckets = Array.from(buckets.values());

    const flags = evaluateFraud({
      userId,
      recentUserTaskClosesPerMinute: recentBuckets,
      recentUserTaskClosesLastHour: recent.length,
      earningDayBuckets24h: 1, // placeholder for v1 — broadened in phase 4
      recentLedgerSample: recent.slice(0, 20).map((r) => ({
        action: r.action,
        delta: r.delta,
        at: r.createdAt,
      })),
    });

    if (flags.length === 0) return;

    for (const f of flags) {
      await this.repo.insertFraudFlag({
        userId,
        kind: f.kind,
        severity: f.severity,
        evidence: f.evidence,
        autoSuspended: f.autoSuspend,
      });
      if (f.autoSuspend) {
        await this.repo.setSuspension(userId, true, `auto: ${f.kind}`, null);
      }
    }
  }
}

// Make catalog reachable for analytics + admin UIs without importing
// `rules.ts` everywhere downstream.
export { POINTS_CATALOG };
