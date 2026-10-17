/**
 * PerformanceRepository — persistence for the user-facing /api/performance
 * surface. Cycles live in performance_cycles; goals and reviews live in the
 * ONE canonical People Ops engine (people_goals / people_performance_reviews,
 * merged in migration 0634). This repository maps those canonical rows back
 * onto the legacy user-keyed DTO shape so the API responses stay identical.
 *
 * A user reaches goals/reviews through their roster rows (people_employees
 * with user_id = the caller); every goal/review query is bounded to those
 * employee ids, so a caller can never read another segment's rows.
 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "../db/index.js";
import type { KeyResult, ReviewGoal } from "../../../shared/people-ops.js";

const { performanceCycles, peopleGoals, peoplePerformanceReviews, peopleEmployees } = schema;

type DbHandle = ReturnType<typeof getDb>;
export type CycleRow = typeof performanceCycles.$inferSelect;
type GoalRow = typeof peopleGoals.$inferSelect;
type ReviewRow = typeof peoplePerformanceReviews.$inferSelect;

/** A caller's roster row — the (tenant, segment, employee) a write lands in. */
export interface RosterRef {
  id: string;
  tenantId: string;
  segmentId: string;
}

/** Legacy /api/performance goal shape (pre-0634 performance_goals row). */
export interface PerformanceGoalDto {
  id: string;
  userId: string | null;
  cycleId: string | null;
  title: string;
  description: string | null;
  category: string | null;
  targetDate: Date | null;
  progressPercentage: number;
  status: string;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Legacy /api/performance review shape (pre-0634 performance_reviews row). */
export interface PerformanceReviewDto {
  id: string;
  cycleId: string | null;
  revieweeUserId: string | null;
  reviewerUserId: string | null;
  status: string;
  overallRating: string | null;
  strengths: string | null;
  areasForImprovement: string | null;
  goals: ReviewGoal[];
  ratings: Record<string, number>;
  reviewerNotes: string | null;
  revieweeResponse: string | null;
  submittedAt: Date | null;
  acknowledgedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewCycleInput {
  createdByUserId: string;
  name: string;
  type: string;
  startDate: Date;
  endDate: Date;
}

export interface NewGoalRecord {
  cycleId: string | null;
  title: string;
  description: string | null;
  category: string;
  dueDate: Date | null;
}

export interface GoalPatch {
  progress?: number;
  status?: string;
  completedAt?: Date;
  keyResults?: KeyResult[];
}

export interface NewReviewRecord {
  employeeId: string;
  reviewerId: string;
  cycleId: string;
  reviewType: string;
  scheduledDate: Date | null;
  periodLabel: string | null;
  rating: number | null;
  strengths: string | null;
  areasForImprovement: string | null;
  goals: ReviewGoal[];
  ratings: Record<string, number>;
  comments: string | null;
}

export interface ReviewPatch {
  status?: string;
  completedDate?: Date;
  submittedAt?: Date;
  acknowledgedAt?: Date;
  revieweeResponse?: string;
}

/** Canonical review status -> the legacy pending|in_progress|submitted|acknowledged vocab. */
export function toLegacyReviewStatus(row: Pick<ReviewRow, "status" | "acknowledgedAt">): string {
  if (row.status === "completed") return row.acknowledgedAt ? "acknowledged" : "submitted";
  if (row.status === "scheduled" || row.status === "draft") return "pending";
  return row.status;
}

function toGoalDto(g: GoalRow, userId: string | null): PerformanceGoalDto {
  return {
    id: g.id,
    userId,
    cycleId: g.cycleId,
    title: g.title,
    description: g.description,
    category: g.category,
    targetDate: g.dueDate,
    progressPercentage: g.progress,
    status: g.status,
    completedAt: g.completedAt,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

function toReviewDto(r: ReviewRow, revieweeUserId: string | null, reviewerUserId: string | null): PerformanceReviewDto {
  return {
    id: r.id,
    cycleId: r.cycleId,
    revieweeUserId,
    reviewerUserId,
    status: toLegacyReviewStatus(r),
    overallRating: r.rating == null ? null : String(r.rating),
    strengths: r.strengths,
    areasForImprovement: r.areasForImprovement,
    goals: r.goals,
    ratings: r.ratings,
    reviewerNotes: r.comments,
    revieweeResponse: r.revieweeResponse,
    submittedAt: r.submittedAt,
    acknowledgedAt: r.acknowledgedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const goalOwner = alias(peopleEmployees, "goal_owner");
const reviewee = alias(peopleEmployees, "reviewee");
const reviewer = alias(peopleEmployees, "reviewer");

export class PerformanceRepository {
  constructor(
    private readonly db: DbHandle,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ── Cycles ─────────────────────────────────────────────────────────────────
  async listCycles(userId: string): Promise<CycleRow[]> {
    return this.db
      .select()
      .from(performanceCycles)
      .where(eq(performanceCycles.createdByUserId, userId))
      .orderBy(desc(performanceCycles.createdAt));
  }

  async insertCycle(input: NewCycleInput): Promise<CycleRow> {
    const [row] = await this.db
      .insert(performanceCycles)
      .values({ ...input, status: "active" })
      .returning();
    return row;
  }

  async findCycle(id: string): Promise<CycleRow | null> {
    const [row] = await this.db.select().from(performanceCycles).where(eq(performanceCycles.id, id)).limit(1);
    return row ?? null;
  }

  async findOwnedCycle(id: string, userId: string): Promise<CycleRow | null> {
    const [row] = await this.db
      .select()
      .from(performanceCycles)
      .where(and(eq(performanceCycles.id, id), eq(performanceCycles.createdByUserId, userId)))
      .limit(1);
    return row ?? null;
  }

  async completeCycle(id: string): Promise<CycleRow> {
    const [row] = await this.db
      .update(performanceCycles)
      .set({ status: "completed", updatedAt: this.now() })
      .where(eq(performanceCycles.id, id))
      .returning();
    return row;
  }

  // ── Roster ─────────────────────────────────────────────────────────────────
  /** The user's roster rows, earliest first (the default write target). */
  async rosterFor(userId: string): Promise<RosterRef[]> {
    return this.db
      .select({ id: peopleEmployees.id, tenantId: peopleEmployees.tenantId, segmentId: peopleEmployees.segmentId })
      .from(peopleEmployees)
      .where(eq(peopleEmployees.userId, userId))
      .orderBy(asc(peopleEmployees.createdAt), asc(peopleEmployees.id));
  }

  // ── Goals ──────────────────────────────────────────────────────────────────
  private goalQuery() {
    return this.db
      .select({ goal: peopleGoals, userId: goalOwner.userId })
      .from(peopleGoals)
      .innerJoin(goalOwner, eq(goalOwner.id, peopleGoals.employeeId));
  }

  async listGoals(employeeIds: string[]): Promise<PerformanceGoalDto[]> {
    if (employeeIds.length === 0) return [];
    const rows = await this.goalQuery()
      .where(inArray(peopleGoals.employeeId, employeeIds))
      .orderBy(desc(peopleGoals.createdAt));
    return rows.map((r) => toGoalDto(r.goal, r.userId));
  }

  async findGoal(id: string, employeeIds: string[]): Promise<PerformanceGoalDto | null> {
    if (employeeIds.length === 0) return null;
    const [row] = await this.goalQuery()
      .where(and(eq(peopleGoals.id, id), inArray(peopleGoals.employeeId, employeeIds)))
      .limit(1);
    return row ? toGoalDto(row.goal, row.userId) : null;
  }

  async insertGoal(owner: RosterRef, userId: string, input: NewGoalRecord): Promise<PerformanceGoalDto> {
    const [row] = await this.db
      .insert(peopleGoals)
      .values({
        tenantId: owner.tenantId,
        segmentId: owner.segmentId,
        employeeId: owner.id,
        cycleId: input.cycleId,
        title: input.title,
        description: input.description,
        category: input.category,
        dueDate: input.dueDate,
        progress: 0,
        status: "in_progress",
      })
      .returning();
    return toGoalDto(row, userId);
  }

  async updateGoal(id: string, userId: string | null, patch: GoalPatch): Promise<PerformanceGoalDto> {
    const [row] = await this.db
      .update(peopleGoals)
      .set({ ...patch, updatedAt: this.now() })
      .where(eq(peopleGoals.id, id))
      .returning();
    return toGoalDto(row, userId);
  }

  async deleteGoal(id: string): Promise<void> {
    await this.db.delete(peopleGoals).where(eq(peopleGoals.id, id));
  }

  // ── Reviews ────────────────────────────────────────────────────────────────
  private reviewQuery() {
    return this.db
      .select({ review: peoplePerformanceReviews, revieweeUserId: reviewee.userId, reviewerUserId: reviewer.userId })
      .from(peoplePerformanceReviews)
      .innerJoin(reviewee, eq(reviewee.id, peoplePerformanceReviews.employeeId))
      .leftJoin(reviewer, eq(reviewer.id, peoplePerformanceReviews.reviewerId));
  }

  private static mapReviews(
    rows: Array<{ review: ReviewRow; revieweeUserId: string | null; reviewerUserId: string | null }>,
  ): PerformanceReviewDto[] {
    return rows.map((r) => toReviewDto(r.review, r.revieweeUserId, r.reviewerUserId));
  }

  async listReviewsForCycle(cycleId: string): Promise<PerformanceReviewDto[]> {
    return PerformanceRepository.mapReviews(
      await this.reviewQuery().where(eq(peoplePerformanceReviews.cycleId, cycleId)),
    );
  }

  async listReviewsAsReviewer(employeeIds: string[]): Promise<PerformanceReviewDto[]> {
    if (employeeIds.length === 0) return [];
    return PerformanceRepository.mapReviews(
      await this.reviewQuery()
        .where(inArray(peoplePerformanceReviews.reviewerId, employeeIds))
        .orderBy(desc(peoplePerformanceReviews.createdAt)),
    );
  }

  async listReviewsAsReviewee(employeeIds: string[]): Promise<PerformanceReviewDto[]> {
    if (employeeIds.length === 0) return [];
    return PerformanceRepository.mapReviews(
      await this.reviewQuery()
        .where(inArray(peoplePerformanceReviews.employeeId, employeeIds))
        .orderBy(desc(peoplePerformanceReviews.createdAt)),
    );
  }

  async findReview(id: string): Promise<{ dto: PerformanceReviewDto; employeeId: string; reviewerId: string | null } | null> {
    const [row] = await this.reviewQuery().where(eq(peoplePerformanceReviews.id, id)).limit(1);
    if (!row) return null;
    return {
      dto: toReviewDto(row.review, row.revieweeUserId, row.reviewerUserId),
      employeeId: row.review.employeeId,
      reviewerId: row.review.reviewerId,
    };
  }

  async insertReview(scope: RosterRef, input: NewReviewRecord): Promise<PerformanceReviewDto> {
    const [row] = await this.db
      .insert(peoplePerformanceReviews)
      .values({
        tenantId: scope.tenantId,
        segmentId: scope.segmentId,
        status: "in_progress",
        ...input,
      })
      .returning({ id: peoplePerformanceReviews.id });
    const found = await this.findReview(row.id);
    return found.dto;
  }

  async updateReview(id: string, patch: ReviewPatch): Promise<PerformanceReviewDto> {
    await this.db
      .update(peoplePerformanceReviews)
      .set({ ...patch, updatedAt: this.now() })
      .where(eq(peoplePerformanceReviews.id, id));
    const found = await this.findReview(id);
    return found.dto;
  }
}
