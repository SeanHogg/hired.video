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
  companySubscriptions,
  billingEvents,
  invoices,
  invoiceLineItems,
  payoutLedgerEntries,
  placements,
  placementDocuments,
} = schema;

/** Universal seat price per `[[project_pricing_seats]]` — $9.95/mo.
 *  The 4900¢ default on companySubscriptions.pricePerSeatCents is stale
 *  (still 49 $) and tracked under that memory; workforce rows always
 *  stamp the correct 995¢ at create time. */
const WORKFORCE_SEAT_PRICE_CENTS = 995;

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

// ---------------------------------------------------------------------------
// Seat billing (#1409) — workforce seat reconciliation
//
// Each active employee in an employer's workspace is one $9.95/mo seat.
// `recalculateWorkforceSeats` is the single SSoT for seat-count → billing
// reconciliation; both invite-accept and employee-deactivate route through it
// so the company_subscriptions.seat_count stays in sync with the live UCRA
// table. Provider-side sync (calling Helcim to update the subscription
// charge amount) is deferred — see sub-gap noted in #1409.
// ---------------------------------------------------------------------------

export interface RecalculateSeatsResult {
  companyId: string;
  previousSeatCount: number;
  newSeatCount: number;
  pricePerSeatCents: number;
  totalMonthlyCents: number;
  delta: number;
}

