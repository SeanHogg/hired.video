/**
 * PeopleOpsService — application layer for the CHRO People-Operations
 * pillar (phase 1: Roster/Org-chart PO-1, 1:1s PO-2). Composes the
 * Segment-scoped repositories. Every public method takes a
 * PeopleSegmentScope so (tenant, segment) isolation is threaded end-to-end.
 *
 * Roster model: the roster is a SUPERSET of billable seats. Active company
 * members (user_company_role_associations) auto-materialize into the roster
 * on read; an employer can also add federated (embedded-tenant) members or
 * placeholders. `billable` is DERIVED (a native user with an active
 * association) — adding to the roster never bumps the seat count, which stays
 * owned by the workforce reconciler.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import {
  PeopleEmployeesRepository,
  type IPeopleEmployeesRepository,
  type EmployeeRow,
  type EmployeeFilters,
  type NewEmployeeInput,
  type UpdateEmployeeInput,
  type SegmentScope,
  type MemberIdentity,
} from "../../repositories/peopleEmployeesRepository.js";
import {
  PeopleOneOnOnesRepository,
  type IPeopleOneOnOnesRepository,
  type OneOnOneRow,
  type OneOnOneFilters,
  type NewOneOnOneInput,
  type UpdateOneOnOneInput,
} from "../../repositories/peopleOneOnOnesRepository.js";
import {
  PeopleActionItemsRepository,
  type IPeopleActionItemsRepository,
  type ActionItemRow,
  type ActionItemFilters,
  type NewActionItemInput,
} from "../../repositories/peopleActionItemsRepository.js";
import {
  PeopleGoalsRepository,
  type IPeopleGoalsRepository,
  type GoalRow,
  type GoalFilters,
  type NewGoalInput,
  type UpdateGoalInput,
} from "../../repositories/peopleGoalsRepository.js";
import type { OneOnOneAgendaItem, KeyResult } from "../../../../shared/people-ops.js";
import type { PeopleSegmentScope } from "../../services/people-ops/segment.js";

export type ServiceErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "VALIDATION_ERROR";

export class PeopleOpsServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface PeopleOpsServiceDeps {
  employees: IPeopleEmployeesRepository;
  oneOnOnes: IPeopleOneOnOnesRepository;
  actionItems: IPeopleActionItemsRepository;
  goals: IPeopleGoalsRepository;
  /** Active company members (the billable-seat set) for the segment's
   *  company — drives roster materialization + billability. */
  getActiveCompanyMembers: (companyId: string) => Promise<MemberIdentity[]>;
  now: () => Date;
}

function splitName(name: string): { firstName: string; lastName: string } {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return { firstName: "Unknown", lastName: "" };
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1) };
}

/** Read the active members of a company (role employee/member) joined to
 *  users, for materialization + billability. */
