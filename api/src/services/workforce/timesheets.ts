/** Workforce Phase 2 — timesheet submit / approve / reject + read models. */

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { ForbiddenError } from "../../middleware/errorHandler.js";
import { resolveEmployeeCompanyId, resolveEmployerCompanyIds } from "./tenancy.js";
import { getWeekEntries } from "./time-entries.js";
import { deriveWorkforceBillingAndPayout } from "./timesheet-derivation.js";

const { taskTimeEntries, timesheets, timesheetTouchpoints, users } = schema;

/** Submit a weekly timesheet. Aggregates SUM(duration_sec) for closed
 *  entries in the period, freezes a snapshot, marks the entries
 *  submitted (linking them to the new timesheet row). Re-submission
 *  of a rejected week reuses the existing row + flips status back to
 *  'submitted' (status machine: draft → submitted → approved | rejected
 *  → submitted | …). */
export async function submitTimesheet(
  userId: string,
  periodStart: string,
  db = getDb(),
) {
  const companyId = await resolveEmployeeCompanyId(userId, db);
  if (!companyId) throw new ForbiddenError("Only active employees can submit timesheets");

  const periodStartDate = periodStart;
  const periodEndDateObj = new Date(`${periodStart}T00:00:00.000Z`);
  periodEndDateObj.setUTCDate(periodEndDateObj.getUTCDate() + 6);
  const periodEnd = periodEndDateObj.toISOString().slice(0, 10);

  const entries = await getWeekEntries(userId, periodStart, db);
  // Paid activities (tasks.pay_type set) are paid per-activity on approval via
  // ActivityService, NOT through the weekly timesheet. Exclude their entries so
  // a person who is both an employee and an activity worker is never
  // double-paid (once here, once on activity approval).
  const { filterOutActivityTaskIds } = await import("../activities/ActivityService.js");
  const activityTaskIds = await filterOutActivityTaskIds(entries.map((e) => e.taskId), db);
  const closedEntries = entries.filter(
    (e) =>
      e.endedAt &&
      e.status !== "submitted" &&
      e.status !== "approved" &&
      !(e.taskId && activityTaskIds.has(e.taskId)),
  );
  if (closedEntries.length === 0) {
    throw new ForbiddenError("No closed entries to submit for this week");
  }

  const totalSec = closedEntries.reduce((sum, e) => sum + (e.durationSec ?? 0), 0);
  const billableSec = closedEntries
    .filter((e) => e.billable)
    .reduce((sum, e) => sum + (e.durationSec ?? 0), 0);
  const totalHours = (totalSec / 3600).toFixed(2);
  const totalBillableHours = (billableSec / 3600).toFixed(2);

  const snapshot = closedEntries.map((e) => ({
    id: e.id,
    taskId: e.taskId,
    startedAt: e.startedAt,
    endedAt: e.endedAt,
    durationSec: e.durationSec,
    billable: e.billable,
    notes: e.notes,
  }));

  // Upsert the timesheet row.
  const [existing] = await db.select().from(timesheets)
    .where(and(
      eq(timesheets.userId, userId),
      eq(timesheets.companyId, companyId),
      eq(timesheets.periodStart, periodStartDate),
    ))
    .limit(1);

  let timesheet;
  const now = new Date();
  if (existing) {
    [timesheet] = await db.update(timesheets).set({
      status: "submitted",
      submittedAt: now,
      approvedAt: null,
      approverId: null,
      rejectionReason: null,
      totalHours,
      totalBillableHours,
      snapshot,
      updatedAt: now,
    } as any).where(eq(timesheets.id, existing.id)).returning();
  } else {
    [timesheet] = await db.insert(timesheets).values({
      userId,
      companyId,
      periodStart: periodStartDate,
      periodEnd,
      status: "submitted",
      submittedAt: now,
      totalHours,
      totalBillableHours,
      snapshot,
    } as any).returning();
  }

  // Link the included entries to the new timesheet so they're locked —
  // ONE inArray UPDATE (was one UPDATE per entry).
  if (closedEntries.length > 0) {
    await db.update(taskTimeEntries).set({
      timesheetId: timesheet!.id,
      status: "submitted",
      updatedAt: now,
    }).where(inArray(taskTimeEntries.id, closedEntries.map((e) => e.id)));
  }

  await db.insert(timesheetTouchpoints).values({
    timesheetId: timesheet!.id,
    type: "submitted",
    payload: { totalHours, totalBillableHours, entryCount: closedEntries.length },
    performedByUserId: userId,
  } as any);

  return timesheet;
}

