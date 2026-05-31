/**
 * PeopleOneOnOnesRepository — Segment-scoped persistence for 1:1 sessions
 * (PO-2). Same no-bleed contract as PeopleEmployeesRepository: every method
 * takes a SegmentScope and filters on (tenant_id, segment_id).
 */

import { and, asc, desc, eq, or, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";
import type { SegmentScope } from "./peopleEmployeesRepository.js";
import type {
  OneOnOneAgendaItem,
  OneOnOneStatus,
  MeetingType,
} from "../../../shared/people-ops.js";

const { peopleOneOnOnes } = schema;

export type DbLike = any;
export type OneOnOneRow = typeof peopleOneOnOnes.$inferSelect;

export interface OneOnOneFilters {
  supervisorId?: string;
  participantId?: string;
  status?: OneOnOneStatus;
  /** match either side (supervisor OR participant) */
  employeeId?: string;
}

export interface NewOneOnOneInput {
  supervisorId: string;
  participantId: string;
  scheduledDate: Date;
  duration?: number;
  status?: OneOnOneStatus;
  meetingType?: MeetingType;
  location?: string | null;
  meetingLink?: string | null;
  agenda?: OneOnOneAgendaItem[];
  notes?: string | null;
}

export type UpdateOneOnOneInput = Partial<NewOneOnOneInput>;

export interface IPeopleOneOnOnesRepository {
  list(scope: SegmentScope, filters?: OneOnOneFilters): Promise<OneOnOneRow[]>;
  findById(scope: SegmentScope, id: string): Promise<OneOnOneRow | null>;
  insert(scope: SegmentScope, input: NewOneOnOneInput): Promise<OneOnOneRow>;
  update(scope: SegmentScope, id: string, input: UpdateOneOnOneInput): Promise<OneOnOneRow | null>;
  remove(scope: SegmentScope, id: string): Promise<boolean>;
}

export class PeopleOneOnOnesRepository implements IPeopleOneOnOnesRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private scoped(scope: SegmentScope): SQL[] {
    return [
      eq(peopleOneOnOnes.tenantId, scope.tenantId),
      eq(peopleOneOnOnes.segmentId, scope.segmentId),
    ];
  }

  async list(scope: SegmentScope, filters: OneOnOneFilters = {}): Promise<OneOnOneRow[]> {
    const where: SQL[] = this.scoped(scope);
    if (filters.supervisorId) where.push(eq(peopleOneOnOnes.supervisorId, filters.supervisorId));
    if (filters.participantId)
      where.push(eq(peopleOneOnOnes.participantId, filters.participantId));
    if (filters.status) where.push(eq(peopleOneOnOnes.status, filters.status));
    if (filters.employeeId) {
      const side = or(
        eq(peopleOneOnOnes.supervisorId, filters.employeeId),
        eq(peopleOneOnOnes.participantId, filters.employeeId),
      );
      if (side) where.push(side);
    }
    return (await this.db
      .select()
      .from(peopleOneOnOnes)
      .where(and(...where))
      .orderBy(desc(peopleOneOnOnes.scheduledDate))) as OneOnOneRow[];
  }

  async findById(scope: SegmentScope, id: string): Promise<OneOnOneRow | null> {
    const [row] = await this.db
      .select()
      .from(peopleOneOnOnes)
      .where(and(eq(peopleOneOnOnes.id, id), ...this.scoped(scope)))
      .limit(1);
    return (row as OneOnOneRow) ?? null;
  }

  async insert(scope: SegmentScope, input: NewOneOnOneInput): Promise<OneOnOneRow> {
    const [row] = await this.db
      .insert(peopleOneOnOnes)
      .values({
        tenantId: scope.tenantId,
        segmentId: scope.segmentId,
        supervisorId: input.supervisorId,
        participantId: input.participantId,
        scheduledDate: input.scheduledDate,
        duration: input.duration ?? 60,
        status: input.status ?? "scheduled",
        meetingType: input.meetingType ?? "video",
        location: input.location ?? null,
        meetingLink: input.meetingLink ?? null,
        agenda: input.agenda ?? [],
        notes: input.notes ?? null,
      })
      .returning();
    return row as OneOnOneRow;
  }

  async update(
    scope: SegmentScope,
    id: string,
    input: UpdateOneOnOneInput,
  ): Promise<OneOnOneRow | null> {
    const patch: Record<string, unknown> = { updatedAt: this.now() };
    const assign = <K extends keyof UpdateOneOnOneInput>(key: K, col: string) => {
      if (input[key] !== undefined) patch[col] = input[key];
    };
    assign("supervisorId", "supervisorId");
    assign("participantId", "participantId");
    assign("scheduledDate", "scheduledDate");
    assign("duration", "duration");
    assign("status", "status");
    assign("meetingType", "meetingType");
    assign("location", "location");
    assign("meetingLink", "meetingLink");
    assign("agenda", "agenda");
    assign("notes", "notes");

    const [row] = await this.db
      .update(peopleOneOnOnes)
      .set(patch)
      .where(and(eq(peopleOneOnOnes.id, id), ...this.scoped(scope)))
      .returning();
    return (row as OneOnOneRow) ?? null;
  }

  async remove(scope: SegmentScope, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(peopleOneOnOnes)
      .where(and(eq(peopleOneOnOnes.id, id), ...this.scoped(scope)))
      .returning({ id: peopleOneOnOnes.id });
    return rows.length > 0;
  }
}

export { asc };
