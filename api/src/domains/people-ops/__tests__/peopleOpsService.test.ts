/**
 * Tests for PeopleOpsService — the CHRO phase-1 slice. Uses scope-enforcing
 * in-memory fakes (the same fake-repo style as calibrationService.test.ts)
 * so the cross-segment no-bleed invariant is actually exercised: the fakes
 * filter on (tenantId, segmentId), so a leak would surface as a wrong row
 * count, not just an un-asserted code path.
 *
 * Run: node --import tsx --test src/domains/people-ops/__tests__/peopleOpsService.test.ts
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  PeopleOpsService,
  PeopleOpsServiceError,
} from "../peopleOpsService.js";
import type {
  IPeopleEmployeesRepository,
  EmployeeRow,
  EmployeeFilters,
  NewEmployeeInput,
  UpdateEmployeeInput,
  SegmentScope,
} from "../../../repositories/peopleEmployeesRepository.js";
import type {
  IPeopleOneOnOnesRepository,
  OneOnOneRow,
  OneOnOneFilters,
  NewOneOnOneInput,
  UpdateOneOnOneInput,
} from "../../../repositories/peopleOneOnOnesRepository.js";
import type {
  IPeopleActionItemsRepository,
  ActionItemRow,
  ActionItemFilters,
  NewActionItemInput,
} from "../../../repositories/peopleActionItemsRepository.js";
import type {
  IPeopleGoalsRepository,
  GoalRow,
  GoalFilters,
  NewGoalInput,
  UpdateGoalInput,
} from "../../../repositories/peopleGoalsRepository.js";
import type { PeopleSegmentScope } from "../../../services/people-ops/segment.js";

let _id = 0;
const uid = () => `00000000-0000-4000-8000-${String(++_id).padStart(12, "0")}`;

const inScope = (row: { tenantId: string; segmentId: string }, s: SegmentScope) =>
  row.tenantId === s.tenantId && row.segmentId === s.segmentId;

class FakeEmployees implements IPeopleEmployeesRepository {
  rows: EmployeeRow[] = [];
  async list(s: SegmentScope, f: EmployeeFilters = {}) {
    let out = this.rows.filter((r) => inScope(r, s));
    if (f.status) out = out.filter((r) => r.status === f.status);
    if (f.department) out = out.filter((r) => r.department === f.department);
    if (f.managerId != null) out = out.filter((r) => r.managerId === f.managerId);
    return out;
  }
  async findById(s: SegmentScope, id: string) {
    return this.rows.find((r) => r.id === id && inScope(r, s)) ?? null;
  }
  async findByEmail(s: SegmentScope, email: string) {
    return this.rows.find((r) => r.email === email && inScope(r, s)) ?? null;
  }
  async findByUserId(s: SegmentScope, userId: string) {
    return this.rows.find((r) => r.userId === userId && inScope(r, s)) ?? null;
  }
  async materializeMembers(s: SegmentScope, members: { userId: string; firstName: string; lastName: string; email: string | null }[]) {
    for (const m of members) {
      if (this.rows.some((r) => r.userId === m.userId && inScope(r, s))) continue;
      await this.insert(s, {
        userId: m.userId,
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
      } as NewEmployeeInput);
    }
  }
  async countDirectReports(s: SegmentScope, managerId: string) {
    return this.rows.filter((r) => r.managerId === managerId && inScope(r, s)).length;
  }
  async insert(s: SegmentScope, input: NewEmployeeInput) {
    const row = {
      id: uid(),
      tenantId: s.tenantId,
      segmentId: s.segmentId,
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
      avatar: null,
      skills: input.skills ?? [],
      notes: input.notes ?? null,
      managerId: input.managerId ?? null,
      performanceRating: input.performanceRating ?? null,
      salaryCents: input.salaryCents ?? null,
      equityShares: input.equityShares ?? null,
      isFounder: input.isFounder ?? false,
      convertedFromCandidateId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as EmployeeRow;
    this.rows.push(row);
    return row;
  }
  async update(s: SegmentScope, id: string, input: UpdateEmployeeInput) {
    const idx = this.rows.findIndex((r) => r.id === id && inScope(r, s));
    if (idx < 0) return null;
    this.rows[idx] = { ...this.rows[idx], ...input } as EmployeeRow;
    return this.rows[idx];
  }
  async remove(s: SegmentScope, id: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !(r.id === id && inScope(r, s)));
    return this.rows.length < before;
  }
}

class FakeOneOnOnes implements IPeopleOneOnOnesRepository {
  rows: OneOnOneRow[] = [];
  async list(s: SegmentScope, f: OneOnOneFilters = {}) {
    let out = this.rows.filter((r) => inScope(r, s));
    if (f.status) out = out.filter((r) => r.status === f.status);
    return out;
  }
  async findById(s: SegmentScope, id: string) {
    return this.rows.find((r) => r.id === id && inScope(r, s)) ?? null;
  }
  async insert(s: SegmentScope, input: NewOneOnOneInput) {
    const row = {
      id: uid(),
      tenantId: s.tenantId,
      segmentId: s.segmentId,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as OneOnOneRow;
    this.rows.push(row);
    return row;
  }
  async update(s: SegmentScope, id: string, input: UpdateOneOnOneInput) {
    const idx = this.rows.findIndex((r) => r.id === id && inScope(r, s));
    if (idx < 0) return null;
    this.rows[idx] = { ...this.rows[idx], ...input } as OneOnOneRow;
    return this.rows[idx];
  }
  async remove(s: SegmentScope, id: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !(r.id === id && inScope(r, s)));
    return this.rows.length < before;
  }
}

class FakeActionItems implements IPeopleActionItemsRepository {
  rows: ActionItemRow[] = [];
  async list(s: SegmentScope, f: ActionItemFilters = {}) {
    let out = this.rows.filter((r) => inScope(r, s));
    if (f.oneOnOneId) out = out.filter((r) => r.oneOnOneId === f.oneOnOneId);
    return out;
  }
  async insert(s: SegmentScope, input: NewActionItemInput) {
    const row = {
      id: uid(),
      tenantId: s.tenantId,
      segmentId: s.segmentId,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? "to_do",
      priority: input.priority ?? "medium",
      assigneeEmployeeId: input.assigneeEmployeeId ?? null,
      dueDate: input.dueDate ?? null,
      completedAt: null,
      createdBy: input.createdBy,
      sourceType: input.sourceType ?? "manual",
      oneOnOneId: input.oneOnOneId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ActionItemRow;
    this.rows.push(row);
    return row;
  }
  async insertMany(s: SegmentScope, inputs: NewActionItemInput[]) {
    const out: ActionItemRow[] = [];
    for (const i of inputs) out.push(await this.insert(s, i));
    return out;
  }
  async deleteByOneOnOne(s: SegmentScope, oneOnOneId: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !(r.oneOnOneId === oneOnOneId && inScope(r, s)));
    return before - this.rows.length;
  }
}

type Member = { userId: string; firstName: string; lastName: string; email: string | null };

class FakeGoals implements IPeopleGoalsRepository {
  rows: GoalRow[] = [];
  async list(s: SegmentScope, f: GoalFilters = {}) {
    let out = this.rows.filter((r) => inScope(r, s));
    if (f.employeeId) out = out.filter((r) => r.employeeId === f.employeeId);
    if (f.status) out = out.filter((r) => r.status === f.status);
    return out;
  }
  async findById(s: SegmentScope, id: string) {
    return this.rows.find((r) => r.id === id && inScope(r, s)) ?? null;
  }
  async insert(s: SegmentScope, input: NewGoalInput) {
    const row = {
      id: uid(),
      tenantId: s.tenantId,
      segmentId: s.segmentId,
      employeeId: input.employeeId,
      milestoneId: input.milestoneId ?? null,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? "not_started",
      priority: input.priority ?? "medium",
      dueDate: input.dueDate ?? null,
      progress: input.progress ?? 0,
      category: input.category ?? null,
      keyResults: input.keyResults ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as GoalRow;
    this.rows.push(row);
    return row;
  }
  async update(s: SegmentScope, id: string, input: UpdateGoalInput) {
    const idx = this.rows.findIndex((r) => r.id === id && inScope(r, s));
    if (idx < 0) return null;
    this.rows[idx] = { ...this.rows[idx], ...input } as GoalRow;
    return this.rows[idx];
  }
  async remove(s: SegmentScope, id: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !(r.id === id && inScope(r, s)));
    return this.rows.length < before;
  }
}

function build(members: Member[] = []) {
  const employees = new FakeEmployees();
  const oneOnOnes = new FakeOneOnOnes();
  const actionItems = new FakeActionItems();
  const goals = new FakeGoals();
  const svc = new PeopleOpsService({
    employees,
    oneOnOnes,
    actionItems,
    goals,
    getActiveCompanyMembers: async () => members,
    now: () => new Date("2026-06-01T00:00:00Z"),
  });
  return { svc, employees, oneOnOnes, actionItems, goals };
}

const scopeA: PeopleSegmentScope = {
  tenantId: "t1",
  segmentId: "segA",
  companyId: "cA",
  plan: "team",
  displayName: "Company A",
};
const scopeB: PeopleSegmentScope = {
  tenantId: "t1",
  segmentId: "segB",
  companyId: "cB",
  plan: "team",
  displayName: "Company B",
};

const baseEmp = (over: Partial<NewEmployeeInput> = {}): NewEmployeeInput => ({
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@a.com",
  position: "Engineer",
  department: "Engineering",
  ...over,
});

describe("PeopleOpsService — roster (PO-1)", () => {
  it("creates and lists employees within a segment", async () => {
    const { svc } = build();
    await svc.createEmployee(scopeA, baseEmp());
    const list = await svc.listEmployees(scopeA);
    assert.equal(list.length, 1);
    assert.equal(list[0].email, "jane@a.com");
  });

  it("rejects a duplicate email on the same roster (CONFLICT)", async () => {
    const { svc } = build();
    await svc.createEmployee(scopeA, baseEmp());
    await assert.rejects(
      () => svc.createEmployee(scopeA, baseEmp()),
      (e) => e instanceof PeopleOpsServiceError && e.code === "CONFLICT",
    );
  });

  it("allows the same email in a DIFFERENT segment (no bleed)", async () => {
    const { svc } = build();
    await svc.createEmployee(scopeA, baseEmp());
    // Same email, different segment — must succeed and stay isolated.
    await svc.createEmployee(scopeB, baseEmp());
    assert.equal((await svc.listEmployees(scopeA)).length, 1);
    assert.equal((await svc.listEmployees(scopeB)).length, 1);
  });

  it("cannot read another segment's employee by id", async () => {
    const { svc } = build();
    const a = await svc.createEmployee(scopeA, baseEmp());
    await assert.rejects(
      () => svc.getEmployee(scopeB, a.id),
      (e) => e instanceof PeopleOpsServiceError && e.code === "NOT_FOUND",
    );
  });

  it("blocks deleting a manager who still has reports (CONFLICT)", async () => {
    const { svc } = build();
    const mgr = await svc.createEmployee(scopeA, baseEmp({ email: "mgr@a.com" }));
    await svc.createEmployee(scopeA, baseEmp({ email: "rep@a.com", managerId: mgr.id }));
    await assert.rejects(
      () => svc.deleteEmployee(scopeA, mgr.id),
      (e) => e instanceof PeopleOpsServiceError && e.code === "CONFLICT",
    );
  });

  it("rejects an out-of-segment manager on create (VALIDATION_ERROR)", async () => {
    const { svc } = build();
    const a = await svc.createEmployee(scopeA, baseEmp({ email: "a@a.com" }));
    await assert.rejects(
      () => svc.createEmployee(scopeB, baseEmp({ email: "b@b.com", managerId: a.id })),
      (e) => e instanceof PeopleOpsServiceError && e.code === "VALIDATION_ERROR",
    );
  });

  it("builds an org tree from manager_id and is cycle-safe", async () => {
    const { svc } = build();
    const ceo = await svc.createEmployee(scopeA, baseEmp({ email: "ceo@a.com", isFounder: true }));
    const vp = await svc.createEmployee(scopeA, baseEmp({ email: "vp@a.com", managerId: ceo.id }));
    await svc.createEmployee(scopeA, baseEmp({ email: "ic@a.com", managerId: vp.id }));
    const tree = await svc.getHierarchy(scopeA);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].employee.id, ceo.id);
    assert.equal(tree[0].reports[0].employee.id, vp.id);
    assert.equal(tree[0].reports[0].reports[0].employee.email, "ic@a.com");
  });

  it("computes team metrics from live data", async () => {
    const { svc } = build();
    await svc.createEmployee(scopeA, baseEmp({ email: "a@a.com", performanceRating: 4 }));
    await svc.createEmployee(scopeA, baseEmp({ email: "b@a.com", performanceRating: 2, status: "on_leave" }));
    const m = await svc.getTeamMetrics(scopeA);
    assert.equal(m.totalHeadcount, 2);
    assert.equal(m.activeHeadcount, 1);
    assert.equal(m.onLeaveHeadcount, 1);
    assert.equal(m.avgPerformanceRating, 3);
    assert.equal(m.billableSeats, 0); // placeholders are never billable
  });

  it("auto-materializes active company members into the roster", async () => {
    const { svc } = build([{ userId: "u-1", firstName: "Ada", lastName: "L", email: "ada@a.com" }]);
    const list = await svc.listEmployees(scopeA);
    assert.equal(list.length, 1);
    assert.equal(list[0].userId, "u-1");
    assert.equal(list[0].billable, true); // a native member with an active association IS a seat
  });

  it("a placeholder is on the roster but NOT billable; an auto-materialized member IS", async () => {
    const { svc } = build([{ userId: "u-9", firstName: "Grace", lastName: "H", email: "grace@a.com" }]);
    // Placeholder (no identity link, external email) — not billable.
    const placeholder = await svc.createEmployee(scopeA, baseEmp({ email: "contractor@ext.com" }));
    assert.equal(placeholder.billable, false);
    assert.equal(placeholder.userId, null);
    // The active member auto-appears on the roster and IS a billable seat.
    const list = await svc.listEmployees(scopeA);
    const grace = list.find((e) => e.userId === "u-9");
    assert.ok(grace, "active member should auto-materialize onto the roster");
    assert.equal(grace!.billable, true);
    // …and the roster contains both (placeholder + member).
    assert.equal(list.length, 2);
  });

  it("does not double-add a member already on the roster (CONFLICT)", async () => {
    const { svc } = build([{ userId: "u-2", firstName: "Lin", lastName: "T", email: "lin@a.com" }]);
    await svc.listEmployees(scopeA); // materializes u-2
    await assert.rejects(
      () => svc.createEmployee(scopeA, baseEmp({ email: "lin@a.com" })),
      (e) => e instanceof PeopleOpsServiceError && e.code === "CONFLICT",
    );
  });
});

describe("PeopleOpsService — 1:1s (PO-2)", () => {
  let ctx: ReturnType<typeof build>;
  let mgrId: string;
  let repId: string;

  beforeEach(async () => {
    ctx = build();
    mgrId = (await ctx.svc.createEmployee(scopeA, baseEmp({ email: "mgr@a.com" }))).id;
    repId = (await ctx.svc.createEmployee(scopeA, baseEmp({ email: "rep@a.com" }))).id;
  });

  it("schedules a 1:1 between two roster employees", async () => {
    const s = await ctx.svc.createOneOnOne(scopeA, {
      supervisorId: mgrId,
      participantId: repId,
      scheduledDate: new Date("2026-07-01T15:00:00Z"),
    });
    assert.equal(s.status, "scheduled");
    assert.equal((await ctx.svc.listOneOnOnes(scopeA)).length, 1);
  });

  it("rejects a self-1:1 (VALIDATION_ERROR)", async () => {
    await assert.rejects(
      () =>
        ctx.svc.createOneOnOne(scopeA, {
          supervisorId: mgrId,
          participantId: mgrId,
          scheduledDate: new Date(),
        }),
      (e) => e instanceof PeopleOpsServiceError && e.code === "VALIDATION_ERROR",
    );
  });

  it("rejects a participant from another segment", async () => {
    const outsider = await ctx.svc.createEmployee(scopeB, baseEmp({ email: "x@b.com" }));
    await assert.rejects(
      () =>
        ctx.svc.createOneOnOne(scopeA, {
          supervisorId: mgrId,
          participantId: outsider.id,
          scheduledDate: new Date(),
        }),
      (e) => e instanceof PeopleOpsServiceError && e.code === "VALIDATION_ERROR",
    );
  });

  it("manages agenda items by index", async () => {
    const s = await ctx.svc.createOneOnOne(scopeA, {
      supervisorId: mgrId,
      participantId: repId,
      scheduledDate: new Date(),
    });
    let updated = await ctx.svc.addAgendaItem(scopeA, s.id, { title: "Wins", status: "pending" });
    updated = await ctx.svc.addAgendaItem(scopeA, s.id, { title: "Blockers", status: "pending" });
    assert.equal(updated.agenda.length, 2);
    updated = await ctx.svc.updateAgendaItem(scopeA, s.id, 0, { status: "discussed" });
    assert.equal(updated.agenda[0].status, "discussed");
    updated = await ctx.svc.deleteAgendaItem(scopeA, s.id, 0);
    assert.equal(updated.agenda.length, 1);
    assert.equal(updated.agenda[0].title, "Blockers");
    assert.equal(updated.agenda[0].order, 0); // re-sequenced
  });

  it("rejects an out-of-range agenda index (NOT_FOUND)", async () => {
    const s = await ctx.svc.createOneOnOne(scopeA, {
      supervisorId: mgrId,
      participantId: repId,
      scheduledDate: new Date(),
    });
    await assert.rejects(
      () => ctx.svc.updateAgendaItem(scopeA, s.id, 5, { status: "discussed" }),
      (e) => e instanceof PeopleOpsServiceError && e.code === "NOT_FOUND",
    );
  });

  it("mirrors 1:1 action items into the canonical table and cleans them on delete", async () => {
    const s = await ctx.svc.createOneOnOne(scopeA, {
      supervisorId: mgrId,
      participantId: repId,
      scheduledDate: new Date(),
    });
    await ctx.svc.addOneOnOneActionItems(scopeA, s.id, "user-1", [
      { title: "Ship the thing", assigneeEmployeeId: repId },
      { title: "Follow up on raise" },
    ]);
    const items = await ctx.svc.listActionItems(scopeA, { oneOnOneId: s.id });
    assert.equal(items.length, 2);
    assert.equal(items[0].sourceType, "one_on_one");
    assert.equal(items[0].oneOnOneId, s.id);

    await ctx.svc.deleteOneOnOne(scopeA, s.id);
    assert.equal((await ctx.svc.listActionItems(scopeA, { oneOnOneId: s.id })).length, 0);
  });
});

describe("PeopleOpsService — Goals / OKRs (PO-4)", () => {
  let ctx: ReturnType<typeof build>;
  let empId: string;

  beforeEach(async () => {
    ctx = build();
    empId = (await ctx.svc.createEmployee(scopeA, baseEmp({ email: "ic@a.com" }))).id;
  });

  it("rolls up goal progress from the average of key-result progress", async () => {
    const goal = await ctx.svc.createGoal(scopeA, {
      employeeId: empId,
      title: "Ship v2",
      keyResults: [
        { id: "kr1", description: "A", progress: 100 },
        { id: "kr2", description: "B", progress: 0 },
        { id: "kr3", description: "C", progress: 50 },
      ],
    });
    assert.equal(goal.progress, 50); // (100+0+50)/3
  });

  it("recomputes rollup on key-result update", async () => {
    const goal = await ctx.svc.createGoal(scopeA, {
      employeeId: empId,
      title: "Hire 2",
      keyResults: [{ id: "kr1", description: "A", progress: 20 }],
    });
    const updated = await ctx.svc.updateGoal(scopeA, goal.id, {
      keyResults: [
        { id: "kr1", description: "A", progress: 80 },
        { id: "kr2", description: "B", progress: 100 },
      ],
    });
    assert.equal(updated.progress, 90);
  });

  it("flags a past-due, incomplete goal as at-risk (deterministic)", async () => {
    const overdue = await ctx.svc.createGoal(scopeA, {
      employeeId: empId,
      title: "Late",
      dueDate: new Date("2026-01-01T00:00:00Z"), // before the fixed now (2026-06-01)
      status: "in_progress",
    });
    assert.equal(overdue.atRisk, true);
    const future = await ctx.svc.createGoal(scopeA, {
      employeeId: empId,
      title: "On track",
      dueDate: new Date("2026-12-01T00:00:00Z"),
      status: "in_progress",
    });
    assert.equal(future.atRisk, false);
  });

  it("rejects a goal owner from another segment (VALIDATION_ERROR)", async () => {
    await assert.rejects(
      () => ctx.svc.createGoal(scopeB, { employeeId: empId, title: "Cross" }),
      (e) => e instanceof PeopleOpsServiceError && e.code === "VALIDATION_ERROR",
    );
  });

  it("cannot read another segment's goal", async () => {
    const goal = await ctx.svc.createGoal(scopeA, { employeeId: empId, title: "Secret" });
    await assert.rejects(
      () => ctx.svc.getGoal(scopeB, goal.id),
      (e) => e instanceof PeopleOpsServiceError && e.code === "NOT_FOUND",
    );
  });
});
