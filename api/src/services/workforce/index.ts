/**
 * Workforce service (#1349 Phase 1+2).
 *
 * Owns the workforce aggregate:
 *   - punch in / out (task_time_entries)
 *   - timesheet submit / approve / reject (timesheets + timesheet_touchpoints)
 *   - employer roster + approval queue read models
 *
 * Tenant resolution: an employee's company is the row in
 * userCompanyRoleAssociations where role='employee' AND isActive=true.
 * Every mutation routes through `resolveEmployeeCompanyId` so an
 * off-boarded employee (UCRA isActive=false) can't keep punching.
 */

import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { ForbiddenError } from "../../middleware/errorHandler.js";

const {
  taskTimeEntries,
  timesheets,
  timesheetTouchpoints,
  userCompanyRoleAssociations,
  users,
} = schema;

// ---------------------------------------------------------------------------
// Tenant resolution
// ---------------------------------------------------------------------------

/** Resolve the company an employee belongs to. Returns null if the user
 *  is not an active employee in any company. The Phase 0 invite + accept
 *  flow guarantees a single active employee-UCRA per user, so we LIMIT 1. */
export async function resolveEmployeeCompanyId(
  userId: string,
  db = getDb(),
): Promise<string | null> {
  const [assoc] = await db
    .select({ companyId: userCompanyRoleAssociations.companyId })
    .from(userCompanyRoleAssociations)
    .where(and(
      eq(userCompanyRoleAssociations.userId, userId),
      eq(userCompanyRoleAssociations.role, "employee"),
      eq(userCompanyRoleAssociations.isActive, true),
    ))
    .limit(1);
  return assoc?.companyId ?? null;
}

/** Resolve the companies an employer can manage. An employer ↔ company
 *  link is also recorded via userCompanyRoleAssociations (role='employer').
 *  Most employers manage exactly one company; the API supports many. */
export async function resolveEmployerCompanyIds(
  userId: string,
  db = getDb(),
): Promise<string[]> {
  const rows = await db
    .select({ companyId: userCompanyRoleAssociations.companyId })
    .from(userCompanyRoleAssociations)
    .where(and(
      eq(userCompanyRoleAssociations.userId, userId),
      eq(userCompanyRoleAssociations.role, "employer"),
      eq(userCompanyRoleAssociations.isActive, true),
    ));
  return rows.map((r) => r.companyId);
}

// ---------------------------------------------------------------------------
// Phase 1 — time entries
// ---------------------------------------------------------------------------

export interface PunchInRequest {
  taskId?: string | null;
  notes?: string | null;
  billable?: boolean;
}

/** Open a new time entry for the employee. Refuses if there's already
 *  an active entry (the punch-state invariant — at most one open row
 *  per user). UI surfaces this as "you're already punched in to <task>". */
export async function punchIn(
  userId: string,
  req: PunchInRequest,
  db = getDb(),
) {
  const companyId = await resolveEmployeeCompanyId(userId, db);
  if (!companyId) {
    throw new ForbiddenError("Only active employees can punch in");
  }
  const active = await getActiveTimeEntry(userId, db);
  if (active) {
    throw new ForbiddenError("You're already punched in — punch out first");
  }
  const [row] = await db.insert(taskTimeEntries).values({
    taskId: req.taskId ?? null,
    userId,
    companyId,
    startedAt: new Date(),
    billable: req.billable ?? true,
    notes: req.notes ?? null,
    status: "open",
  } as any).returning();
  return row;
}

/** Close the user's active time entry. Idempotent: a no-op (return null)
 *  if nothing is open. Computes duration_sec from started_at..now. */
export async function punchOut(userId: string, db = getDb()) {
  const active = await getActiveTimeEntry(userId, db);
  if (!active) return null;
  const endedAt = new Date();
  const durationSec = Math.max(
    0,
    Math.floor((endedAt.getTime() - new Date(active.startedAt).getTime()) / 1000),
  );
  const [row] = await db.update(taskTimeEntries)
    .set({
      endedAt,
      durationSec,
      status: "closed",
      updatedAt: endedAt,
    } as any)
    .where(eq(taskTimeEntries.id, active.id))
    .returning();
  return row;
}

