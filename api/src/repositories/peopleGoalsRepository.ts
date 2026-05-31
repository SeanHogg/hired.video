/**
 * PeopleGoalsRepository — Segment-scoped persistence for Goals/OKRs (PO-4).
 * Same no-bleed contract as the other people-ops repos: every method takes a
 * SegmentScope and filters (tenant_id, segment_id).
 */

import { and, desc, eq, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";
import type { SegmentScope } from "./peopleEmployeesRepository.js";
import type { GoalStatus, GoalPriority, KeyResult } from "../../../shared/people-ops.js";

const { peopleGoals } = schema;

export type DbLike = any;
export type GoalRow = typeof peopleGoals.$inferSelect;

export interface GoalFilters {
  employeeId?: string;
  status?: GoalStatus;
  category?: string;
}

export interface NewGoalInput {
  employeeId: string;
  title: string;
  description?: string | null;
  status?: GoalStatus;
  priority?: GoalPriority;
  dueDate?: Date | null;
  progress?: number;
  category?: string | null;
  keyResults?: KeyResult[];
  milestoneId?: string | null;
}

export type UpdateGoalInput = Partial<NewGoalInput>;

export interface IPeopleGoalsRepository {
  list(scope: SegmentScope, filters?: GoalFilters): Promise<GoalRow[]>;
  findById(scope: SegmentScope, id: string): Promise<GoalRow | null>;
  insert(scope: SegmentScope, input: NewGoalInput): Promise<GoalRow>;
  update(scope: SegmentScope, id: string, input: UpdateGoalInput): Promise<GoalRow | null>;
  remove(scope: SegmentScope, id: string): Promise<boolean>;
}

export class PeopleGoalsRepository implements IPeopleGoalsRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private scoped(scope: SegmentScope): SQL[] {
    return [eq(peopleGoals.tenantId, scope.tenantId), eq(peopleGoals.segmentId, scope.segmentId)];
  }

  async list(scope: SegmentScope, filters: GoalFilters = {}): Promise<GoalRow[]> {
    const where: SQL[] = this.scoped(scope);
    if (filters.employeeId) where.push(eq(peopleGoals.employeeId, filters.employeeId));
    if (filters.status) where.push(eq(peopleGoals.status, filters.status));
    if (filters.category) where.push(eq(peopleGoals.category, filters.category));
    return (await this.db
      .select()
      .from(peopleGoals)
      .where(and(...where))
      .orderBy(desc(peopleGoals.createdAt))) as GoalRow[];
  }

  async findById(scope: SegmentScope, id: string): Promise<GoalRow | null> {
    const [row] = await this.db
      .select()
      .from(peopleGoals)
      .where(and(eq(peopleGoals.id, id), ...this.scoped(scope)))
      .limit(1);
    return (row as GoalRow) ?? null;
  }

  async insert(scope: SegmentScope, input: NewGoalInput): Promise<GoalRow> {
    const [row] = await this.db
      .insert(peopleGoals)
      .values({
        tenantId: scope.tenantId,
        segmentId: scope.segmentId,
        employeeId: input.employeeId,
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? "not_started",
        priority: input.priority ?? "medium",
        dueDate: input.dueDate ?? null,
        progress: input.progress ?? 0,
        category: input.category ?? null,
        keyResults: input.keyResults ?? [],
        milestoneId: input.milestoneId ?? null,
      })
      .returning();
    return row as GoalRow;
  }

  async update(scope: SegmentScope, id: string, input: UpdateGoalInput): Promise<GoalRow | null> {
    const patch: Record<string, unknown> = { updatedAt: this.now() };
    const assign = <K extends keyof UpdateGoalInput>(key: K, col: string) => {
      if (input[key] !== undefined) patch[col] = input[key];
    };
    assign("employeeId", "employeeId");
    assign("title", "title");
    assign("description", "description");
    assign("status", "status");
    assign("priority", "priority");
    assign("dueDate", "dueDate");
    assign("progress", "progress");
    assign("category", "category");
    assign("keyResults", "keyResults");
    assign("milestoneId", "milestoneId");
    const [row] = await this.db
      .update(peopleGoals)
      .set(patch)
      .where(and(eq(peopleGoals.id, id), ...this.scoped(scope)))
      .returning();
    return (row as GoalRow) ?? null;
  }

  async remove(scope: SegmentScope, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(peopleGoals)
      .where(and(eq(peopleGoals.id, id), ...this.scoped(scope)))
      .returning({ id: peopleGoals.id });
    return rows.length > 0;
  }
}
