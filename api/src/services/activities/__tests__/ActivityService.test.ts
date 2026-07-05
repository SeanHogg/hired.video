/**
 * ActivityService tests — the hire→work→pay loop (migration 0492).
 *
 * Focus on the money-critical paths: assignment authority, the
 * assigned→submitted→approved state machine, and that approval accrues the
 * CORRECT amount to the worker's payout ledger (fixed = amount; hourly =
 * hours × rate). Uses the project's buildFakeDb AST harness so predicates on
 * eq()/inArray() are evaluated for real.
 *
 * Run: node --import tsx --test src/services/activities/__tests__/ActivityService.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFakeDb } from "../../../handlers/__testing__/fake-db.js";
import { ActivityService } from "../ActivityService.js";
import { computeActivityEarnedCents } from "../../../../../shared/activities.js";

const WORKER = "worker-1";
const EMPLOYER = "employer-1";
const COMPANY = "company-1";
const OUTSIDER = "outsider-1";

function makeDb(seed: Record<string, any[]> = {}) {
  return buildFakeDb({
    users: [],
    company_profiles: [],
    user_company_role_associations: [],
    job_items: [],
    job_pipeline_entries: [],
    boards: [],
    tasks: [],
    task_time_entries: [],
    payout_ledger_entries: [],
    creator_profiles: [],
    ...seed,
  });
}

/** Seed an employer + company. Worker relationship varies per test. */
function seedBase(state: Record<string, any[]>) {
  state.users.push({ id: WORKER, name: "Wanda Worker", email: "wanda@ex.com", role: "job_seeker", isActive: true });
  state.users.push({ id: EMPLOYER, name: "Boss", email: "boss@acme.com", role: "employer", isActive: true });
  state.company_profiles.push({ id: COMPANY, name: "Acme" });
  state.user_company_role_associations.push({
    id: "ucra-er", userId: EMPLOYER, companyId: COMPANY, role: "employer", isActive: true,
  });
}

/** Make the worker an active employee so assignment is authorised. */
function makeWorkerEmployee(state: Record<string, any[]>) {
  state.user_company_role_associations.push({
    id: "ucra-emp", userId: WORKER, companyId: COMPANY, role: "employee", isActive: true,
  });
}

const svc = new ActivityService();

describe("ActivityService — pure earnings math", () => {
  it("fixed = amount, ignores tracked time", () => {
    assert.equal(computeActivityEarnedCents({ payType: "fixed", amountCents: 25000, trackedSec: 99999 }), 25000);
  });
  it("hourly = round(hours × rate)", () => {
    assert.equal(computeActivityEarnedCents({ payType: "hourly", rateCents: 5000, trackedSec: 3600 }), 5000);
    assert.equal(computeActivityEarnedCents({ payType: "hourly", rateCents: 6000, trackedSec: 1800 }), 3000);
    assert.equal(computeActivityEarnedCents({ payType: "hourly", rateCents: 5000, trackedSec: 0 }), 0);
  });
  it("never negative / handles nulls", () => {
    assert.equal(computeActivityEarnedCents({ payType: "hourly", rateCents: null, trackedSec: -5 }), 0);
    assert.equal(computeActivityEarnedCents({ payType: "fixed", amountCents: null }), 0);
  });
});

