/**
 * PerformanceService — rules for the user-facing /api/performance surface
 * (cycles, goals/OKRs, reviews). Goals and reviews persist in the canonical
 * People Ops engine via PerformanceRepository; the caller reaches them through
 * their roster rows. Throws DomainError; the route renders the envelope.
 */

import { DomainError } from "../../domains/errors.js";
import { rollupGoalProgress } from "../../domains/people-ops/peopleOpsService.js";
import { GOAL_STATUSES, type GoalStatus, type KeyResult, type ReviewGoal } from "../../../../shared/people-ops.js";
import type {
  PerformanceRepository,
  CycleRow,
  GoalPatch,
  PerformanceGoalDto,
  PerformanceReviewDto,
  RosterRef,
} from "../../repositories/performanceRepository.js";

export interface CreateCycleInput {
  name: string;
  type: string;
  startDate: string;
  endDate: string;
}

export interface CreateGoalInput {
  title: string;
  description?: string;
  category: string;
  targetDate?: string;
  cycleId?: string;
}

export interface CreateReviewInput {
  cycleId: string;
  revieweeUserId: string;
  overallRating?: number;
  strengths?: string;
  areasForImprovement?: string;
  goals?: ReviewGoal[];
  ratings?: Record<string, number>;
  reviewerNotes?: string;
}

/** Legacy OKR key result posted to PATCH /goals/:id/progress. */
export interface LegacyKeyResult {
  title: string;
  current: number;
  target: number;
  unit?: string;
}

/** performance_cycles.type -> people_performance_reviews.review_type (0634 uses the same map). */
const CYCLE_TO_REVIEW_TYPE: Record<string, string> = {
  quarterly: "quarterly",
  annual: "annual",
  "mid-year": "mid_year",
  probationary: "probation",
};

const clampPct = (n: number): number => Math.min(100, Math.max(0, n));

function isGoalStatus(value: unknown): value is GoalStatus {
  return typeof value === "string" && (GOAL_STATUSES as readonly string[]).includes(value);
}

function toKeyResult(kr: LegacyKeyResult): KeyResult {
  const progress = kr.target > 0 ? clampPct((kr.current / kr.target) * 100) : 0;
  return {
    id: crypto.randomUUID(),
    description: kr.title,
    progress: Math.round(progress),
    currentValue: kr.current,
    targetValue: kr.target,
    unit: kr.unit,
  };
}

export class PerformanceService {
  constructor(private readonly repo: PerformanceRepository) {}

  // ── Cycles ─────────────────────────────────────────────────────────────────
  listCycles(userId: string): Promise<CycleRow[]> {
    return this.repo.listCycles(userId);
  }

  createCycle(userId: string, input: CreateCycleInput): Promise<CycleRow> {
    return this.repo.insertCycle({
      createdByUserId: userId,
      name: input.name,
      type: input.type,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
    });
  }

  async getCycle(userId: string, id: string): Promise<CycleRow & { reviews: PerformanceReviewDto[] }> {
    const cycle = await this.repo.findOwnedCycle(id, userId);
    if (!cycle) throw new DomainError(404, "NOT_FOUND", "Cycle not found");
    const reviews = await this.repo.listReviewsForCycle(cycle.id);
    return { ...cycle, reviews };
  }

  async completeCycle(userId: string, id: string): Promise<CycleRow> {
    const cycle = await this.repo.findOwnedCycle(id, userId);
    if (!cycle) throw new DomainError(404, "NOT_FOUND", "Cycle not found");
    return this.repo.completeCycle(cycle.id);
  }

  // ── Goals ──────────────────────────────────────────────────────────────────
  private async employeeIds(userId: string): Promise<string[]> {
    return (await this.repo.rosterFor(userId)).map((r) => r.id);
  }

  private async ownGoal(userId: string, id: string): Promise<PerformanceGoalDto> {
    const goal = await this.repo.findGoal(id, await this.employeeIds(userId));
    if (!goal) throw new DomainError(404, "NOT_FOUND", "Goal not found");
    return goal;
  }

  async listGoals(userId: string): Promise<PerformanceGoalDto[]> {
    return this.repo.listGoals(await this.employeeIds(userId));
  }

  async createGoal(userId: string, input: CreateGoalInput): Promise<PerformanceGoalDto> {
    const [owner] = await this.repo.rosterFor(userId);
    if (!owner) throw new DomainError(409, "NO_ROSTER_RECORD", "Goals require a People Ops roster record");
    return this.repo.insertGoal(owner, userId, {
      cycleId: input.cycleId ?? null,
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      dueDate: input.targetDate ? new Date(input.targetDate) : null,
    });
  }

