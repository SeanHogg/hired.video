/**
 * Workforce service tests (#1349).
 *
 * Covers the punch → submit → approve → derivation pipeline and the
 * seat-billing reconciliation. Uses the project's `buildFakeDb` AST
 * harness so WHERE clauses are evaluated for real — a test passing
 * here proves the predicate matched, not just that the code ran.
 *
 * Tests for queries that rely on `ANY(...)` (getDeskMargin,
 * getCompanyApprovalQueue, getCompanyRoster) are deliberately partial
 * — the harness warns + falls through to match-all on `= ANY(...)`,
 * so we assert on output shape rather than predicate behaviour for
 * those reads. The mutation paths (punch, submit, approve, reject,
 * recalculate, doc-create) are fully covered.
 *
 * Run: node --import tsx --test src/services/workforce/__tests__/workforce.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFakeDb } from "../../../handlers/__testing__/fake-db.js";
import {
  recalculateWorkforceSeats,
  resolveEmployeeCompanyId,
  resolveEmployerCompanyIds,
  punchIn,
  punchOut,
  getActiveTimeEntry,
  getWeekEntries,
  submitTimesheet,
  approveTimesheet,
  rejectTimesheet,
  getEmployeeTimesheets,
  createPlacementDocument,
  attachDocumentFile,
  markDocumentSigned,
  getDocumentForCaller,
} from "../index.js";

function makeDb(seed: Record<string, any[]> = {}) {
  return buildFakeDb({
    users: [],
    user_company_role_associations: [],
    company_subscriptions: [],
    billing_events: [],
    task_time_entries: [],
    timesheets: [],
    timesheet_touchpoints: [],
    placements: [],
    placement_documents: [],
    invoices: [],
    invoice_line_items: [],
    payout_ledger_entries: [],
    creator_profiles: [],
    ...seed,
  });
}

const EMPLOYEE_ID = "employee-1";
const EMPLOYER_ID = "employer-1";
const COMPANY_ID = "company-1";

function seedEmployee(state: Record<string, any[]>) {
  state.users.push({
    id: EMPLOYEE_ID,
    name: "Jane Worker",
    email: "jane@example.com",
    role: "employee",
    isActive: true,
  });
  state.users.push({
    id: EMPLOYER_ID,
    name: "Boss Person",
    email: "boss@acme.com",
    role: "employer",
    isActive: true,
  });
  state.user_company_role_associations.push({
    id: "ucra-emp",
    userId: EMPLOYEE_ID,
    companyId: COMPANY_ID,
    role: "employee",
    isActive: true,
  });
  state.user_company_role_associations.push({
    id: "ucra-er",
    userId: EMPLOYER_ID,
    companyId: COMPANY_ID,
    role: "employer",
    isActive: true,
  });
}

// ─── Tenant resolution ──────────────────────────────────────────────────────

describe("workforce — tenant resolution", () => {
  it("resolveEmployeeCompanyId returns the active employee's companyId", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    const cid = await resolveEmployeeCompanyId(EMPLOYEE_ID, db);
    assert.equal(cid, COMPANY_ID);
  });

  it("resolveEmployeeCompanyId returns null for non-employees", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    const cid = await resolveEmployeeCompanyId(EMPLOYER_ID, db);
    assert.equal(cid, null);
  });

  it("resolveEmployeeCompanyId returns null when employment is deactivated", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    state.user_company_role_associations[0].isActive = false;
    const cid = await resolveEmployeeCompanyId(EMPLOYEE_ID, db);
    assert.equal(cid, null);
  });

  it("resolveEmployerCompanyIds returns the employer's workspaces", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    const ids = await resolveEmployerCompanyIds(EMPLOYER_ID, db);
    assert.deepEqual(ids, [COMPANY_ID]);
  });
});

// ─── Seat billing reconciliation (#1409) ────────────────────────────────────

describe("workforce — recalculateWorkforceSeats", () => {
  it("creates a workforce subscription row with $9.95 seat price when none exists", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    const result = await recalculateWorkforceSeats(COMPANY_ID, db);
    assert.equal(result.newSeatCount, 1);
    assert.equal(result.pricePerSeatCents, 995);
    assert.equal(result.totalMonthlyCents, 995);
    assert.equal(result.delta, 1);
    assert.equal(state.company_subscriptions.length, 1);
    assert.equal(state.company_subscriptions[0].seatCount, 1);
    assert.equal(state.company_subscriptions[0].pricePerSeatCents, 995);
  });

  it("preserves a custom negotiated price when updating seat count", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    state.company_subscriptions.push({
      id: "sub-1",
      companyId: COMPANY_ID,
      planTier: "enterprise",
      seatCount: 0,
      pricePerSeatCents: 2500, // Negotiated rate
      status: "active",
      billingInterval: "monthly",
    });
    const result = await recalculateWorkforceSeats(COMPANY_ID, db);
    assert.equal(result.pricePerSeatCents, 2500, "must NOT clobber negotiated price");
    assert.equal(result.newSeatCount, 1);
    assert.equal(state.company_subscriptions[0].pricePerSeatCents, 2500);
  });

  it("audits every reconcile to billing_events for the connector sync job", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    await recalculateWorkforceSeats(COMPANY_ID, db);
    assert.equal(state.billing_events.length, 1);
    assert.equal(state.billing_events[0].eventType, "workforce_seats_recalculated");
    const payload = state.billing_events[0].payload;
    assert.equal(payload.companyId, COMPANY_ID);
    assert.equal(payload.newSeatCount, 1);
    assert.equal(payload.previousSeatCount, 0);
    assert.equal(payload.delta, 1);
  });

  it("only counts active employee associations", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    // Add a deactivated UCRA — should NOT count.
    state.user_company_role_associations.push({
      id: "ucra-3",
      userId: "former-employee",
      companyId: COMPANY_ID,
      role: "employee",
      isActive: false,
    });
    // And one that's a recruiter, also shouldn't count.
    state.user_company_role_associations.push({
      id: "ucra-4",
      userId: "some-recruiter",
      companyId: COMPANY_ID,
      role: "recruiter",
      isActive: true,
    });
    const result = await recalculateWorkforceSeats(COMPANY_ID, db);
    assert.equal(result.newSeatCount, 1, "must only count active employee UCRAs");
  });
});

// ─── Punch state machine ────────────────────────────────────────────────────

describe("workforce — punch in/out", () => {
  it("punchIn refuses when the user isn't an active employee", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    state.user_company_role_associations[0].isActive = false;
    await assert.rejects(
      () => punchIn(EMPLOYEE_ID, {}, db),
      /Only active employees/,
    );
  });

  it("punchIn creates an open time entry with companyId resolved from UCRA", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    const row = await punchIn(EMPLOYEE_ID, { notes: "starting" }, db);
    assert.equal(row.userId, EMPLOYEE_ID);
    assert.equal(row.companyId, COMPANY_ID);
    assert.equal(row.status, "open");
    assert.equal(row.notes, "starting");
    assert.equal(row.billable, true);
    // endedAt is null in PG (omitted on insert → defaults NULL); fake-db
    // mirrors as undefined since the JS values object had no key.
    assert.ok(row.endedAt == null, "endedAt must be null/undefined for an open punch");
    assert.equal(state.task_time_entries.length, 1);
  });

  it("punchIn refuses double-punch when there's already an open entry", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    await punchIn(EMPLOYEE_ID, {}, db);
    await assert.rejects(
      () => punchIn(EMPLOYEE_ID, {}, db),
      /already punched in/,
    );
  });

  it("punchOut closes the active entry and computes a positive duration", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    // Seed an entry that started a minute ago so duration > 0.
    state.task_time_entries.push({
      id: "tte-1",
      taskId: null,
      userId: EMPLOYEE_ID,
      companyId: COMPANY_ID,
      startedAt: new Date(Date.now() - 60_000),
      endedAt: null,
      durationSec: null,
      billable: true,
      notes: null,
      status: "open",
      timesheetId: null,
    });
    const closed = await punchOut(EMPLOYEE_ID, db);
    assert.ok(closed);
    assert.ok(closed!.endedAt);
    assert.equal(closed!.status, "closed");
    assert.ok((closed!.durationSec ?? 0) >= 50, "duration should reflect ~60s elapsed");
  });

  it("punchOut is a no-op when nothing is open", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    const result = await punchOut(EMPLOYEE_ID, db);
    assert.equal(result, null);
  });

  it("getActiveTimeEntry returns null when nothing is open", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    const active = await getActiveTimeEntry(EMPLOYEE_ID, db);
    assert.equal(active, null);
  });
});

// ─── Weekly aggregation + submit/approve/reject ─────────────────────────────

describe("workforce — timesheet lifecycle", () => {
  /** Seed three closed entries totalling 6h on Mon 2026-05-25 (the period start). */
  function seedClosedWeek(state: Record<string, any[]>, periodStart = "2026-05-25") {
    seedEmployee(state);
    const periodStartDate = new Date(`${periodStart}T00:00:00.000Z`);
    const dayMs = 24 * 60 * 60 * 1000;
    [
      { id: "tte-mon", offset: 0, billable: true, hours: 2 },
      { id: "tte-tue", offset: 1 * dayMs, billable: true, hours: 3 },
      { id: "tte-wed", offset: 2 * dayMs, billable: false, hours: 1 },
    ].forEach((entry) => {
      const startedAt = new Date(periodStartDate.getTime() + entry.offset);
      const endedAt = new Date(startedAt.getTime() + entry.hours * 3600 * 1000);
      state.task_time_entries.push({
        id: entry.id,
        taskId: null,
        userId: EMPLOYEE_ID,
        companyId: COMPANY_ID,
        startedAt,
        endedAt,
        durationSec: entry.hours * 3600,
        billable: entry.billable,
        notes: null,
        status: "closed",
        timesheetId: null,
      });
    });
  }

  it("submitTimesheet aggregates billable + total hours and freezes a snapshot", async () => {
    const { db, state } = makeDb();
    seedClosedWeek(state);
    const ts = await submitTimesheet(EMPLOYEE_ID, "2026-05-25", db);
    assert.equal(ts!.status, "submitted");
    assert.equal(ts!.totalHours, "6.00");
    assert.equal(ts!.totalBillableHours, "5.00");
    assert.ok(Array.isArray(ts!.snapshot));
    assert.equal((ts!.snapshot as any[]).length, 3, "snapshot freezes all closed entries");
    // Entries should be marked submitted + linked to the timesheet.
    for (const e of state.task_time_entries) {
      assert.equal(e.status, "submitted");
      assert.equal(e.timesheetId, ts!.id);
    }
    // Touchpoint audit row.
    assert.equal(state.timesheet_touchpoints.length, 1);
    assert.equal(state.timesheet_touchpoints[0].type, "submitted");
  });

  it("submitTimesheet rejects an empty week", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    await assert.rejects(
      () => submitTimesheet(EMPLOYEE_ID, "2026-05-25", db),
      /No closed entries/,
    );
  });

  it("rejectTimesheet flips status back to draft on the entries (unlocks for re-submit)", async () => {
    const { db, state } = makeDb();
    seedClosedWeek(state);
    const ts = await submitTimesheet(EMPLOYEE_ID, "2026-05-25", db);
    const rejected = await rejectTimesheet(ts!.id, EMPLOYER_ID, "Bad notes — please re-submit", db);
    assert.equal(rejected!.status, "rejected");
    assert.equal(rejected!.rejectionReason, "Bad notes — please re-submit");
    for (const e of state.task_time_entries) {
      assert.equal(e.status, "closed", "entries returned to closed (re-submittable)");
      assert.equal(e.timesheetId, null, "entries no longer linked to the rejected timesheet");
    }
    // Touchpoints: submitted + rejected.
    const types = state.timesheet_touchpoints.map((tp: any) => tp.type);
    assert.ok(types.includes("submitted"));
    assert.ok(types.includes("rejected"));
  });

  it("rejectTimesheet refuses for a non-employer caller", async () => {
    const { db, state } = makeDb();
    seedClosedWeek(state);
    const ts = await submitTimesheet(EMPLOYEE_ID, "2026-05-25", db);
    await assert.rejects(
      () => rejectTimesheet(ts!.id, "random-user", "nope", db),
      /Only an active employer/,
    );
  });

  it("approveTimesheet rejects a timesheet that's already approved", async () => {
    const { db, state } = makeDb();
    seedClosedWeek(state);
    const ts = await submitTimesheet(EMPLOYEE_ID, "2026-05-25", db);
    await approveTimesheet(ts!.id, EMPLOYER_ID, db);
    await assert.rejects(
      () => approveTimesheet(ts!.id, EMPLOYER_ID, db),
      /Cannot approve a timesheet in state 'approved'/,
    );
  });

  it("approveTimesheet with NO matching placement still succeeds + logs derivation_skipped", async () => {
    const { db, state } = makeDb();
    seedClosedWeek(state);
    const ts = await submitTimesheet(EMPLOYEE_ID, "2026-05-25", db);
    const approved = await approveTimesheet(ts!.id, EMPLOYER_ID, db);
    assert.equal(approved!.status, "approved");
    // No placement → no invoice / payout / billing_events derivation row.
    assert.equal(state.invoices.length, 0);
    assert.equal(state.invoice_line_items.length, 0);
    assert.equal(state.payout_ledger_entries.length, 0);
    const tpTypes = state.timesheet_touchpoints.map((tp: any) => tp.type);
    assert.ok(tpTypes.includes("derivation_skipped"));
  });

  it("approveTimesheet with a placement creates invoice + line item + billing_events", async () => {
    const { db, state } = makeDb();
    seedClosedWeek(state);
    // Active placement with rates.
    state.placements.push({
      id: "placement-1",
      recruiterId: EMPLOYER_ID,
      candidateId: EMPLOYEE_ID,
      candidateName: "Jane Worker",
      recruiterName: "Boss Person",
      companyId: "client-co-1",
      status: "active",
      placementKind: "contract",
      billRateHourly: "100.00",
      payRateHourly: "70.00",
      currency: "USD",
      createdAt: new Date(),
    });
    const ts = await submitTimesheet(EMPLOYEE_ID, "2026-05-25", db);
    const approved = await approveTimesheet(ts!.id, EMPLOYER_ID, db);
    assert.equal(approved!.status, "approved");
    // Invoice + line item for 5h billable × $100/h = $500.00
    assert.equal(state.invoices.length, 1);
    assert.equal(state.invoices[0].total, "500.00");
    assert.equal(state.invoices[0].currency, "USD");
    assert.equal(state.invoice_line_items.length, 1);
    // Payout ledger: 6h × $70/h = $420.00 = 42000¢
    assert.equal(state.payout_ledger_entries.length, 1);
    assert.equal(state.payout_ledger_entries[0].amountCents, 42000);
    assert.equal(state.payout_ledger_entries[0].sourceKind, "timesheet");
    assert.equal(state.payout_ledger_entries[0].sourceId, ts!.id);
    // Audit trail.
    const derived = state.billing_events.find((e: any) => e.eventType === "workforce_timesheet_derived");
    assert.ok(derived, "billing_events must contain the derivation audit row");
    assert.equal(derived!.payload.placementId, "placement-1");
    assert.equal(derived!.payload.billableHours, 5);
    assert.equal(derived!.payload.totalHours, 6);
    // Touchpoints include billing_derived.
    const tpTypes = state.timesheet_touchpoints.map((tp: any) => tp.type);
    assert.ok(tpTypes.includes("billing_derived"));
  });

  it("approveTimesheet with a placement missing rates logs derivation_skipped reason", async () => {
    const { db, state } = makeDb();
    seedClosedWeek(state);
    state.placements.push({
      id: "placement-2",
      recruiterId: EMPLOYER_ID,
      candidateId: EMPLOYEE_ID,
      candidateName: "Jane",
      recruiterName: "Boss",
      companyId: "client-co-1",
      status: "active",
      placementKind: "direct_hire",
      billRateHourly: null,
      payRateHourly: null,
      currency: "USD",
      createdAt: new Date(),
    });
    const ts = await submitTimesheet(EMPLOYEE_ID, "2026-05-25", db);
    await approveTimesheet(ts!.id, EMPLOYER_ID, db);
    assert.equal(state.invoices.length, 0);
    assert.equal(state.payout_ledger_entries.length, 0);
    const skipTp = state.timesheet_touchpoints.find((tp: any) => tp.type === "derivation_skipped");
    assert.ok(skipTp);
    assert.equal(skipTp!.payload.reason, "placement_missing_rates");
  });

  it("getEmployeeTimesheets returns the employee's own submissions", async () => {
    const { db, state } = makeDb();
    seedClosedWeek(state);
    await submitTimesheet(EMPLOYEE_ID, "2026-05-25", db);
    const list = await getEmployeeTimesheets(EMPLOYEE_ID, db);
    assert.equal(list.length, 1);
    assert.equal(list[0].userId, EMPLOYEE_ID);
  });

  it("getWeekEntries returns only entries within the [periodStart, +7d) window", async () => {
    const { db, state } = makeDb();
    seedClosedWeek(state);
    // Add one entry the previous week — should NOT appear.
    state.task_time_entries.push({
      id: "tte-prev",
      taskId: null,
      userId: EMPLOYEE_ID,
      companyId: COMPANY_ID,
      startedAt: new Date("2026-05-18T10:00:00.000Z"),
      endedAt: new Date("2026-05-18T12:00:00.000Z"),
      durationSec: 7200,
      billable: true,
      notes: null,
      status: "closed",
      timesheetId: null,
    });
    const entries = await getWeekEntries(EMPLOYEE_ID, "2026-05-25", db);
    assert.equal(entries.length, 3, "previous-week entry must be excluded");
  });
});