async function assertEmployerCanApprove(
  approverId: string,
  companyId: string,
  db = getDb(),
) {
  const employerCompanies = await resolveEmployerCompanyIds(approverId, db);
  if (!employerCompanies.includes(companyId)) {
    throw new ForbiddenError("Only an active employer in this company can approve timesheets");
  }
}

export async function approveTimesheet(
  timesheetId: string,
  approverId: string,
  db = getDb(),
) {
  const [ts] = await db.select().from(timesheets)
    .where(eq(timesheets.id, timesheetId)).limit(1);
  if (!ts) throw new ForbiddenError("Timesheet not found");
  if (ts.status !== "submitted") {
    throw new ForbiddenError(`Cannot approve a timesheet in state '${ts.status}'`);
  }
  await assertEmployerCanApprove(approverId, ts.companyId, db);
  const now = new Date();
  const [updated] = await db.update(timesheets).set({
    status: "approved",
    approvedAt: now,
    approverId,
    updatedAt: now,
  } as any).where(eq(timesheets.id, timesheetId)).returning();
  await db.update(taskTimeEntries).set({
    status: "approved",
    updatedAt: now,
  } as any).where(eq(taskTimeEntries.timesheetId, timesheetId));
  await db.insert(timesheetTouchpoints).values({
    timesheetId,
    type: "approved",
    performedByUserId: approverId,
  } as any);

  // Phase 3 derivation (#1420). Fan out to invoice + payout. Each
  // sub-function is idempotent (PayoutLedgerService.recordAccrual is
  // idempotent by (sourceKind, sourceId); deriveWorkforceInvoicing
  // checks for an existing invoice tied to this timesheet's snapshot)
  // so re-running approve in a reject → re-submit → re-approve cycle
  // doesn't double-charge.
  const derivation = await deriveWorkforceBillingAndPayout(updated!, approverId, db);
  if (derivation.touchpointType) {
    await db.insert(timesheetTouchpoints).values({
      timesheetId,
      type: derivation.touchpointType,
      payload: derivation.payload,
      performedByUserId: approverId,
    } as any);
  }

  return updated;
}

export async function rejectTimesheet(
  timesheetId: string,
  approverId: string,
  reason: string,
  db = getDb(),
) {
  const [ts] = await db.select().from(timesheets)
    .where(eq(timesheets.id, timesheetId)).limit(1);
  if (!ts) throw new ForbiddenError("Timesheet not found");
  if (ts.status !== "submitted") {
    throw new ForbiddenError(`Cannot reject a timesheet in state '${ts.status}'`);
  }
  await assertEmployerCanApprove(approverId, ts.companyId, db);
  const now = new Date();
  const [updated] = await db.update(timesheets).set({
    status: "rejected",
    approverId,
    rejectionReason: reason,
    updatedAt: now,
  } as any).where(eq(timesheets.id, timesheetId)).returning();
  // Unlock the entries so the employee can edit + re-submit.
  await db.update(taskTimeEntries).set({
    status: "closed",
    timesheetId: null,
    updatedAt: now,
  } as any).where(eq(taskTimeEntries.timesheetId, timesheetId));
  await db.insert(timesheetTouchpoints).values({
    timesheetId,
    type: "rejected",
    payload: { reason },
    performedByUserId: approverId,
  } as any);
  return updated;
}

/** List the employee's own timesheets, newest first. */
export async function getEmployeeTimesheets(userId: string, db = getDb()) {
  return await db.select().from(timesheets)
    .where(eq(timesheets.userId, userId))
    .orderBy(desc(timesheets.periodStart));
}

/** Approval queue for an employer: all submitted timesheets across the
 *  employer's workforce. Newest first. */
export async function getCompanyApprovalQueue(
  approverId: string,
  db = getDb(),
) {
  const employerCompanies = await resolveEmployerCompanyIds(approverId, db);
  if (employerCompanies.length === 0) return [];
  return await db.select({
    timesheet: timesheets,
    employeeName: users.name,
    employeeEmail: users.email,
  })
    .from(timesheets)
    .innerJoin(users, eq(users.id, timesheets.userId))
    .where(and(
      eq(timesheets.status, "submitted"),
      // Drizzle's inArray covers typical agency size (<100 companies
      // per employer) in one query; chunk only if we ever see >1k rows.
      inArray(timesheets.companyId, employerCompanies),
    ))
    .orderBy(desc(timesheets.submittedAt));
}