  async updateGoal(userId: string, id: string, body: Record<string, unknown>): Promise<PerformanceGoalDto> {
    const goal = await this.ownGoal(userId, id);
    const patch: GoalPatch = {};
    if (typeof body.progressPercentage === "number") patch.progress = Math.round(clampPct(body.progressPercentage));
    if (body.status !== undefined) {
      if (!isGoalStatus(body.status)) throw new DomainError(400, "VALIDATION_ERROR", "Invalid goal status");
      patch.status = body.status;
      if (body.status === "completed") patch.completedAt = new Date();
    }
    return this.repo.updateGoal(goal.id, goal.userId, patch);
  }

  async deleteGoal(userId: string, id: string): Promise<void> {
    const goal = await this.ownGoal(userId, id);
    await this.repo.deleteGoal(goal.id);
  }

  /** OKR progress update: explicit percentage wins; otherwise rolls up from the posted key results. */
  async updateGoalProgress(
    userId: string,
    id: string,
    progressPercentage: number | undefined,
    keyResults: LegacyKeyResult[] | undefined,
  ): Promise<PerformanceGoalDto> {
    const goal = await this.ownGoal(userId, id);
    const patch: GoalPatch = {};
    const krs = keyResults && keyResults.length > 0 ? keyResults.map(toKeyResult) : undefined;
    if (krs) patch.keyResults = krs;

    const progress = typeof progressPercentage === "number"
      ? Math.round(clampPct(progressPercentage))
      : krs ? rollupGoalProgress(krs, goal.progressPercentage) : goal.progressPercentage;
    patch.progress = progress;

    if (progress >= 100 && goal.status !== "completed") {
      patch.status = "completed";
      patch.completedAt = new Date();
    }
    return this.repo.updateGoal(goal.id, goal.userId, patch);
  }

  // ── Reviews ────────────────────────────────────────────────────────────────
  /** A roster pair (reviewer, reviewee) sharing one segment, or null. */
  private async sharedSegment(reviewerUserId: string, revieweeUserId: string): Promise<{ reviewer: RosterRef; reviewee: RosterRef } | null> {
    const [mine, theirs] = await Promise.all([this.repo.rosterFor(reviewerUserId), this.repo.rosterFor(revieweeUserId)]);
    for (const reviewee of theirs) {
      const reviewer = mine.find((m) => m.tenantId === reviewee.tenantId && m.segmentId === reviewee.segmentId);
      if (reviewer) return { reviewer, reviewee };
    }
    return null;
  }

  async createReview(userId: string, input: CreateReviewInput): Promise<PerformanceReviewDto> {
    const cycle = await this.repo.findCycle(input.cycleId);
    if (!cycle) throw new DomainError(404, "NOT_FOUND", "Cycle not found");
    const pair = await this.sharedSegment(userId, input.revieweeUserId);
    if (!pair) throw new DomainError(404, "NOT_FOUND", "Reviewee is not on a roster you share");

    return this.repo.insertReview(pair.reviewee, {
      employeeId: pair.reviewee.id,
      reviewerId: pair.reviewer.id,
      cycleId: cycle.id,
      reviewType: CYCLE_TO_REVIEW_TYPE[cycle.type] ?? "quarterly",
      scheduledDate: cycle.startDate,
      periodLabel: cycle.name.slice(0, 60),
      rating: input.overallRating ?? null,
      strengths: input.strengths ?? null,
      areasForImprovement: input.areasForImprovement ?? null,
      goals: input.goals ?? [],
      ratings: input.ratings ?? {},
      comments: input.reviewerNotes ?? null,
    });
  }

  async listReviews(userId: string): Promise<{ asReviewer: PerformanceReviewDto[]; asReviewee: PerformanceReviewDto[] }> {
    const ids = await this.employeeIds(userId);
    const [asReviewer, asReviewee] = await Promise.all([
      this.repo.listReviewsAsReviewer(ids),
      this.repo.listReviewsAsReviewee(ids),
    ]);
    return { asReviewer, asReviewee };
  }

  async submitReview(userId: string, id: string): Promise<PerformanceReviewDto> {
    const [review, ids] = await Promise.all([this.repo.findReview(id), this.employeeIds(userId)]);
    if (!review || !review.reviewerId || !ids.includes(review.reviewerId)) {
      throw new DomainError(404, "NOT_FOUND", "Review not found");
    }
    const now = new Date();
    return this.repo.updateReview(id, { status: "completed", completedDate: now, submittedAt: now });
  }

  async acknowledgeReview(userId: string, id: string, response: unknown): Promise<PerformanceReviewDto> {
    const [review, ids] = await Promise.all([this.repo.findReview(id), this.employeeIds(userId)]);
    if (!review) throw new DomainError(404, "NOT_FOUND", "Review not found");
    if (!ids.includes(review.employeeId)) {
      throw new DomainError(403, "FORBIDDEN", "Only the reviewee can acknowledge their review");
    }
    if (review.dto.status !== "submitted") {
      throw new DomainError(409, "CONFLICT", "Review must be submitted before it can be acknowledged");
    }
    return this.repo.updateReview(id, {
      acknowledgedAt: new Date(),
      revieweeResponse: typeof response === "string" ? response.slice(0, 5000) : undefined,
    });
  }
}