export async function recalculateWorkforceSeats(
  companyId: string,
  db = getDb(),
): Promise<RecalculateSeatsResult> {
  // 1. Count active employees in the workspace — the canonical seat count.
  const activeEmployees = await db
    .select({ userId: userCompanyRoleAssociations.userId })
    .from(userCompanyRoleAssociations)
    .where(and(
      eq(userCompanyRoleAssociations.companyId, companyId),
      eq(userCompanyRoleAssociations.role, "employee"),
      eq(userCompanyRoleAssociations.isActive, true),
    ));
  const newSeatCount = activeEmployees.length;

  // 2. Upsert the companySubscriptions row. Workforce billing rides on the
  //    same per-company subscription as other team features — if the row
  //    doesn't exist (employer never bought anything else), create one
  //    stamped with the workforce seat price.
  const [existing] = await db.select().from(companySubscriptions)
    .where(eq(companySubscriptions.companyId, companyId))
    .limit(1);

  let previousSeatCount = 0;
  let row;
  const now = new Date();
  if (existing) {
    previousSeatCount = existing.seatCount;
    [row] = await db.update(companySubscriptions).set({
      seatCount: newSeatCount,
      // Don't clobber a custom price the employer negotiated; only stamp
      // the workforce default when there's nothing set yet.
      pricePerSeatCents: existing.pricePerSeatCents > 0
        ? existing.pricePerSeatCents
        : WORKFORCE_SEAT_PRICE_CENTS,
      updatedAt: now,
    } as any).where(eq(companySubscriptions.id, existing.id)).returning();
  } else {
    [row] = await db.insert(companySubscriptions).values({
      companyId,
      planTier: "workforce",
      seatCount: newSeatCount,
      pricePerSeatCents: WORKFORCE_SEAT_PRICE_CENTS,
      status: "active",
      billingInterval: "monthly",
    } as any).returning();
  }

  // 3. Audit trail. The Helcim sync job consumes this stream to push the
  //    new charge amount to the provider on the next billing cycle.
  const delta = newSeatCount - previousSeatCount;
  await db.insert(billingEvents).values({
    eventType: "workforce_seats_recalculated",
    payload: {
      companyId,
      previousSeatCount,
      newSeatCount,
      pricePerSeatCents: row!.pricePerSeatCents,
      totalMonthlyCents: newSeatCount * row!.pricePerSeatCents,
      delta,
      at: now.toISOString(),
    },
  } as any);

  return {
    companyId,
    previousSeatCount,
    newSeatCount,
    pricePerSeatCents: row!.pricePerSeatCents,
    totalMonthlyCents: newSeatCount * row!.pricePerSeatCents,
    delta,
  };
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

/** Phase 3 derivation — timesheet → invoice line item + payout-ledger
 *  accrual via the linked placement's bill/pay rates. Skips both if no
 *  active placement matches, or if the placement is missing rate fields.
 *  Returns the derivation summary for audit + UI consumption.
 *
 *  Money rails policy (#1349): we generate the invoice + payout LOCALLY
 *  and emit a billingEvents row. Outbound provider push (QBO / Xero /
 *  Gusto / Helcim) happens via `services/sync/connectors/*` adapters
 *  that consume the billingEvents stream. */
async function deriveWorkforceBillingAndPayout(
  ts: typeof timesheets.$inferSelect,
  performedByUserId: string,
  db = getDb(),
): Promise<{
  touchpointType: string | null;
  payload: Record<string, unknown>;
  invoiceId?: string;
  payoutEntryId?: string;
}> {
  // Locate the active placement that ties this employee to a client.
  // `placements.candidateId` is the placed worker; we ignore status='ended'
  // / cancelled rows. Multiple active placements for the same candidate
  // (rare — one employee on parallel engagements) pick the most recent.
  const [placement] = await db.select().from(placements)
    .where(and(
      eq(placements.candidateId, ts.userId),
      sql`${placements.status} NOT IN ('cancelled', 'ended', 'terminated')`,
    ))
    .orderBy(desc(placements.createdAt))
    .limit(1);

  if (!placement) {
    return {
      touchpointType: "derivation_skipped",
      payload: { reason: "no_active_placement_for_candidate" },
    };
  }

  const billRate = Number(placement.billRateHourly ?? 0);
  const payRate = Number(placement.payRateHourly ?? 0);
  const totalHours = Number(ts.totalHours ?? 0);
  const billableHours = Number(ts.totalBillableHours ?? 0);

  if (billRate <= 0 && payRate <= 0) {
    return {
      touchpointType: "derivation_skipped",
      payload: {
        reason: "placement_missing_rates",
        placementId: placement.id,
        placementKind: placement.placementKind,
      },
    };
  }

  let invoiceId: string | undefined;
  let payoutEntryId: string | undefined;

  // --- Invoice line item -----------------------------------------------------
  if (billRate > 0 && billableHours > 0) {
    const invoiceTotal = (billableHours * billRate).toFixed(2);
    const currency = placement.currency ?? "USD";
    const description =
      `Workforce time — ${placement.candidateName || "Employee"} · ` +
      `week of ${ts.periodStart} · ${billableHours.toFixed(2)}h @ ${currency} ${billRate.toFixed(2)}/h`;

    // Idempotency: invoices.sourceTimesheetId is unique (#1439) so a
    // reject → re-approve cycle locates the existing invoice instead of
    // creating a second one for the same week.
    const [existing] = await db.select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.sourceTimesheetId, ts.id))
      .limit(1);

    if (existing) {
      invoiceId = existing.id;
    } else {
      const [inv] = await db.insert(invoices).values({
        userId: placement.recruiterId,
        // recipientCompanyId is the *client* being billed — the agency
        // (workforce.companyId on the timesheet) does the billing; the
        // CLIENT pays. placement.companyId is canonical for the client.
        recipientCompanyId: placement.companyId,
        sourceTimesheetId: ts.id,
        status: "draft",
        total: invoiceTotal,
        currency,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      } as any).returning({ id: invoices.id });
      invoiceId = inv!.id;
      await db.insert(invoiceLineItems).values({
        invoiceId,
        description,
        quantity: Math.round(billableHours),
        unitPrice: billRate.toFixed(2),
        amount: invoiceTotal,
      } as any);
    }
  }

  // --- Payout ledger accrual -------------------------------------------------
  if (payRate > 0 && totalHours > 0) {
    // Defer to PayoutLedgerService which already implements the
    // (sourceKind, sourceId) idempotency contract. Import dynamically
    // to avoid a circular service graph.
    const payoutCents = Math.round(totalHours * payRate * 100);
    if (payoutCents > 0) {
      const { PayoutLedgerService } = await import("../payout/PayoutLedgerService.js");
      const ledger = new PayoutLedgerService();
      const accrual = await ledger.recordAccrual({
        userId: ts.userId,
        amountCents: payoutCents,
        currency: placement.currency ?? "USD",
        sourceKind: "timesheet",
        sourceId: ts.id,
        note: `Workforce hours — week of ${ts.periodStart}`,
        db,
      });
      payoutEntryId = accrual.entryId;
    }
  }

  // Outbound push to the configured accounting connector. Default is
  // Helcim (we already use it for payments); employers can override via
  // company-side integration config in a future pass. Connector failures
  // are NON-fatal — the local invoice + payout rows are the SSoT; the
  // connector retry queue (see #1349 sub-gap) is responsible for
  // backing off + replaying.
  const providerName = (typeof process !== "undefined" && process.env?.WORKFORCE_BILLING_PROVIDER) || "helcim";
  let connectorResult: { invoice?: unknown; payout?: unknown } = {};
  try {
    const { getAccountingConnector } = await import("./connectors/index.js");
    const connector = getAccountingConnector(providerName);
    if (invoiceId) {
      connectorResult.invoice = await connector.pushInvoice({
        invoiceId,
        recruiterId: placement.recruiterId,
        recipientCompanyId: placement.companyId ?? null,
        currency: placement.currency ?? "USD",
        total: (billableHours * billRate).toFixed(2),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        lineItems: [{
          description: `Workforce time — week of ${ts.periodStart}`,
          quantity: Math.round(billableHours),
          unitPrice: billRate.toFixed(2),
          amount: (billableHours * billRate).toFixed(2),
        }],
      });
    }
    if (payoutEntryId) {
      connectorResult.payout = await connector.pushPayout({
        payoutEntryId,
        contractorUserId: ts.userId,
        amountCents: Math.round(totalHours * payRate * 100),
        currency: placement.currency ?? "USD",
        periodStart: String(ts.periodStart),
        periodEnd: String(ts.periodEnd),
        reference: `Timesheet ${ts.id} week of ${ts.periodStart}`,
      });
    }
  } catch (e) {
    // Connector errors get logged + audited but don't fail the approve.
    connectorResult = { invoice: { ok: false, error: String((e as Error).message) } };
  }

  // Audit trail. The reconciliation job re-reads this stream to retry
  // any connector pushes that errored above.
  await db.insert(billingEvents).values({
    userId: ts.userId,
    eventType: "workforce_timesheet_derived",
    payload: {
      timesheetId: ts.id,
      placementId: placement.id,
      placementKind: placement.placementKind,
      companyId: ts.companyId,
      invoiceId: invoiceId ?? null,
      payoutEntryId: payoutEntryId ?? null,
      billableHours,
      totalHours,
      billRateHourly: billRate,
      payRateHourly: payRate,
      currency: placement.currency ?? "USD",
      approvedBy: performedByUserId,
      approvedAt: new Date().toISOString(),
      provider: providerName,
      connectorResult,
    },
  } as any);

  return {
    touchpointType: "billing_derived",
    payload: {
      placementId: placement.id,
      invoiceId: invoiceId ?? null,
      payoutEntryId: payoutEntryId ?? null,
      billableHours,
      totalHours,
      grossMarginCents: Math.round((billableHours * billRate - totalHours * payRate) * 100),
    },
    invoiceId,
    payoutEntryId,
  };
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

