/**
 * PeopleSegmentRepo — a generic segment-scoped CRUD helper used by the
 * People-Ops surface routers (objectives, pulse, syncs, scorecards, workflows,
 * TCO, headcount, PTO, …). Every table in the People-Ops domain carries
 * (tenant_id, segment_id, id); this collapses the otherwise-identical 19 repos
 * into one, while still enforcing the no-bleed invariant on every query.
 *
 * Typed loosely (table: any) — same pragmatic style as the other repos in this
 * codebase (`DbLike = any`). Callers keep their own typed DTOs.
 */

import { and, desc, eq, type SQL } from "drizzle-orm";
import type { SegmentScope } from "./peopleEmployeesRepository.js";

export class PeopleSegmentRepo {
  constructor(
    private readonly db: any,
    private readonly table: any,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private scoped(s: SegmentScope): SQL[] {
    return [eq(this.table.tenantId, s.tenantId), eq(this.table.segmentId, s.segmentId)];
  }

  async list(s: SegmentScope, where: SQL[] = [], orderCol: any = this.table.createdAt): Promise<any[]> {
    const q = this.db
      .select()
      .from(this.table)
      .where(and(...this.scoped(s), ...where));
    return orderCol ? await q.orderBy(desc(orderCol)) : await q;
  }

  /** Rows whose `field` column equals `value`, newest first by `orderField` (default created_at). */
  listByField(s: SegmentScope, field: string, value: unknown, orderField?: string): Promise<any[]> {
    return this.list(s, [eq(this.table[field], value)], orderField ? this.table[orderField] : this.table.createdAt);
  }

  async findById(s: SegmentScope, id: string): Promise<any | null> {
    const [row] = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.id, id), ...this.scoped(s)))
      .limit(1);
    return row ?? null;
  }

  /** Find the single row for a segment (for 1-per-segment tables, e.g. TCO). */
  async findOne(s: SegmentScope): Promise<any | null> {
    const [row] = await this.db.select().from(this.table).where(and(...this.scoped(s))).limit(1);
    return row ?? null;
  }

  async insert(s: SegmentScope, values: Record<string, unknown>): Promise<any> {
    const [row] = await this.db
      .insert(this.table)
      .values({ ...values, tenantId: s.tenantId, segmentId: s.segmentId })
      .returning();
    return row;
  }

  async update(s: SegmentScope, id: string, patch: Record<string, unknown>): Promise<any | null> {
    const set = { ...patch };
    if (this.table.updatedAt) (set as any).updatedAt = this.now();
    const [row] = await this.db
      .update(this.table)
      .set(set)
      .where(and(eq(this.table.id, id), ...this.scoped(s)))
      .returning();
    return row ?? null;
  }

  async remove(s: SegmentScope, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(this.table)
      .where(and(eq(this.table.id, id), ...this.scoped(s)))
      .returning({ id: this.table.id });
    return rows.length > 0;
  }

  async removeWhere(s: SegmentScope, where: SQL[]): Promise<number> {
    const rows = await this.db
      .delete(this.table)
      .where(and(...this.scoped(s), ...where))
      .returning({ id: this.table.id });
    return rows.length;
  }
}

export { eq };
