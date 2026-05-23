/**
 * Gamification domain facade. Other services / route handlers import
 * `GamificationService` from here and never reach into the engines or
 * the repo directly.
 *
 * Construction is cheap; one per request is fine (it's a thin
 * orchestrator over the repo + engines).
 */

import type { Repos } from "../../repositories/index.js";
import { USER_ROLES, type UserRole } from "../../../../shared/user-roles.js";
import { PointsEngine, type AwardOutcome } from "./points-engine.js";
import {
  ACTIONS,
  POINTS_CATALOG,
  REDEMPTION_CATALOG,
  getRedemptionSku,
  getRule,
  type ActionKey,
  type RedemptionSku,
} from "./rules.js";

export interface AwardArgs {
  userId: string;
  role: UserRole;
  refId?: string | null;
  refType?: string | null;
  metadata?: Record<string, unknown> | null;
}

export class GamificationService {
  private readonly engine: PointsEngine;

  constructor(private readonly repos: Repos) {
    this.engine = new PointsEngine(repos.points, {
      onBadgeUnlock: async (userId, slug) => {
        const badge = await this.repos.points.findBadgeBySlug(slug);
        if (!badge) return;
        const awarded = await this.repos.points.awardBadge({
          userId,
          badgeId: badge.id,
          awardedFor: { trigger: "streak_milestone", slug },
        });
        if (awarded && badge.pointsReward > 0) {
          await this.engine.writeManualLedger({
            userId,
            delta: badge.pointsReward,
            category: "badge_bonus",
            action: ACTIONS.BADGE_UNLOCKED,
            source: "badge",
            refId: `badge:${badge.id}`,
            refType: "badge",
            metadata: { badgeSlug: slug, badgeName: badge.name },
          });
        }
      },
    });
  }

  // ── high-level award helpers callers use ────────────────────────────

  /** Generic award entry point. Use the named helpers when possible. */
  award(action: ActionKey | string, args: AwardArgs): Promise<AwardOutcome> {
    return this.engine.awardForAction(action, args);
  }

  /** Award when the caller doesn't have a JWT (Stripe webhook, cron
   *  worker, background processor). Resolves the user's role from the
   *  users table and no-ops if the role isn't one the catalog scores. */
  async awardWithRoleLookup(
    action: ActionKey | string,
    args: Omit<AwardArgs, "role"> & { userId: string },
  ): Promise<AwardOutcome> {
    const user = await this.repos.users.findById(args.userId);
    const userRole = (user?.role as string | undefined) ?? null;
    if (
      userRole !== USER_ROLES.JOB_SEEKER &&
      userRole !== USER_ROLES.RECRUITER &&
      userRole !== USER_ROLES.EMPLOYER
    ) {
      return { status: "no-op", reason: "role_mismatch" };
    }
    return this.award(action, { ...args, role: userRole as UserRole });
  }

  /** Award for a closed task. Inspects taskType to decide whether this
   *  is system-generated (TaskType ≥ 10) or user-generated. Also bumps
   *  the corresponding counter; the 100-task gate is applied inside
   *  the engine for user-generated rules. */
  async onTaskClosed(args: AwardArgs & { taskId: string; taskType: number }): Promise<AwardOutcome> {
    const isSystem = args.taskType >= 10;
    // Counter must be incremented BEFORE award so the gate sees the
    // current completion when evaluating "≥ 100".
    await this.engine.incrementTaskCounter(args.userId, isSystem ? "system_task" : "user_task", 1);

    const action = isSystem ? ACTIONS.TASK_COMPLETE_SYSTEM : ACTIONS.TASK_COMPLETE_USER;
    return this.award(action, {
      ...args,
      refId: args.taskId,
      refType: "task",
      metadata: { ...(args.metadata ?? {}), taskType: args.taskType, isSystem },
    });
  }

  async onApplicationSubmitted(args: AwardArgs & { applicationId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.APPLICATION_SUBMITTED, {
      ...args,
      refId: args.applicationId,
      refType: "application",
    });
  }

  async onResumeTailored(args: AwardArgs & { resumeRunId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.RESUME_TAILORED, {
      ...args,
      refId: args.resumeRunId,
      refType: "tool_run",
    });
  }

  async onCoverLetterGenerated(args: AwardArgs & { toolRunId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.COVER_LETTER_GENERATED, {
      ...args,
      refId: args.toolRunId,
      refType: "tool_run",
    });
  }

  async onAiToolUsed(args: AwardArgs & { toolRunId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.AI_TOOL_USED, {
      ...args,
      refId: args.toolRunId,
      refType: "tool_run",
    });
  }

  async onSavedSearchRun(args: AwardArgs & { runId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.SAVED_SEARCH_RUN, {
      ...args,
      refId: args.runId,
      refType: "saved_search_run",
    });
  }

  async onDailySession(args: AwardArgs): Promise<AwardOutcome> {
    // RefId synthesizes "one per UTC day" so a fresh-session call any
    // time of day collapses to a single ledger row.
    const day = new Date().toISOString().slice(0, 10);
    return this.award(ACTIONS.SESSION_DAILY, {
      ...args,
      refId: `daily:${day}`,
      refType: "session",
    });
  }

