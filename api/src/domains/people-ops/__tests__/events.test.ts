/**
 * Tests for the default People-Ops event sink (#1824) — the fan-out from a
 * domain event to BOTH the activity-log audit trail and the inbox
 * notification, including roster-employee→user resolution and the self-notify
 * filter. `runDetached` is overridden to capture each task's promise so the
 * assertions can await the REAL work (no floating promise, no timer guess).
 *
 * Run: node --import tsx --test src/domains/people-ops/__tests__/events.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createPeopleOpsEventSink, type PeopleOpsEventContext } from "../events.js";
import type {
  ActivityLogInsert,
  IAuditRepository,
} from "../../../repositories/auditRepository.js";

// ── Minimal fakes ─────────────────────────────────────────────────────────────
class FakeAudit implements Partial<IAuditRepository> {
  activities: ActivityLogInsert[] = [];
  async insertActivity(input: ActivityLogInsert) {
    this.activities.push(input);
  }
}

class FakeNotifications {
  inserted: any[] = [];
  async insertNotification(input: any) {
    this.inserted.push(input);
  }
  async insertNotifications(inputs: any[]) {
    this.inserted.push(...inputs);
  }
}

class FakeUsers {
  constructor(private readonly actors: Record<string, { id: string; name: string }>) {}
  async findActorsByIds(ids: string[]) {
    return ids.map((id) => this.actors[id]).filter(Boolean) as any[];
  }
}

/** Roster employee → linked user id, the resolution the sink performs. */
class FakeEmployees {
  constructor(private readonly map: Record<string, string | null>) {}
  async findById(_scope: unknown, id: string) {
    if (!(id in this.map)) return null;
    return { id, userId: this.map[id] } as any;
  }
  async findManyByIds(_scope: unknown, ids: readonly string[]) {
    return [...new Set(ids)]
      .filter((id) => id in this.map)
      .map((id) => ({ id, userId: this.map[id] }) as any);
  }
}

const scope = { tenantId: "t1", segmentId: "segA" };
const ctx = (actorUserId: string | null = "actor"): PeopleOpsEventContext => ({
  actorUserId,
  scope,
  companyId: "cA",
});

function buildSink(opts: {
  employees?: Record<string, string | null>;
  actors?: Record<string, { id: string; name: string }>;
}) {
  const audit = new FakeAudit();
  const notifications = new FakeNotifications();
  const users = new FakeUsers(opts.actors ?? { actor: { id: "actor", name: "Boss" } });
  // Capture each detached task's promise so the test can await the REAL work
  // (audit + emitNotification, both genuinely async) instead of guessing with a
  // setTimeout tick — emitNotification's internal async depth is unbounded, so a
  // single macrotask tick was an intermittent red under load.
  const pending: Promise<void>[] = [];
  const sink = createPeopleOpsEventSink({
    audit: audit as unknown as IAuditRepository,
    notify: { repos: { users, notifications } as any },
    employees: new FakeEmployees(opts.employees ?? {}) as any,
    runDetached: (task) => {
      pending.push(task());
    },
  });
  const settle = () => Promise.all(pending);
  return { sink, audit, notifications, settle };
}

describe("createPeopleOpsEventSink — audit + notify fan-out (#1824)", () => {
  it("writes an activity row AND notifies the added employee", async () => {
    const { sink, audit, notifications, settle } = buildSink({});
    sink.emit(ctx(), {
      kind: "employee_added",
      employeeId: "emp-1",
      recipientUserId: "user-jane",
      employeeName: "Jane Doe",
    });
    await settle();
    assert.equal(audit.activities.length, 1);
    assert.equal(audit.activities[0].action, "people_employee_added");
    assert.equal(audit.activities[0].entityType, "people_employee");
    assert.equal(audit.activities[0].entityId, "emp-1");
    assert.equal(audit.activities[0].userId, "actor");
    assert.equal(notifications.inserted.length, 1);
    assert.equal(notifications.inserted[0].userId, "user-jane");
    assert.equal(notifications.inserted[0].type, "people_roster_added");
  });

  it("audits a placeholder add but notifies nobody (no linked user)", async () => {
    const { sink, audit, notifications, settle } = buildSink({});
    sink.emit(ctx(), {
      kind: "employee_added",
      employeeId: "emp-1",
      recipientUserId: null,
      employeeName: "Contractor",
    });
    await settle();
    assert.equal(audit.activities.length, 1);
    assert.equal(notifications.inserted.length, 0);
  });

  it("removal is audit-only — never notifies", async () => {
    const { sink, audit, notifications, settle } = buildSink({});
    sink.emit(ctx(), { kind: "employee_removed", employeeId: "emp-1", employeeName: "Jane" });
    await settle();
    assert.equal(audit.activities.length, 1);
    assert.equal(audit.activities[0].action, "people_employee_removed");
    assert.equal(notifications.inserted.length, 0);
  });

  it("resolves 1:1 employee ids → user ids and notifies the participant", async () => {
    const { sink, audit, notifications, settle } = buildSink({
      employees: { "emp-sup": "actor", "emp-part": "user-part" },
    });
    sink.emit(ctx(), {
      kind: "one_on_one_scheduled",
      oneOnOneId: "oo-1",
      supervisorEmployeeId: "emp-sup",
      participantEmployeeId: "emp-part",
      scheduledDate: "2026-06-10T00:00:00.000Z",
    });
    await settle();
    assert.equal(audit.activities[0].action, "people_one_on_one_scheduled");
    // Supervisor resolves to the actor → self-filtered; only the participant is told.
    assert.equal(notifications.inserted.length, 1);
    assert.equal(notifications.inserted[0].userId, "user-part");
    assert.equal(notifications.inserted[0].type, "people_one_on_one_scheduled");
  });

  it("notifies every linked action-item assignee, deduped", async () => {
    const { sink, notifications, settle } = buildSink({
      employees: { "emp-a": "user-a", "emp-b": null, "emp-c": "user-a" },
    });
    sink.emit(ctx(), {
      kind: "action_items_assigned",
      oneOnOneId: "oo-1",
      assigneeEmployeeIds: ["emp-a", "emp-b", "emp-c"],
      count: 3,
    });
    await settle();
    // emp-b has no user; emp-a/emp-c resolve to the same user → one notification.
    assert.equal(notifications.inserted.length, 1);
    assert.equal(notifications.inserted[0].userId, "user-a");
  });
});
