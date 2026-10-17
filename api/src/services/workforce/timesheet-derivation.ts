/** Workforce Phase 3 (#1420) — approved timesheet → invoice + payout derivation. */

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const { timesheets, billingEvents, invoices, invoiceLineItems, placements } = schema;

/** Phase 3 derivation — timesheet → invoice line item + payout-ledger
 *  accrual via the linked placement's bill/pay rates. Skips both if no
 *  active placement matches, or if the placement is missing rate fields.
 *  Returns the derivation summary for audit + UI consumption.
 *
 *  Money rails policy (#1349): we generate the invoice + payout LOCALLY
 *  and emit a billingEvents row. Outbound provider push (QBO / Xero /
 *  Gusto / Helcim) happens via `services/sync/connectors/*` adapters
 *  that consume the billingEvents stream. */
export async function deriveWorkforceBillingAndPayout(
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
    companyId: ts.companyId ?? null,
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