  async onTokenPackPurchase(args: AwardArgs & { purchaseId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.PURCHASE_TOKEN_PACK, {
      ...args,
      refId: args.purchaseId,
      refType: "token_pack_purchase",
    });
  }

  async onSubscriptionStart(args: AwardArgs & { subscriptionId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.PURCHASE_SUBSCRIPTION, {
      ...args,
      refId: args.subscriptionId,
      refType: "subscription",
    });
  }

  async onAnyPurchase(args: AwardArgs & { invoiceId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.PURCHASE_ANY, {
      ...args,
      refId: args.invoiceId,
      refType: "invoice",
    });
  }

  // ── reads for routes ────────────────────────────────────────────────

  async getUserSummary(userId: string) {
    const [balance, streak, counters, badgesEarned, allBadges, recent] = await Promise.all([
      this.repos.points.findBalance(userId),
      this.repos.points.findStreak(userId),
      this.repos.points.findCounters(userId),
      this.repos.points.listUserBadges(userId),
      this.repos.points.listBadges(),
      this.repos.points.findRecentLedger(userId, 20),
    ]);

    const earnedBadgeIds = new Set(badgesEarned.map((b) => b.badgeId));
    const userTaskCompletions = counters?.userTaskCompletions ?? 0;

    return {
      balance: balance?.balance ?? 0,
      lifetimeEarned: balance?.lifetimeEarned ?? 0,
      lifetimeRedeemed: balance?.lifetimeRedeemed ?? 0,
      isSuspended: balance?.isSuspended ?? false,
      suspendedReason: balance?.suspendedReason ?? null,
      streak: {
        current: streak?.currentStreak ?? 0,
        longest: streak?.longestStreak ?? 0,
        lastActivityDate: streak?.lastActivityDate ?? null,
      },
      userTaskGate: {
        completed: userTaskCompletions,
        threshold: 100,
        unlocked: userTaskCompletions >= 100,
      },
      badges: allBadges.map((b) => ({
        id: b.id,
        slug: b.slug,
        name: b.name,
        description: b.description,
        tier: b.tier,
        iconKey: b.iconKey,
        earned: earnedBadgeIds.has(b.id),
        earnedAt: badgesEarned.find((ub) => ub.badgeId === b.id)?.awardedAt ?? null,
      })),
      recentActivity: recent.map((r) => ({
        id: r.id,
        delta: r.delta,
        category: r.category,
        action: r.action,
        label: getRule(r.action)?.label ?? r.action,
        at: r.createdAt,
        metadata: r.metadata as Record<string, unknown> | null,
      })),
    };
  }

  async getActivityPage(userId: string, limit: number) {
    const rows = await this.repos.points.findRecentLedger(userId, Math.min(limit, 200));
    return rows.map((r) => ({
      id: r.id,
      delta: r.delta,
      category: r.category,
      action: r.action,
      label: getRule(r.action)?.label ?? r.action,
      source: r.source,
      refId: r.refId,
      refType: r.refType,
      at: r.createdAt,
      metadata: r.metadata as Record<string, unknown> | null,
    }));
  }

  // ── superadmin helpers ──────────────────────────────────────────────

  async adminSuspend(userId: string, reason: string, adminUserId: string) {
    return this.repos.points.setSuspension(userId, true, reason, adminUserId);
  }

  async adminReinstate(userId: string, adminUserId: string) {
    return this.repos.points.setSuspension(userId, false, null, adminUserId);
  }

  async adminAdjust(args: {
    userId: string;
    delta: number;
    reason: string;
    adminUserId: string;
  }) {
    return this.engine.writeManualLedger({
      userId: args.userId,
      delta: args.delta,
      category: "adjust",
      action: "admin.adjust",
      source: "admin",
      // Synthetic ref so each adjust call is its own row.
      refId: `admin:${args.adminUserId}:${Date.now()}`,
      refType: "admin_adjust",
      metadata: { reason: args.reason, adminUserId: args.adminUserId },
    });
  }

  async resolveFraudFlag(args: {
    flagId: string;
    decision: "confirmed" | "dismissed";
    reviewerId: string;
    notes: string | null;
    /** When confirming, optionally reinstate the user's points
     *  (typical when a false-positive auto-suspend turns out legit). */
    reinstate?: boolean;
  }) {
    const flag = await this.repos.points.resolveFraudFlag(
      args.flagId,
      args.decision,
      args.reviewerId,
      args.notes,
    );
    if (args.reinstate) {
      await this.adminReinstate(flag.userId, args.reviewerId);
    }
    return flag;
  }

  // ── catalog passthrough for admin UIs ──────────────────────────────

  getCatalog() {
    return {
      actions: Object.values(POINTS_CATALOG).map((r) => ({
        key: r.key,
        label: r.label,
        roles: r.roles,
        points: r.points,
        dailyCapPoints: r.dailyCapPoints,
        requiresUserTaskGate: r.requiresUserTaskGate ?? false,
      })),
      redemptions: REDEMPTION_CATALOG.map((s) => ({
        id: s.id,
        kind: s.kind,
        label: s.label,
        pointsCost: s.pointsCost,
      })),
    };
  }

  getRedemptionSku(id: string): RedemptionSku | null {
    return getRedemptionSku(id);
  }
}

export { ACTIONS } from "./rules.js";
export type { ActionKey } from "./rules.js";
export type { AwardOutcome } from "./points-engine.js";