// ─── Doc vault (#1421) ──────────────────────────────────────────────────────

describe("workforce — placement documents", () => {
  it("createPlacementDocument refuses when caller has no employer scope", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    await assert.rejects(
      () => createPlacementDocument("random-user", { companyId: COMPANY_ID, kind: "i9" }, db),
      /Not an employer in this workspace/,
    );
  });

  it("createPlacementDocument allows the employer scoped to the workspace", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    const doc = await createPlacementDocument(EMPLOYER_ID, {
      companyId: COMPANY_ID,
      kind: "i9",
    }, db);
    assert.equal(doc.kind, "i9");
    assert.equal(doc.companyId, COMPANY_ID);
    assert.equal(doc.status, "pending");
  });

  it("createPlacementDocument with signedAt set marks the doc 'signed'", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    const doc = await createPlacementDocument(EMPLOYER_ID, {
      companyId: COMPANY_ID,
      kind: "w9",
      signedAt: new Date(),
    }, db);
    assert.equal(doc.status, "signed");
  });

  it("createPlacementDocument requires either companyId or placementId", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    await assert.rejects(
      () => createPlacementDocument(EMPLOYER_ID, { kind: "i9" }, db),
      /companyId or placementId is required/,
    );
  });
});

// ─── Doc upload + sign lifecycle (#1442) ────────────────────────────────────