async function fetchActiveCompanyMembers(companyId: string): Promise<MemberIdentity[]> {
  const db = getDb();
  const rows = await db
    .select({
      userId: schema.userCompanyRoleAssociations.userId,
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.userCompanyRoleAssociations)
    .innerJoin(schema.users, eq(schema.users.id, schema.userCompanyRoleAssociations.userId))
    .where(
      and(
        eq(schema.userCompanyRoleAssociations.companyId, companyId),
        eq(schema.userCompanyRoleAssociations.isActive, true),
        inArray(schema.userCompanyRoleAssociations.role, ["employee", "member"]),
      ),
    );
  return rows.map((r: { userId: string; name: string; email: string | null }) => {
    const { firstName, lastName } = splitName(r.name);
    return { userId: r.userId, firstName, lastName, email: r.email };
  });
}

export function defaultPeopleOpsServiceDeps(): PeopleOpsServiceDeps {
  const db = getDb();
  return {
    employees: new PeopleEmployeesRepository(db),
    oneOnOnes: new PeopleOneOnOnesRepository(db),
    actionItems: new PeopleActionItemsRepository(db),
    goals: new PeopleGoalsRepository(db),
    getActiveCompanyMembers: fetchActiveCompanyMembers,
    now: () => new Date(),
  };
}

/** Goal progress rolls up from its key results (avg of their progress) when
 *  any exist; otherwise the goal's own progress stands. Pure + deterministic. */
export function rollupGoalProgress(keyResults: KeyResult[] | null | undefined, fallback: number): number {
  if (!keyResults || keyResults.length === 0) return clampPct(fallback);
  const avg = keyResults.reduce((sum, kr) => sum + clampPct(kr.progress ?? 0), 0) / keyResults.length;
  return Math.round(avg);
}
function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
export type RosterEmployee = EmployeeRow & { billable: boolean };

export interface OrgNode {
  employee: RosterEmployee;
  reports: OrgNode[];
}

export interface TeamMetrics {
  totalHeadcount: number;
  activeHeadcount: number;
  onLeaveHeadcount: number;
  billableSeats: number;
  avgPerformanceRating: number | null;
  upcomingOneOnOnes: number;
  departmentBreakdown: { department: string; count: number }[];
  employmentTypeBreakdown: { employmentType: string; count: number }[];
}

export interface OneOnOneTemplate {
  key: string;
  name: string;
  agenda: OneOnOneAgendaItem[];
}

export type GoalWithRisk = GoalRow & { atRisk: boolean };

const ONE_ON_ONE_TEMPLATES: OneOnOneTemplate[] = [
  {
    key: "weekly_check_in",
    name: "Weekly Check-in",
    agenda: [
      { title: "Wins since last time", status: "pending", order: 0 },
      { title: "Blockers / where I need help", status: "pending", order: 1 },
      { title: "Priorities for the week", status: "pending", order: 2 },
      { title: "Feedback (both directions)", status: "pending", order: 3 },
    ],
  },
  {
    key: "career_development",
    name: "Career Development",
    agenda: [
      { title: "Long-term goals", status: "pending", order: 0 },
      { title: "Skills to grow", status: "pending", order: 1 },
      { title: "Growth opportunities", status: "pending", order: 2 },
      { title: "Support needed from manager", status: "pending", order: 3 },
    ],
  },
];

export class PeopleOpsService {
  private readonly now: () => Date;
  constructor(private readonly deps: PeopleOpsServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private scope(s: PeopleSegmentScope): SegmentScope {
    return { tenantId: s.tenantId, segmentId: s.segmentId };
  }

  /** Materialize active company members into the roster (idempotent) and
   *  return the set of billable user ids. Called before every roster read so
   *  the roster always reflects current membership. */
  private async syncMembers(s: PeopleSegmentScope): Promise<Set<string>> {
    const members = await this.deps.getActiveCompanyMembers(s.companyId);
    if (members.length > 0) {
      await this.deps.employees.materializeMembers(this.scope(s), members);
    }
    return new Set(members.map((m) => m.userId));
  }

  private withBillable(rows: EmployeeRow[], billableUserIds: Set<string>): RosterEmployee[] {
    return rows.map((r) => ({
      ...r,
      billable: r.userId != null && billableUserIds.has(r.userId),
    }));
  }

  // ── Employees (PO-1) ──────────────────────────────────────────────────────
  async listEmployees(s: PeopleSegmentScope, filters?: EmployeeFilters): Promise<RosterEmployee[]> {
    const billable = await this.syncMembers(s);
    const rows = await this.deps.employees.list(this.scope(s), filters);
    return this.withBillable(rows, billable);
  }

  async getEmployee(s: PeopleSegmentScope, id: string): Promise<RosterEmployee> {
    const row = await this.deps.employees.findById(this.scope(s), id);
    if (!row) throw new PeopleOpsServiceError("NOT_FOUND", "Employee not found.");
    const billable = new Set(
      (await this.deps.getActiveCompanyMembers(s.companyId)).map((m) => m.userId),
    );
    return this.withBillable([row], billable)[0];
  }

  /**
   * Add a roster member. Identity resolution (reuses the employer→user
   * foundation): an explicit userId wins; else if the email matches an active
   * company member we link that user; else it's a placeholder. (Inviting a
   * brand-new user by email — creating an account_invitation — is a tracked
   * follow-up; this never auto-charges a seat.)
   */
  async createEmployee(s: PeopleSegmentScope, input: NewEmployeeInput): Promise<RosterEmployee> {
    const scope = this.scope(s);
    const billable = await this.syncMembers(s);

    let userId = input.userId ?? null;
    if (!userId && input.email) {
      const members = await this.deps.getActiveCompanyMembers(s.companyId);
      const match = members.find((m) => m.email && m.email.toLowerCase() === input.email!.toLowerCase());
      if (match) userId = match.userId;
    }
    if (userId) {
      const existing = await this.deps.employees.findByUserId(scope, userId);
      if (existing) {
        throw new PeopleOpsServiceError("CONFLICT", "That member is already on the roster.");
      }
      billable.add(userId);
    }
    if (input.email) {
      const dupe = await this.deps.employees.findByEmail(scope, input.email);
      if (dupe) {
        throw new PeopleOpsServiceError(
          "CONFLICT",
          "An employee with that email already exists on this roster.",
        );
      }
    }
    if (input.managerId) await this.assertEmployeeInSegment(scope, input.managerId, "manager");

    const row = await this.deps.employees.insert(scope, { ...input, userId });
    return this.withBillable([row], billable)[0];
  }

  async updateEmployee(
    s: PeopleSegmentScope,
    id: string,
    input: UpdateEmployeeInput,
  ): Promise<RosterEmployee> {
    const scope = this.scope(s);
    await this.getEmployee(s, id); // 404 if not in segment
    if (input.managerId) {
      if (input.managerId === id) {
        throw new PeopleOpsServiceError("VALIDATION_ERROR", "An employee cannot manage themselves.");
      }
      await this.assertEmployeeInSegment(scope, input.managerId, "manager");
    }
    if (input.email) {
      const dupe = await this.deps.employees.findByEmail(scope, input.email);
      if (dupe && dupe.id !== id) {
        throw new PeopleOpsServiceError("CONFLICT", "Another employee already uses that email.");
      }
    }
    const row = await this.deps.employees.update(scope, id, input);
    if (!row) throw new PeopleOpsServiceError("NOT_FOUND", "Employee not found.");
    const billable = new Set(
      (await this.deps.getActiveCompanyMembers(s.companyId)).map((m) => m.userId),
    );
    return this.withBillable([row], billable)[0];
  }

  async deleteEmployee(s: PeopleSegmentScope, id: string): Promise<void> {
    const scope = this.scope(s);
    await this.getEmployee(s, id); // 404 if not in segment
    // PO-1 acceptance: block delete while reports exist.
    const reports = await this.deps.employees.countDirectReports(scope, id);
    if (reports > 0) {
      throw new PeopleOpsServiceError(
        "CONFLICT",
        `Cannot remove a manager with ${reports} direct report(s). Re-assign their reports first.`,
      );
    }
    await this.deps.employees.remove(scope, id);
  }

  /** Org tree: roots are employees with no manager (or a manager outside the
   *  roster), nested down through manager_id. Cycle-safe. */
  async getHierarchy(s: PeopleSegmentScope): Promise<OrgNode[]> {
    const billable = await this.syncMembers(s);
    const all = this.withBillable(await this.deps.employees.list(this.scope(s)), billable);
    const byId = new Map<string, RosterEmployee>(all.map((e) => [e.id, e]));
    const childrenOf = new Map<string, RosterEmployee[]>();
    const roots: RosterEmployee[] = [];
    for (const e of all) {
      if (e.managerId && byId.has(e.managerId)) {
        const list = childrenOf.get(e.managerId) ?? [];
        list.push(e);
        childrenOf.set(e.managerId, list);
      } else {
        roots.push(e);
      }
    }
    const seen = new Set<string>();
    const build = (e: RosterEmployee): OrgNode => {
      seen.add(e.id);
      const reports = (childrenOf.get(e.id) ?? []).filter((c) => !seen.has(c.id)).map(build);
      return { employee: e, reports };
    };
    return roots.map(build);
  }

  async getTeamMetrics(s: PeopleSegmentScope): Promise<TeamMetrics> {
    const scope = this.scope(s);
    const billable = await this.syncMembers(s);
    const employees = this.withBillable(await this.deps.employees.list(scope), billable);
    const ratings = employees
      .map((e) => e.performanceRating)
      .filter((r): r is number => typeof r === "number");
    const avgPerformanceRating =
      ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

    const tally = (key: (e: RosterEmployee) => string) => {
      const m = new Map<string, number>();
      for (const e of employees) {
        const k = key(e) || "Unassigned";
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m.entries()].map(([k, count]) => ({ k, count })).sort((a, b) => b.count - a.count);
    };

    const now = this.now();
    const sessions = await this.deps.oneOnOnes.list(scope, { status: "scheduled" });
    const upcomingOneOnOnes = sessions.filter(
      (x) => new Date(x.scheduledDate).getTime() >= now.getTime(),
    ).length;

    return {
      totalHeadcount: employees.length,
      activeHeadcount: employees.filter((e) => e.status === "active").length,
      onLeaveHeadcount: employees.filter((e) => e.status === "on_leave").length,
      billableSeats: employees.filter((e) => e.billable).length,
      avgPerformanceRating,
      upcomingOneOnOnes,
      departmentBreakdown: tally((e) => e.department).map((x) => ({
        department: x.k,
        count: x.count,
      })),
      employmentTypeBreakdown: tally((e) => e.employmentType).map((x) => ({
        employmentType: x.k,
        count: x.count,
      })),
    };
  }

  // ── 1:1s (PO-2) ───────────────────────────────────────────────────────────
  listOneOnOnes(s: PeopleSegmentScope, filters?: OneOnOneFilters): Promise<OneOnOneRow[]> {
    return this.deps.oneOnOnes.list(this.scope(s), filters);
  }

  getOneOnOneTemplates(): OneOnOneTemplate[] {
    return ONE_ON_ONE_TEMPLATES;
  }

  async getOneOnOne(s: PeopleSegmentScope, id: string): Promise<OneOnOneRow> {
    const row = await this.deps.oneOnOnes.findById(this.scope(s), id);
    if (!row) throw new PeopleOpsServiceError("NOT_FOUND", "1:1 session not found.");
    return row;
  }

  async createOneOnOne(s: PeopleSegmentScope, input: NewOneOnOneInput): Promise<OneOnOneRow> {
    const scope = this.scope(s);
    if (input.supervisorId === input.participantId) {
      throw new PeopleOpsServiceError(
        "VALIDATION_ERROR",
        "Supervisor and participant must be different people.",
      );
    }
    await this.assertEmployeeInSegment(scope, input.supervisorId, "supervisor");
    await this.assertEmployeeInSegment(scope, input.participantId, "participant");
    return this.deps.oneOnOnes.insert(scope, input);
  }

  async updateOneOnOne(
    s: PeopleSegmentScope,
    id: string,
    input: UpdateOneOnOneInput,
  ): Promise<OneOnOneRow> {
    const scope = this.scope(s);
    await this.getOneOnOne(s, id);
    if (input.supervisorId) await this.assertEmployeeInSegment(scope, input.supervisorId, "supervisor");
    if (input.participantId)
      await this.assertEmployeeInSegment(scope, input.participantId, "participant");
    const row = await this.deps.oneOnOnes.update(scope, id, input);
    if (!row) throw new PeopleOpsServiceError("NOT_FOUND", "1:1 session not found.");
    return row;
  }

  async deleteOneOnOne(s: PeopleSegmentScope, id: string): Promise<void> {
    const scope = this.scope(s);
    await this.getOneOnOne(s, id);
    await this.deps.actionItems.deleteByOneOnOne(scope, id);
    await this.deps.oneOnOnes.remove(scope, id);
  }

  // ── Agenda items (index-addressed, per PO-2) ────────────────────────────────
  async addAgendaItem(
    s: PeopleSegmentScope,
    id: string,
    item: Omit<OneOnOneAgendaItem, "order">,
  ): Promise<OneOnOneRow> {
    const session = await this.getOneOnOne(s, id);
    const agenda = [...(session.agenda ?? [])];
    agenda.push({ ...item, order: agenda.length });
    return this.updateOneOnOne(s, id, { agenda });
  }

  async updateAgendaItem(
    s: PeopleSegmentScope,
    id: string,
    index: number,
    patch: Partial<OneOnOneAgendaItem>,
  ): Promise<OneOnOneRow> {
    const session = await this.getOneOnOne(s, id);
    const agenda = [...(session.agenda ?? [])];
    if (index < 0 || index >= agenda.length) {
      throw new PeopleOpsServiceError("NOT_FOUND", "Agenda item index out of range.");
    }
    agenda[index] = { ...agenda[index], ...patch, order: index };
    return this.updateOneOnOne(s, id, { agenda });
  }

  async deleteAgendaItem(
    s: PeopleSegmentScope,
    id: string,
    index: number,
  ): Promise<OneOnOneRow> {
    const session = await this.getOneOnOne(s, id);
    const agenda = [...(session.agenda ?? [])];
    if (index < 0 || index >= agenda.length) {
      throw new PeopleOpsServiceError("NOT_FOUND", "Agenda item index out of range.");
    }
    agenda.splice(index, 1);
    agenda.forEach((a, i) => (a.order = i)); // re-sequence
    return this.updateOneOnOne(s, id, { agenda });
  }

  // ── Action items (canonical store = the `tasks` table) ──────────────────────
  listActionItems(s: PeopleSegmentScope, filters?: ActionItemFilters): Promise<ActionItemRow[]> {
    return this.deps.actionItems.list(this.scope(s), filters);
  }

  /** Mirror action items captured during a 1:1 into the canonical `tasks`
   *  table (segment-scoped, sourceType='one_on_one', oneOnOneId set) so they
   *  share the unified inbox and trace back to the session. */
  async addOneOnOneActionItems(
    s: PeopleSegmentScope,
    oneOnOneId: string,
    createdBy: string,
    items: { title: string; description?: string; assigneeEmployeeId?: string; dueDate?: Date }[],
  ): Promise<ActionItemRow[]> {
    const scope = this.scope(s);
    await this.getOneOnOne(s, oneOnOneId); // 404 if not in segment
    const inputs: NewActionItemInput[] = items.map((i) => ({
      title: i.title,
      description: i.description ?? null,
      assigneeEmployeeId: i.assigneeEmployeeId ?? null,
      dueDate: i.dueDate ?? null,
      createdBy,
      sourceType: "one_on_one",
      oneOnOneId,
    }));
    return this.deps.actionItems.insertMany(scope, inputs);
  }

  // ── Goals / OKRs (PO-4) ─────────────────────────────────────────────────────
  async listGoals(s: PeopleSegmentScope, filters?: GoalFilters): Promise<GoalWithRisk[]> {
    const rows = await this.deps.goals.list(this.scope(s), filters);
    return rows.map((g) => this.withRisk(g));
  }

  async getGoal(s: PeopleSegmentScope, id: string): Promise<GoalWithRisk> {
    const row = await this.deps.goals.findById(this.scope(s), id);
    if (!row) throw new PeopleOpsServiceError("NOT_FOUND", "Goal not found.");
    return this.withRisk(row);
  }

  async createGoal(s: PeopleSegmentScope, input: NewGoalInput): Promise<GoalWithRisk> {
    const scope = this.scope(s);
    await this.assertEmployeeInSegment(scope, input.employeeId, "goal owner");
    const progress = rollupGoalProgress(input.keyResults, input.progress ?? 0);
    const row = await this.deps.goals.insert(scope, { ...input, progress });
    return this.withRisk(row);
  }

  async updateGoal(s: PeopleSegmentScope, id: string, input: UpdateGoalInput): Promise<GoalWithRisk> {
    const scope = this.scope(s);
    const current = await this.deps.goals.findById(scope, id);
    if (!current) throw new PeopleOpsServiceError("NOT_FOUND", "Goal not found.");
    if (input.employeeId) await this.assertEmployeeInSegment(scope, input.employeeId, "goal owner");
    // Recompute rollup whenever key results change (or progress is given).
    const patch: UpdateGoalInput = { ...input };
    if (input.keyResults !== undefined || input.progress !== undefined) {
      const krs = input.keyResults ?? (current.keyResults as KeyResult[]);
      patch.progress = rollupGoalProgress(krs, input.progress ?? current.progress);
    }
    const row = await this.deps.goals.update(scope, id, patch);
    if (!row) throw new PeopleOpsServiceError("NOT_FOUND", "Goal not found.");
    return this.withRisk(row);
  }

  async deleteGoal(s: PeopleSegmentScope, id: string): Promise<void> {
    const scope = this.scope(s);
    await this.getGoal(s, id);
    await this.deps.goals.remove(scope, id);
  }

  /** At-risk = explicitly flagged, blocked, or past due and not yet complete.
   *  Deterministic (PO-4 acceptance: surfaced, not just claimed). */
  private withRisk(g: GoalRow): GoalWithRisk {
    const now = this.now();
    const pastDue =
      g.dueDate != null &&
      new Date(g.dueDate).getTime() < now.getTime() &&
      g.status !== "completed" &&
      g.status !== "cancelled";
    const atRisk = g.status === "at_risk" || g.status === "blocked" || pastDue;
    return { ...g, atRisk };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────
  private async assertEmployeeInSegment(
    scope: SegmentScope,
    employeeId: string,
    label: string,
  ): Promise<void> {
    const row = await this.deps.employees.findById(scope, employeeId);
    if (!row) {
      throw new PeopleOpsServiceError(
        "VALIDATION_ERROR",
        `The ${label} is not an employee on this roster.`,
      );
    }
  }
}