// ---------------------------------------------------------------------------
// Phase 4 read models (#1422 desk margin + #1421 doc-vault list)
// ---------------------------------------------------------------------------

export interface DeskMarginRow {
  placementId: string;
  candidateId: string;
  candidateName: string;
  recruiterId: string | null;
  recruiterName: string | null;
  placementKind: string | null;
  startDate: string | null;
  endDate: string | null;
  billRateHourly: number;
  payRateHourly: number;
  currency: string;
  billableHoursYTD: number;
  totalHoursYTD: number;
  revenueCents: number;
  payoutCents: number;
  grossMarginCents: number;
  approvedTimesheetCount: number;
}

/** Per-placement desk margin rollup for an employer's workforce. Sources
 *  from approved timesheets only (via billing_events 'workforce_timesheet_derived')
 *  so amounts always match what was invoiced.
 *
 *  Period: year-to-date by default; date-range filter can come later.
 *  No new schema — pure read model over existing tables. (#1422) */
export async function getDeskMargin(
  employerId: string,
  db = getDb(),
): Promise<DeskMarginRow[]> {
  const employerCompanies = await resolveEmployerCompanyIds(employerId, db);
  if (employerCompanies.length === 0) return [];

  // All placements with at least one timesheet derivation from approved
  // timesheets where ts.companyId belongs to the employer. We aggregate
  // in-memory because billing_events payload is JSONB; one query, simple
  // bookkeeping in JS keeps the SQL portable across providers.
  const events = await db.select({
    payload: billingEvents.payload,
    createdAt: billingEvents.createdAt,
  })
    .from(billingEvents)
    .where(and(
      eq(billingEvents.eventType, "workforce_timesheet_derived"),
      sql`(${billingEvents.payload}->>'companyId')::uuid = ANY(${employerCompanies}::uuid[])`,
    ));

  if (events.length === 0) return [];

  const placementIds = new Set<string>();
  type Agg = {
    billableHours: number; totalHours: number;
    revenueCents: number; payoutCents: number; tsCount: number;
  };
  const aggByPlacement = new Map<string, Agg>();

  for (const e of events) {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    const placementId = String(p.placementId ?? "");
    if (!placementId) continue;
    placementIds.add(placementId);

    const billableHours = Number(p.billableHours ?? 0);
    const totalHours = Number(p.totalHours ?? 0);
    const billRate = Number(p.billRateHourly ?? 0);
    const payRate = Number(p.payRateHourly ?? 0);
    const revenueCents = Math.round(billableHours * billRate * 100);
    const payoutCents = Math.round(totalHours * payRate * 100);

    const current = aggByPlacement.get(placementId) ?? {
      billableHours: 0, totalHours: 0, revenueCents: 0, payoutCents: 0, tsCount: 0,
    };
    current.billableHours += billableHours;
    current.totalHours += totalHours;
    current.revenueCents += revenueCents;
    current.payoutCents += payoutCents;
    current.tsCount += 1;
    aggByPlacement.set(placementId, current);
  }

  if (placementIds.size === 0) return [];

  // Hydrate the placement rows in one query.
  const placementRows = await db.select().from(placements)
    .where(sql`${placements.id} = ANY(${Array.from(placementIds)}::uuid[])`);

  // Recruiter name lookup.
  const recruiterIds = Array.from(new Set(placementRows.map((p) => p.recruiterId).filter(Boolean)));
  const recruiterRows = recruiterIds.length > 0
    ? await db.select({ id: users.id, name: users.name }).from(users)
        .where(sql`${users.id} = ANY(${recruiterIds}::uuid[])`)
    : [];
  const recruiterNameById = new Map(recruiterRows.map((r) => [r.id, r.name]));

  return placementRows.map((p) => {
    const agg = aggByPlacement.get(p.id)!;
    return {
      placementId: p.id,
      candidateId: p.candidateId,
      candidateName: p.candidateName || "Unknown",
      recruiterId: p.recruiterId ?? null,
      recruiterName: p.recruiterId ? (recruiterNameById.get(p.recruiterId) ?? null) : null,
      placementKind: p.placementKind ?? null,
      startDate: p.startDate ? new Date(p.startDate as any).toISOString() : null,
      endDate: p.endDate ? new Date(p.endDate as any).toISOString() : null,
      billRateHourly: Number(p.billRateHourly ?? 0),
      payRateHourly: Number(p.payRateHourly ?? 0),
      currency: p.currency ?? "USD",
      billableHoursYTD: Number(agg.billableHours.toFixed(2)),
      totalHoursYTD: Number(agg.totalHours.toFixed(2)),
      revenueCents: agg.revenueCents,
      payoutCents: agg.payoutCents,
      grossMarginCents: agg.revenueCents - agg.payoutCents,
      approvedTimesheetCount: agg.tsCount,
    };
  }).sort((a, b) => b.grossMarginCents - a.grossMarginCents);
}