describe("workforce — document upload + sign lifecycle", () => {
  it("attachDocumentFile stamps file_path + metadata on the row", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    const doc = await createPlacementDocument(EMPLOYER_ID, {
      companyId: COMPANY_ID,
      kind: "i9",
    }, db);
    const updated = await attachDocumentFile(
      EMPLOYER_ID,
      doc.id,
      "workforce/docs/co/i9-1.pdf",
      "application/pdf",
      db,
    );
    assert.equal(updated!.filePath, "workforce/docs/co/i9-1.pdf");
    // metadata is a JSONB merge — actual content depends on fake-db SQL eval,
    // but the row update should have run (timestamp changed).
    assert.ok(updated!.updatedAt instanceof Date || typeof updated!.updatedAt === "string");
  });

  it("attachDocumentFile refuses for an unrelated caller", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    const doc = await createPlacementDocument(EMPLOYER_ID, {
      companyId: COMPANY_ID,
      kind: "w9",
    }, db);
    await assert.rejects(
      () => attachDocumentFile("random-user", doc.id, "key", "application/pdf", db),
      /Not authorised/,
    );
  });

  it("markDocumentSigned flips status + sets signedAt", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    const doc = await createPlacementDocument(EMPLOYER_ID, {
      companyId: COMPANY_ID,
      kind: "i9",
    }, db);
    assert.equal(doc.status, "pending");
    const signed = await markDocumentSigned(EMPLOYER_ID, doc.id, null, db);
    assert.equal(signed!.status, "signed");
    assert.ok(signed!.signedAt, "signedAt must be set");
  });

  it("getDocumentForCaller returns the doc for an authorised employer", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    const created = await createPlacementDocument(EMPLOYER_ID, {
      companyId: COMPANY_ID,
      kind: "coi",
    }, db);
    const doc = await getDocumentForCaller(EMPLOYER_ID, created.id, db);
    assert.equal(doc.id, created.id);
  });
});

