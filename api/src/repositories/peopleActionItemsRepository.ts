/**
 * PeopleActionItemsRepository — the canonical cross-source CHRO ActionItem is
 * NOT a bespoke table; it's a segment-scoped row in the existing personal
 * `tasks` table (migration 0186). This repo is the segment-scoped view over
 * `tasks`: every method requires a SegmentScope and filters
 * `(tenant_id, segment_id)`, so CHRO action items and personal kanban tasks
 * (segment_id NULL) never bleed into each other.
 *
 * Mapping tasks → ActionItem semantics:
 *   tasks.userId         = the host user who CREATED the item (not the assignee)
 *   tasks.assigneeEmployeeId = the roster employee it's assigned to
 *   tasks.segmentId/tenantId = the People-Ops scope
 *   tasks.sourceType / oneOnOneId = provenance (e.g. a 1:1)
 *   tasks.boardId        = NULL (CHRO items have no personal board)
 */

import { and, desc, eq, isNotNull, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";
import type { SegmentScope } from "./peopleEmployeesRepository.js";
import type {
  ActionItemStatus,
  ActionItemPriority,
  ActionItemSource,
} from "../../../shared/people-ops.js";

const { tasks } = schema;

export type DbLike = any;
export type ActionItemRow = typeof tasks.$inferSelect;

export interface ActionItemFilters {
  status?: ActionItemStatus;
  sourceType?: ActionItemSource;
  oneOnOneId?: string;
  assigneeEmployeeId?: string;
}

export interface NewActionItemInput {
  title: string;
  description?: string | null;
  status?: ActionItemStatus;
  priority?: ActionItemPriority;
  assigneeEmployeeId?: string | null;
  dueDate?: Date | null;
  /** the host user who created the item → tasks.userId */
  createdBy: string;
  sourceType?: ActionItemSource;
  oneOnOneId?: string | null;
}

export interface IPeopleActionItemsRepository {
  list(scope: SegmentScope, filters?: ActionItemFilters): Promise<ActionItemRow[]>;
  insert(scope: SegmentScope, input: NewActionItemInput): Promise<ActionItemRow>;
  insertMany(scope: SegmentScope, inputs: NewActionItemInput[]): Promise<ActionItemRow[]>;
  deleteByOneOnOne(scope: SegmentScope, oneOnOneId: string): Promise<number>;
}

export class PeopleActionItemsRepository implements IPeopleActionItemsRepository {
  constructor(private readonly db: DbLike) {}

  /** Scope = both segment columns set. isNotNull(segmentId) is belt-and-
   *  suspenders so a NULL-segment personal task can never match even if a
   *  caller passed a bogus scope. */
  private scoped(scope: SegmentScope): SQL[] {
    return [
      eq(tasks.tenantId, scope.tenantId),
      eq(tasks.segmentId, scope.segmentId),
      isNotNull(tasks.segmentId),
    ];
  }

  private toRow(scope: SegmentScope, input: NewActionItemInput) {
    return {
      tenantId: scope.tenantId,
      segmentId: scope.segmentId,
      boardId: null,
      userId: input.createdBy,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? "to_do",
      priority: input.priority ?? "medium",
      assigneeEmployeeId: input.assigneeEmployeeId ?? null,
      dueDate: input.dueDate ?? null,
      sourceType: input.sourceType ?? "manual",
      oneOnOneId: input.oneOnOneId ?? null,
    };
  }

  async list(scope: SegmentScope, filters: ActionItemFilters = {}): Promise<ActionItemRow[]> {
    const where: SQL[] = this.scoped(scope);
    if (filters.status) where.push(eq(tasks.status, filters.status));
    if (filters.sourceType) where.push(eq(tasks.sourceType, filters.sourceType));
    if (filters.oneOnOneId) where.push(eq(tasks.oneOnOneId, filters.oneOnOneId));
    if (filters.assigneeEmployeeId)
      where.push(eq(tasks.assigneeEmployeeId, filters.assigneeEmployeeId));
    return (await this.db
      .select()
      .from(tasks)
      .where(and(...where))
      .orderBy(desc(tasks.createdAt))) as ActionItemRow[];
  }

  async insert(scope: SegmentScope, input: NewActionItemInput): Promise<ActionItemRow> {
    const [row] = await this.db.insert(tasks).values(this.toRow(scope, input)).returning();
    return row as ActionItemRow;
  }

  async insertMany(scope: SegmentScope, inputs: NewActionItemInput[]): Promise<ActionItemRow[]> {
    if (inputs.length === 0) return [];
    return (await this.db
      .insert(tasks)
      .values(inputs.map((i) => this.toRow(scope, i)))
      .returning()) as ActionItemRow[];
  }

  async deleteByOneOnOne(scope: SegmentScope, oneOnOneId: string): Promise<number> {
    const rows = await this.db
      .delete(tasks)
      .where(and(eq(tasks.oneOnOneId, oneOnOneId), ...this.scoped(scope)))
      .returning({ id: tasks.id });
    return rows.length;
  }
}