// ---------------------------------------------------------------------------
// Phase 4 doc vault (#1421) — CRUD shell, e-sign integration deferred
// ---------------------------------------------------------------------------

export interface CreatePlacementDocumentInput {
  placementId?: string | null;
  companyId?: string | null;
  userId?: string | null;
  kind: string;
  filePath?: string | null;
  providerName?: string | null;
  providerRef?: string | null;
  signedAt?: Date | null;
  expiresAt?: Date | null;
}

export async function createPlacementDocument(
  inviterUserId: string,
  input: CreatePlacementDocumentInput,
  db = getDb(),
) {
  // Authority: caller must be employer of `companyId` (if scoped) or
  // recruiter on `placementId`. Tightened gate per #1349 DRY — no
  // prop-drilled "can manage docs"; the service checks workspace context
  // every call.
  if (input.companyId) {
    const employerCompanies = await resolveEmployerCompanyIds(inviterUserId, db);
    if (!employerCompanies.includes(input.companyId)) {
      throw new ForbiddenError("Not an employer in this workspace");
    }
  } else if (input.placementId) {
    const [p] = await db.select().from(placements)
      .where(eq(placements.id, input.placementId)).limit(1);
    if (!p || p.recruiterId !== inviterUserId) {
      throw new ForbiddenError("Not the recruiter on this placement");
    }
  } else {
    throw new ForbiddenError("Either companyId or placementId is required");
  }
  const [row] = await db.insert(placementDocuments).values({
    placementId: input.placementId ?? null,
    companyId: input.companyId ?? null,
    userId: input.userId ?? null,
    kind: input.kind,
    filePath: input.filePath ?? null,
    providerName: input.providerName ?? null,
    providerRef: input.providerRef ?? null,
    signedAt: input.signedAt ?? null,
    expiresAt: input.expiresAt ?? null,
    status: input.signedAt ? "signed" : "pending",
  } as any).returning();
  return row;
}

export async function listCompanyPlacementDocuments(
  employerId: string,
  db = getDb(),
) {
  const employerCompanies = await resolveEmployerCompanyIds(employerId, db);
  if (employerCompanies.length === 0) return [];
  return await db.select().from(placementDocuments)
    .where(sql`${placementDocuments.companyId} = ANY(${employerCompanies}::uuid[])`)
    .orderBy(desc(placementDocuments.createdAt));
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