// ─── Seat reconciliation deltas + idempotency on re-approve ─────────────────

describe("workforce — derivation idempotency", () => {
  function seedActivePlacement(state: Record<string, any[]>) {
    state.placements.push({
      id: "p-idemp",
      recruiterId: EMPLOYER_ID,
      candidateId: EMPLOYEE_ID,
      candidateName: "Jane",
      recruiterName: "Boss",
      companyId: "client-co-1",
      status: "active",
      placementKind: "contract",
      billRateHourly: "100.00",
      payRateHourly: "70.00",
      currency: "USD",
      createdAt: new Date(),
    });
  }

  it("approveTimesheet → derivation row written; second approve attempt is rejected (state guard)", async () => {
    const { db, state } = makeDb();
    seedEmployee(state);
    seedActivePlacement(state);
    // Seed one closed entry directly.
    state.task_time_entries.push({
      id: "tte-1",
      taskId: null,
      userId: EMPLOYEE_ID,
      companyId: COMPANY_ID,
      startedAt: new Date("2026-05-25T09:00:00Z"),
      endedAt: new Date("2026-05-25T14:00:00Z"),
      durationSec: 5 * 3600,
      billable: true,
      notes: null,
      status: "closed",
      timesheetId: null,
    });
    const ts = await submitTimesheet(EMPLOYEE_ID, "2026-05-25", db);
    await approveTimesheet(ts!.id, EMPLOYER_ID, db);
    // First approve created the invoice + payout.
    assert.equal(state.invoices.length, 1);
    assert.equal(state.payout_ledger_entries.length, 1);
    // State guard refuses a second approval, so no double-billing happens.
    await assert.rejects(
      () => approveTimesheet(ts!.id, EMPLOYER_ID, db),
      /Cannot approve a timesheet in state 'approved'/,
    );
    assert.equal(state.invoices.length, 1);
    assert.equal(state.payout_ledger_entries.length, 1);
  });
});
