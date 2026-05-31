/**
 * PeopleEmployeesRepository — Segment-scoped persistence for the Employee
 * spine (roster). EVERY method takes a `SegmentScope` first and adds
 * (tenant_id, segment_id) to every WHERE, so a query can never reach another
 * segment's rows (the no-bleed invariant, specs/hired-video/01 §3).
 *
 * A roster row carries one identity link — userId (native login) |
 * invitationId (pending invite) | externalUserId (federated, embedded
 * tenant) | none (placeholder). Billability is NOT decided here: it's derived
 * in the service from the active company association, and the roster never
 * bumps seats.
 */

import { and, asc, eq, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";
import type { EmployeeStatus } from "../../../shared/people-ops.js";

const { peopleEmployees } = schema;

export type DbLike = any;
export type EmployeeRow = typeof peopleEmployees.$inferSelect;

/** The (tenant, segment) scope every repository method requires. */
export interface SegmentScope {
  tenantId: string;
  segmentId: string;
}

export interface EmployeeFilters {
  department?: string;
  status?: EmployeeStatus;
  employmentType?: string;
  managerId?: string | null;
  /** free-text match on name / position / skills */
  q?: string;
}

export interface NewEmployeeInput {
  // Identity link (at most one; none = placeholder).
  userId?: string | null;
  invitationId?: string | null;
  externalUserId?: string | null;

  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  position?: string;
  department?: string;
  location?: string | null;
  startDate?: Date | null;
  employmentType?: string;
  status?: EmployeeStatus;
  avatar?: string | null;
  skills?: string[];
  notes?: string | null;
  managerId?: string | null;
  performanceRating?: number | null;
  salaryCents?: number | null;
  equityShares?: number | null;
  isFounder?: boolean;
  convertedFromCandidateId?: string | null;
}

export type UpdateEmployeeInput = Partial<NewEmployeeInput>;

/** Minimal identity for materializing an active company member into the roster. */
export interface MemberIdentity {
  userId: string;
  firstName: string;
  lastName: string;
  email: string | null;
}

export interface IPeopleEmployeesRepository {
  list(scope: SegmentScope, filters?: EmployeeFilters): Promise<EmployeeRow[]>;
  findById(scope: SegmentScope, id: string): Promise<EmployeeRow | null>;
  findByEmail(scope: SegmentScope, email: string): Promise<EmployeeRow | null>;
  findByUserId(scope: SegmentScope, userId: string): Promise<EmployeeRow | null>;
  countDirectReports(scope: SegmentScope, managerId: string): Promise<number>;
  insert(scope: SegmentScope, input: NewEmployeeInput): Promise<EmployeeRow>;
  update(scope: SegmentScope, id: string, input: UpdateEmployeeInput): Promise<EmployeeRow | null>;
  remove(scope: SegmentScope, id: string): Promise<boolean>;
  /** Upsert a roster row per active member that doesn't have one yet
   *  (idempotent on the partial unique (tenant, segment, user_id)). */
  materializeMembers(scope: SegmentScope, members: MemberIdentity[]): Promise<void>;
}

export class PeopleEmployeesRepository implements IPeopleEmployeesRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private scoped(scope: SegmentScope): SQL[] {
    return [
      eq(peopleEmployees.tenantId, scope.tenantId),
      eq(peopleEmployees.segmentId, scope.segmentId),
    ];
  }

  async list(scope: SegmentScope, filters: EmployeeFilters = {}): Promise<EmployeeRow[]> {
    const where: SQL[] = this.scoped(scope);
    if (filters.department) where.push(eq(peopleEmployees.department, filters.department));
    if (filters.status) where.push(eq(peopleEmployees.status, filters.status));
    if (filters.employmentType)
      where.push(eq(peopleEmployees.employmentType, filters.employmentType));
    if (filters.managerId !== undefined && filters.managerId !== null)
      where.push(eq(peopleEmployees.managerId, filters.managerId));

    const rows: EmployeeRow[] = await this.db
      .select()
      .from(peopleEmployees)
      .where(and(...where))
      .orderBy(asc(peopleEmployees.lastName), asc(peopleEmployees.firstName));

    const q = filters.q?.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.firstName,
        r.lastName,
        r.position,
        r.department,
        ...(Array.isArray(r.skills) ? (r.skills as string[]) : []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  async findById(scope: SegmentScope, id: string): Promise<EmployeeRow | null> {
    const [row] = await this.db
      .select()
      .from(peopleEmployees)
      .where(and(eq(peopleEmployees.id, id), ...this.scoped(scope)))
      .limit(1);
    return (row as EmployeeRow) ?? null;
  }

  async findByEmail(scope: SegmentScope, email: string): Promise<EmployeeRow | null> {
    const [row] = await this.db
      .select()
      .from(peopleEmployees)
      .where(and(eq(peopleEmployees.email, email), ...this.scoped(scope)))
      .limit(1);
    return (row as EmployeeRow) ?? null;
  }

  async findByUserId(scope: SegmentScope, userId: string): Promise<EmployeeRow | null> {
    const [row] = await this.db
      .select()
      .from(peopleEmployees)
      .where(and(eq(peopleEmployees.userId, userId), ...this.scoped(scope)))
      .limit(1);
    return (row as EmployeeRow) ?? null;
  }

  async countDirectReports(scope: SegmentScope, managerId: string): Promise<number> {
    const rows = await this.db
      .select({ id: peopleEmployees.id })
      .from(peopleEmployees)
      .where(and(eq(peopleEmployees.managerId, managerId), ...this.scoped(scope)));
    return rows.length;
  }

  async insert(scope: SegmentScope, input: NewEmployeeInput): Promise<EmployeeRow> {
    const [row] = await this.db
      .insert(peopleEmployees)
      .values({
        tenantId: scope.tenantId,
        segmentId: scope.segmentId,
        userId: input.userId ?? null,
        invitationId: input.invitationId ?? null,
        externalUserId: input.externalUserId ?? null,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        position: input.position ?? "",
        department: input.department ?? "",
        location: input.location ?? null,
        startDate: input.startDate ?? null,
        employmentType: input.employmentType ?? "full-time",
        status: input.status ?? "active",
        avatar: input.avatar ?? null,
        skills: input.skills ?? [],
        notes: input.notes ?? null,
        managerId: input.managerId ?? null,
        performanceRating: input.performanceRating ?? null,
        salaryCents: input.salaryCents ?? null,
        equityShares: input.equityShares ?? null,
        isFounder: input.isFounder ?? false,
        convertedFromCandidateId: input.convertedFromCandidateId ?? null,
      })
      .returning();
    return row as EmployeeRow;
  }

  async update(
    scope: SegmentScope,
    id: string,
    input: UpdateEmployeeInput,
  ): Promise<EmployeeRow | null> {
    const patch: Record<string, unknown> = { updatedAt: this.now() };
    const assign = <K extends keyof UpdateEmployeeInput>(key: K, col: string) => {
      if (input[key] !== undefined) patch[col] = input[key];
    };
    assign("firstName", "firstName");
    assign("lastName", "lastName");
    assign("email", "email");
    assign("phone", "phone");
    assign("position", "position");
    assign("department", "department");
    assign("location", "location");
    assign("startDate", "startDate");
    assign("employmentType", "employmentType");
    assign("status", "status");
    assign("avatar", "avatar");
    assign("skills", "skills");
    assign("notes", "notes");
    assign("managerId", "managerId");
    assign("performanceRating", "performanceRating");
    assign("salaryCents", "salaryCents");
    assign("equityShares", "equityShares");
    assign("isFounder", "isFounder");
    assign("convertedFromCandidateId", "convertedFromCandidateId");
    // Identity links are re-assignable (e.g. an invitation accepted → user_id).
    assign("userId", "userId");
    assign("invitationId", "invitationId");
    assign("externalUserId", "externalUserId");

    const [row] = await this.db
      .update(peopleEmployees)
      .set(patch)
      .where(and(eq(peopleEmployees.id, id), ...this.scoped(scope)))
      .returning();
    return (row as EmployeeRow) ?? null;
  }

  async remove(scope: SegmentScope, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(peopleEmployees)
      .where(and(eq(peopleEmployees.id, id), ...this.scoped(scope)))
      .returning({ id: peopleEmployees.id });
    return rows.length > 0;
  }

  async materializeMembers(scope: SegmentScope, members: MemberIdentity[]): Promise<void> {
    if (members.length === 0) return;
    await this.db
      .insert(peopleEmployees)
      .values(
        members.map((m) => ({
          tenantId: scope.tenantId,
          segmentId: scope.segmentId,
          userId: m.userId,
          firstName: m.firstName,
          lastName: m.lastName,
          email: m.email,
        })),
      )
      // Idempotent: a member that already has a roster row is left untouched.
      .onConflictDoNothing();
  }
}