describe("ActivityService — assignment authority", () => {
  it("assigns a fixed activity to an employed worker", async () => {
    const { db, state } = makeDb();
    seedBase(state);
    makeWorkerEmployee(state);
    const dto = await svc.assign(EMPLOYER, {
      workerUserId: WORKER, companyId: COMPANY, title: "Edit the reel",
      payType: "fixed", amountCents: 12000,
    }, db);
    assert.equal(dto.status, "assigned");
    assert.equal(dto.payType, "fixed");
    assert.equal(dto.amountCents, 12000);
    assert.equal(dto.earnedCents, 12000);
    assert.equal(state.tasks.length, 1);
    assert.equal(state.tasks[0].userId, WORKER);
    assert.equal(state.tasks[0].assignedByUserId, EMPLOYER);
    assert.equal(state.tasks[0].activityStatus, "assigned");
  });

  it("assigns to a HIRED pipeline candidate even without an employee seat", async () => {
    const { db, state } = makeDb();
    seedBase(state);
    state.job_items.push({ id: "job-1", postedByUserId: EMPLOYER, companyId: COMPANY, title: "Editor" });
    state.job_pipeline_entries.push({
      id: "pe-1", jobId: "job-1", candidateUserId: WORKER, candidateName: "Wanda", stage: "hired",
    });
    const dto = await svc.assign(EMPLOYER, {
      workerUserId: WORKER, companyId: COMPANY, title: "First task", payType: "hourly", rateCents: 5000,
    }, db);
    assert.equal(dto.payType, "hourly");
    assert.equal(dto.rateCents, 5000);
    assert.equal(state.tasks.length, 1);
  });

  it("refuses to assign to someone neither hired nor employed", async () => {
    const { db, state } = makeDb();
    seedBase(state);
    await assert.rejects(
      () => svc.assign(EMPLOYER, { workerUserId: OUTSIDER, companyId: COMPANY, title: "x", payType: "fixed", amountCents: 100 }, db),
      /assign activities to people you've hired or employ/,
    );
  });

  it("rejects hourly without a positive rate and fixed without an amount", async () => {
    const { db, state } = makeDb();
    seedBase(state);
    makeWorkerEmployee(state);
    await assert.rejects(
      () => svc.assign(EMPLOYER, { workerUserId: WORKER, companyId: COMPANY, title: "x", payType: "hourly" }, db),
      /positive rate/,
    );
    await assert.rejects(
      () => svc.assign(EMPLOYER, { workerUserId: WORKER, companyId: COMPANY, title: "x", payType: "fixed" }, db),
      /positive amount/,
    );
  });
});

describe("ActivityService — submit → approve accrues payout", () => {
  it("fixed: approval credits the ledger with the full amount (idempotent)", async () => {
    const { db, state } = makeDb();
    seedBase(state);
    makeWorkerEmployee(state);
    const dto = await svc.assign(EMPLOYER, {
      workerUserId: WORKER, companyId: COMPANY, title: "Design a thumbnail", payType: "fixed", amountCents: 8000,
    }, db);
    await svc.submit(WORKER, dto.id, db);
    assert.equal(state.tasks[0].activityStatus, "submitted");

    const approved = await svc.approve(EMPLOYER, dto.id, db);
    assert.equal(approved.status, "approved");
    assert.equal(approved.earnedCents, 8000);
    const accruals = state.payout_ledger_entries.filter((e) => e.kind === "accrual");
    assert.equal(accruals.length, 1);
    assert.equal(accruals[0].userId, WORKER);
    assert.equal(accruals[0].amountCents, 8000);
    assert.equal(accruals[0].sourceKind, "task");
    assert.equal(accruals[0].sourceId, dto.id);

    // Re-approve is a no-op — no second ledger row.
    await svc.approve(EMPLOYER, dto.id, db);
    assert.equal(state.payout_ledger_entries.filter((e) => e.kind === "accrual").length, 1);
  });

  it("hourly: approval accrues hours × rate from tracked time", async () => {
    const { db, state } = makeDb();
    seedBase(state);
    makeWorkerEmployee(state);
    const dto = await svc.assign(EMPLOYER, {
      workerUserId: WORKER, companyId: COMPANY, title: "Cut promo", payType: "hourly", rateCents: 6000,
    }, db);
    // 90 minutes of closed time against the activity.
    state.task_time_entries.push({
      id: "tte-1", taskId: dto.id, userId: WORKER, companyId: COMPANY,
      startedAt: new Date(), endedAt: new Date(), durationSec: 5400, status: "closed", billable: true,
    });
    await svc.submit(WORKER, dto.id, db);
    const approved = await svc.approve(EMPLOYER, dto.id, db);
    // 1.5h × $60 = $90.00 → 9000¢
    assert.equal(approved.earnedCents, 9000);
    const accrual = state.payout_ledger_entries.find((e) => e.kind === "accrual");
    assert.equal(accrual?.amountCents, 9000);
  });

  it("a non-employer cannot approve someone else's activity", async () => {
    const { db, state } = makeDb();
    seedBase(state);
    makeWorkerEmployee(state);
    const dto = await svc.assign(EMPLOYER, {
      workerUserId: WORKER, companyId: COMPANY, title: "x", payType: "fixed", amountCents: 5000,
    }, db);
    await svc.submit(WORKER, dto.id, db);
    await assert.rejects(() => svc.approve(OUTSIDER, dto.id, db), /Not authorised|manage a company/);
  });
});
