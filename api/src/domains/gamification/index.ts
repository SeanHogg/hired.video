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
import { RedemptionEngine, type RedemptionOutcome } from "./redemption-engine.js";
import { buildTremendousClient } from "../../services/tremendous/client.js";
import { NotificationService } from "../../services/notifications/notification-service.js";

export interface AwardArgs {
  userId: string;
  role: UserRole;
  refId?: string | null;
  refType?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface GamificationServiceOpts {
  /** Worker env passed through so the redemption engine can build a
   *  Tremendous client lazily. Optional — gift-card redemption returns
   *  `vendor_unavailable` when missing. */
  workerEnv?: Record<string, string | undefined>;
}

export class GamificationService {
  private readonly engine: PointsEngine;
  private readonly redemption: RedemptionEngine;

  constructor(private readonly repos: Repos, opts: GamificationServiceOpts = {}) {
    this.engine = new PointsEngine(repos.points, {
      getUserTimezone: async (userId) => {
        try {
          return await this.repos.users.findTimezone(userId);
        } catch {
          return null;
        }
      },
      onBadgeUnlock: async (userId, slug) => {
        const badge = await this.repos.points.findBadgeBySlug(slug);
        if (!badge) return;
        const awarded = badge.isRepeatable
          ? await this.repos.points.awardBadgeRepeatable({
              userId,
              badgeId: badge.id,
              awardedFor: { trigger: "badge_engine", slug },
            })
          : await this.repos.points.awardBadgeOnce({
              userId,
              badgeId: badge.id,
              awardedFor: { trigger: "badge_engine", slug },
            });
        if (awarded && badge.pointsReward > 0) {
          // Synthesize a refId that's unique per earn for repeatable
          // badges (so the badge_bonus ledger row dedup-uniq doesn't
          // collapse repeat earns of the same badge); for once-per-user
          // badges the row is naturally one-per-badge.
          const refId = badge.isRepeatable
            ? `badge:${badge.id}:${awarded.id}`
            : `badge:${badge.id}`;
          await this.engine.writeManualLedger({
            userId,
            delta: badge.pointsReward,
            category: "badge_bonus",
            action: ACTIONS.BADGE_UNLOCKED,
            source: "badge",
            refId,
            refType: "badge",
            metadata: { badgeSlug: slug, badgeName: badge.name, repeatable: badge.isRepeatable },
          });
        }
        // #1656 — badge-unlock alert. Routed through NotificationService so
        // it both PERSISTS to the notification center AND fans out the PWA
        // push (best-effort; missing VAPID in dev no-ops). Owner only — no
        // fanout to followers. Awarded badges that pre-existed (once-per-user
        // re-runs) return `awarded === null`; skip there so users don't
        // re-receive the same alert.
        if (awarded) {
          await NotificationService.notify({
            userId,
            type: "badge",
            title: "Badge unlocked",
            message: badge.name,
            url: "/services/creator/dashboard?tab=gamification",
            refType: "badge",
            refId: badge.id,
          }).catch(() => undefined);
        }
      },
    });

    this.redemption = new RedemptionEngine({
      repos,
      buildTremendous: () => {
        if (!opts.workerEnv) return null;
        try {
          return buildTremendousClient(opts.workerEnv);
        } catch {
          return null;
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

  /** Award when a user submits a community resource for review. Deduped on
   *  the resource id so a re-submit of the same row doesn't double-pay. */
  async onResourceSubmitted(args: AwardArgs & { resourceId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.RESOURCE_SUBMITTED, {
      ...args,
      refId: args.resourceId,
      refType: "community_resource",
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

  async onFeedPostCreated(args: AwardArgs & { postId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.FEED_POST_CREATED, {
      ...args,
      refId: args.postId,
      refType: "feed_post",
    });
  }

  // ── Learning loop helpers ──────────────────────────────────────────
  //
  // Synthetic refIds combine course/path/cert + lesson so the points-
  // ledger dedup-uniq collapses repeated "marked complete" calls into
  // a single ledger row per lesson per learner. SCORM lessons that go
  // passed → failed → passed don't accidentally re-earn.

  async onLessonCompleted(
    args: AwardArgs & { courseId: string; lessonId: string; enrollmentId: string },
  ): Promise<AwardOutcome> {
    return this.award(ACTIONS.LESSON_COMPLETED, {
      ...args,
      refId: `lesson:${args.enrollmentId}:${args.lessonId}`,
      refType: "course_lesson",
    });
  }

  async onCoursePassed(
    args: AwardArgs & { courseId: string; enrollmentId: string },
  ): Promise<AwardOutcome> {
    return this.award(ACTIONS.COURSE_PASSED, {
      ...args,
      refId: `course:${args.enrollmentId}`,
      refType: "course_enrollment",
    });
  }

  async onCertificateEarned(
    args: AwardArgs & { certificateId: string },
  ): Promise<AwardOutcome> {
    return this.award(ACTIONS.CERTIFICATE_EARNED, {
      ...args,
      refId: args.certificateId,
      refType: "course_certificate",
    });
  }

  async onLearningPathCompleted(
    args: AwardArgs & { pathId: string; enrollmentId: string },
  ): Promise<AwardOutcome> {
    return this.award(ACTIONS.LEARNING_PATH_COMPLETED, {
      ...args,
      refId: `path:${args.enrollmentId}`,
      refType: "learning_path_enrollment",
    });
  }

  async onCoursePublished(args: AwardArgs & { courseId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.COURSE_PUBLISHED, {
      ...args,
      refId: args.courseId,
      refType: "course",
    });
  }

  // ── New-surface helpers (gap #1966) ────────────────────────────────
  //
  // Each dedups on the natural entity id so a re-fire of the same
  // publish / register / complete event collapses to one ledger row.

  async onEventCreated(args: AwardArgs & { eventId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.EVENT_CREATED, {
      ...args,
      refId: args.eventId,
      refType: "event",
    });
  }

  /** Registration earns once per (user, event); attendance dedups on the
   *  same event id under a distinct action so both can fire. */
  async onEventRegistered(args: AwardArgs & { eventId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.EVENT_REGISTERED, {
      ...args,
      refId: args.eventId,
      refType: "event",
    });
  }

  async onEventAttended(args: AwardArgs & { eventId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.EVENT_ATTENDED, {
      ...args,
      refId: args.eventId,
      refType: "event",
    });
  }

  /** Host earns for completing a session; refId = booking id. */
  async onSessionCompleted(args: AwardArgs & { bookingId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.BOOKING_SESSION_COMPLETED, {
      ...args,
      refId: args.bookingId,
      refType: "booking",
    });
  }

  /** Guest earns for booking a session; refId = booking id under a
   *  distinct action so both sides of one booking can earn. */
  async onSessionBooked(args: AwardArgs & { bookingId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.BOOKING_SESSION_BOOKED, {
      ...args,
      refId: args.bookingId,
      refType: "booking",
    });
  }

  async onArticlePublished(args: AwardArgs & { articleId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.ARTICLE_PUBLISHED, {
      ...args,
      refId: args.articleId,
      refType: "article",
    });
  }

  async onReferenceGiven(args: AwardArgs & { referenceId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.REFERENCE_GIVEN, {
      ...args,
      refId: args.referenceId,
      refType: "reference",
    });
  }

  /** The subject of a reference earns when one lands on their profile.
   *  Caller passes the subject's userId as `userId`. */
  async onReferenceReceived(args: AwardArgs & { referenceId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.REFERENCE_RECEIVED, {
      ...args,
      refId: args.referenceId,
      refType: "reference",
    });
  }

  async onCompanyReviewPosted(args: AwardArgs & { reviewId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.COMPANY_REVIEW_POSTED, {
      ...args,
      refId: args.reviewId,
      refType: "company_review",
    });
  }

  async onCohortCreated(args: AwardArgs & { cohortId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.COHORT_CREATED, {
      ...args,
      refId: args.cohortId,
      refType: "learning_cohort",
    });
  }

  /** A student joining a cohort earns once per (student, cohort). Caller
   *  passes the student's userId. RefId combines cohort + member so a
   *  re-join after leaving doesn't re-pay. */
  async onCohortStudentJoined(
    args: AwardArgs & { cohortId: string; memberId: string },
  ): Promise<AwardOutcome> {
    return this.award(ACTIONS.COHORT_STUDENT_JOINED, {
      ...args,
      refId: `cohort:${args.cohortId}:${args.memberId}`,
      refType: "cohort_member",
    });
  }

  async onCohortAssignmentCompleted(
    args: AwardArgs & { assignmentId: string; memberId: string },
  ): Promise<AwardOutcome> {
    return this.award(ACTIONS.COHORT_ASSIGNMENT_COMPLETED, {
      ...args,
      refId: `assignment:${args.assignmentId}:${args.memberId}`,
      refType: "learning_assignment",
    });
  }

  /** Creative-studio publish. `mediaKind` selects the action so a game,
   *  comic, and podcast each map to their own catalog rule (all share the
   *  `studio_creator_first` badge). RefId = project id. */
  async onStudioCreatePublished(
    args: AwardArgs & { projectId: string; mediaKind: "game" | "comic" | "podcast" },
  ): Promise<AwardOutcome> {
    const action =
      args.mediaKind === "game"
        ? ACTIONS.STUDIO_GAME_PUBLISHED
        : args.mediaKind === "comic"
          ? ACTIONS.STUDIO_COMIC_PUBLISHED
          : ACTIONS.STUDIO_PODCAST_PUBLISHED;
    return this.award(action, {
      ...args,
      refId: args.projectId,
      refType: "studio_project",
    });
  }

  // ── Recruiter helpers ──────────────────────────────────────────────

  onCandidateSourced(args: AwardArgs & { candidateId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.CANDIDATE_SOURCED, {
      ...args,
      refId: args.candidateId,
      refType: "candidate",
    });
  }

  onCandidateSubmitted(args: AwardArgs & { submissionId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.CANDIDATE_SUBMITTED, {
      ...args,
      refId: args.submissionId,
      refType: "candidate_submission",
    });
  }

  onCandidatePlaced(args: AwardArgs & { placementId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.CANDIDATE_PLACED, {
      ...args,
      refId: args.placementId,
      refType: "placement",
    });
  }

  onBidWon(args: AwardArgs & { bidId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.BID_WON, {
      ...args,
      refId: args.bidId,
      refType: "sourcing_bid",
    });
  }

  // ── Employer helpers ───────────────────────────────────────────────

  onJobPosted(args: AwardArgs & { jobId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.JOB_POSTED, {
      ...args,
      refId: args.jobId,
      refType: "job",
    });
  }

  onCandidateViewed(args: AwardArgs & { candidateId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.CANDIDATE_VIEWED, {
      ...args,
      refId: args.candidateId,
      refType: "candidate",
    });
  }

  onScorecardCompleted(args: AwardArgs & { scorecardId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.SCORECARD_COMPLETED, {
      ...args,
      refId: args.scorecardId,
      refType: "scorecard",
    });
  }

  onOfferExtended(args: AwardArgs & { offerId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.OFFER_EXTENDED, {
      ...args,
      refId: args.offerId,
      refType: "offer",
    });
  }

  onHireConfirmed(args: AwardArgs & { hireId: string }): Promise<AwardOutcome> {
    return this.award(ACTIONS.HIRE_CONFIRMED, {
      ...args,
      refId: args.hireId,
      refType: "hire",
    });
  }

  // ── reads for routes ────────────────────────────────────────────────

  async getUserSummary(userId: string) {
    const [balance, streak, counters, earns, allBadges, recent] = await Promise.all([
      this.repos.points.findBalance(userId),
      this.repos.points.findStreak(userId),
      this.repos.points.findCounters(userId),
      this.repos.points.listUserBadgeEarns(userId),
      this.repos.points.listBadges(),
      this.repos.points.findRecentLedger(userId, 20),
    ]);

    const earnsById = new Map(earns.map((e) => [e.badgeId, e]));
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
      badges: allBadges.map((b) => {
        const earn = earnsById.get(b.id);
        return {
          id: b.id,
          slug: b.slug,
          name: b.name,
          description: b.description,
          tier: b.tier,
          iconKey: b.iconKey,
          isRepeatable: b.isRepeatable,
          earned: !!earn,
          /** Backwards-compat: callers reading `earnedAt` see the latest
           *  earn. New callers should use `earnCount` + `earnedHistory`. */
          earnedAt: earn?.latestAwardedAt ?? null,
          earnCount: earn?.earnCount ?? 0,
          earnedHistory: earn?.earnedAt ?? [],
        };
      }),
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

  // ── Redemption ─────────────────────────────────────────────────────

  redeem(args: {
    userId: string;
    skuId: string;
    recipientName?: string;
    recipientEmail?: string;
  }): Promise<RedemptionOutcome> {
    return this.redemption.redeem({
      skuId: args.skuId,
      user: {
        userId: args.userId,
        recipientName: args.recipientName,
        recipientEmail: args.recipientEmail,
      },
    });
  }

  /** SuperAdmin path: approve a redemption parked at `pending` due to
   *  KYC. Routes through the redemption engine so the Tremendous builder
   *  closure is reused. */
  approveRedemption(args: {
    redemptionId: string;
    approverId: string;
    recipientName?: string;
    recipientEmail?: string;
  }) {
    return this.redemption.approve(args);
  }

  /** SuperAdmin path: cancel + refund. */
  cancelRedemption(args: { redemptionId: string; reason: string; actorId: string }) {
    return this.redemption.cancel(args);
  }

  /** SuperAdmin path: mark a user's W-9 as collected so future
   *  redemptions clear the threshold gate automatically. */
  markW9Collected(args: {
    userId: string;
    legalName: string;
    taxIdLast4: string;
    taxClassification: "personal" | "business";
  }) {
    return this.repos.points.markW9Collected(args.userId, {
      legalName: args.legalName,
      taxIdLast4: args.taxIdLast4,
      taxClassification: args.taxClassification,
    });
  }
}

export { ACTIONS } from "./rules.js";
export type { ActionKey } from "./rules.js";
export type { AwardOutcome } from "./points-engine.js";