/** The unique open row for a user, or null if not punched in. */
export async function getActiveTimeEntry(userId: string, db = getDb()) {
  const [row] = await db.select().from(taskTimeEntries)
    .where(and(
      eq(taskTimeEntries.userId, userId),
      isNull(taskTimeEntries.endedAt),
    ))
    .limit(1);
  return row ?? null;
}

/** Entries in the week starting periodStart (Monday). End-exclusive. */
export async function getWeekEntries(
  userId: string,
  periodStart: string, // YYYY-MM-DD
  db = getDb(),
) {
  const start = new Date(`${periodStart}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return await db.select().from(taskTimeEntries)
    .where(and(
      eq(taskTimeEntries.userId, userId),
      gte(taskTimeEntries.startedAt, start),
      lt(taskTimeEntries.startedAt, end),
    ))
    .orderBy(taskTimeEntries.startedAt);
}

// ---------------------------------------------------------------------------
// Phase 2 — timesheets
// ---------------------------------------------------------------------------

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
  const closedEntries = entries.filter((e) => e.endedAt && e.status !== "submitted" && e.status !== "approved");
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

  // Link the included entries to the new timesheet so they're locked.
  for (const e of closedEntries) {
    await db.update(taskTimeEntries).set({
      timesheetId: timesheet!.id,
      status: "submitted",
      updatedAt: now,
    } as any).where(eq(taskTimeEntries.id, e.id));
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
      // drizzle's inArray works here; if employerCompanies is huge we'd
      // chunk. For typical agency size (<100 companies per employer) the
      // single query is fine.
      sql`${timesheets.companyId} = ANY(${employerCompanies}::uuid[])`,
    ))
    .orderBy(desc(timesheets.submittedAt));
}

/** Roster for the employer's Workforce settings tab — list of active
 *  employees in companies the employer manages, with their last-7-days
 *  punch totals. */
export async function getCompanyRoster(employerId: string, db = getDb()) {
  const employerCompanies = await resolveEmployerCompanyIds(employerId, db);
  if (employerCompanies.length === 0) return [];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  const rows = await db.select({
    userId: userCompanyRoleAssociations.userId,
    companyId: userCompanyRoleAssociations.companyId,
    employeeName: users.name,
    employeeEmail: users.email,
    isActive: userCompanyRoleAssociations.isActive,
    associationCreatedAt: userCompanyRoleAssociations.createdAt,
  })
    .from(userCompanyRoleAssociations)
    .innerJoin(users, eq(users.id, userCompanyRoleAssociations.userId))
    .where(and(
      eq(userCompanyRoleAssociations.role, "employee"),
      sql`${userCompanyRoleAssociations.companyId} = ANY(${employerCompanies}::uuid[])`,
    ));

  // Roll up last-7-days totals per employee. One query per employee
  // would be N+1; aggregate in one pass.
  const totalsByUser = new Map<string, number>();
  if (rows.length > 0) {
    const userIds = rows.map((r) => r.userId);
    const totals = await db.select({
      userId: taskTimeEntries.userId,
      totalSec: sql<number>`COALESCE(SUM(${taskTimeEntries.durationSec}), 0)::int`,
    })
      .from(taskTimeEntries)
      .where(and(
        sql`${taskTimeEntries.userId} = ANY(${userIds}::uuid[])`,
        gte(taskTimeEntries.startedAt, sevenDaysAgo),
      ))
      .groupBy(taskTimeEntries.userId);
    for (const t of totals) {
      totalsByUser.set(t.userId, Number(t.totalSec ?? 0));
    }
  }

  return rows.map((r) => ({
    ...r,
    last7DaysHours: ((totalsByUser.get(r.userId) ?? 0) / 3600).toFixed(2),
  }));
}
