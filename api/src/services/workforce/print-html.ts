/**
 * Print-ready HTML for workforce invoices + timesheets (#1440).
 *
 * The shared document chrome (page setup, action bar, auto-print, escaper)
 * lives in ../print/print-shell — this module only builds the invoice +
 * timesheet bodies. Frontend opens these URLs in a new tab and the shell
 * triggers `window.print()` automatically.
 */

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { ForbiddenError } from "../../middleware/errorHandler.js";
import { resolveEmployerCompanyIds } from "./tenancy.js";
import { formatMoney, printShell } from "../print/print-shell.js";
import { escapeHtml } from "../../../../shared/html-escape.js";

const {
  invoices,
  invoiceLineItems,
  timesheets,
  taskTimeEntries,
  users,
  placements,
  companyProfiles,
} = schema;

// ---------------------------------------------------------------------------
// Invoice HTML
// ---------------------------------------------------------------------------

export async function renderInvoiceHtml(
  callerUserId: string,
  invoiceId: string,
  db = getDb(),
): Promise<string> {
  const [inv] = await db.select().from(invoices)
    .where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) throw new ForbiddenError("Invoice not found");

  // Authority: the recruiter / employer who owns the invoice (or one of
  // its placement's employers) can view. Workforce invoices route via
  // recipientCompanyId; check the caller's employer scope.
  const employerCompanies = await resolveEmployerCompanyIds(callerUserId, db);
  const callerIsOwner = inv.userId === callerUserId;
  const callerIsRecipientEmployer =
    inv.recipientCompanyId && employerCompanies.includes(inv.recipientCompanyId);
  if (!callerIsOwner && !callerIsRecipientEmployer) {
    throw new ForbiddenError("Not authorised to view this invoice");
  }

  const lines = await db.select().from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId));

  // Hydrate the agency-side recruiter + the recipient company so the
  // header reads "From X / To Y" instead of opaque UUIDs.
  const [issuer] = await db.select({ name: users.name, email: users.email })
    .from(users).where(eq(users.id, inv.userId)).limit(1);
  const [recipient] = inv.recipientCompanyId
    ? await db.select({ name: companyProfiles.name })
        .from(companyProfiles).where(eq(companyProfiles.id, inv.recipientCompanyId)).limit(1)
    : [null as any];

  const lineRows = lines.map((li) => `
    <tr>
      <td>${escapeHtml(li.description)}</td>
      <td class="num">${escapeHtml(li.quantity)}</td>
      <td class="num">${formatMoney(li.unitPrice, inv.currency)}</td>
      <td class="num">${formatMoney(li.amount, inv.currency)}</td>
    </tr>`).join("");

  const body = `
    <div class="header">
      <div>
        <h1>Invoice</h1>
        <div class="muted">Invoice #${escapeHtml(inv.id.slice(0, 8))}</div>
        <div class="muted">Issued ${escapeHtml(new Date(inv.createdAt).toLocaleDateString())}</div>
        ${inv.dueDate ? `<div class="muted">Due ${escapeHtml(new Date(inv.dueDate).toLocaleDateString())}</div>` : ""}
      </div>
      <div style="text-align: right;">
        <strong>From</strong><br>
        ${escapeHtml(issuer?.name ?? "—")}<br>
        <span class="muted">${escapeHtml(issuer?.email ?? "")}</span>
        ${recipient ? `<br><br><strong>Bill to</strong><br>${escapeHtml(recipient.name)}` : ""}
      </div>
    </div>

    <table>
      <thead>
        <tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr>
      </thead>
      <tbody>${lineRows || `<tr><td colspan="4" class="muted">No line items</td></tr>`}</tbody>
    </table>

    <div class="totals">
      <span class="label">Subtotal</span><span class="value">${formatMoney(inv.total, inv.currency)}</span>
      <span class="label grand">Total due</span><span class="value grand">${formatMoney(inv.total, inv.currency)}</span>
    </div>

    <div class="footer">
      Status: <strong>${escapeHtml(inv.status)}</strong>
      ${inv.paidAt ? ` · Paid ${escapeHtml(new Date(inv.paidAt).toLocaleDateString())}` : ""}
      ${inv.sourceTimesheetId ? ` · Workforce timesheet ${escapeHtml(inv.sourceTimesheetId.slice(0, 8))}` : ""}
    </div>`;

  return printShell(`Invoice ${inv.id.slice(0, 8)}`, body);
}

// ---------------------------------------------------------------------------
// Timesheet HTML
// ---------------------------------------------------------------------------

export async function renderTimesheetHtml(
  callerUserId: string,
  timesheetId: string,
  db = getDb(),
): Promise<string> {
  const [ts] = await db.select().from(timesheets)
    .where(eq(timesheets.id, timesheetId)).limit(1);
  if (!ts) throw new ForbiddenError("Timesheet not found");

  // Authority: the submitting employee + any active employer of the
  // workspace can view + print.
  const employerCompanies = await resolveEmployerCompanyIds(callerUserId, db);
  const callerIsOwner = ts.userId === callerUserId;
  const callerIsEmployer = employerCompanies.includes(ts.companyId);
  if (!callerIsOwner && !callerIsEmployer) {
    throw new ForbiddenError("Not authorised to view this timesheet");
  }

  const [employee] = await db.select({ name: users.name, email: users.email })
    .from(users).where(eq(users.id, ts.userId)).limit(1);
  const [company] = await db.select({ name: companyProfiles.name })
    .from(companyProfiles).where(eq(companyProfiles.id, ts.companyId)).limit(1);

  // Pull the snapshot if frozen, otherwise read live entries.
  const snapshotEntries = Array.isArray(ts.snapshot) ? (ts.snapshot as any[]) : null;
  const entries = snapshotEntries
    ? snapshotEntries
    : await db.select().from(taskTimeEntries)
        .where(and(
          eq(taskTimeEntries.userId, ts.userId),
          eq(taskTimeEntries.timesheetId, ts.id),
        ));

  const entryRows = entries.map((e: any) => `
    <tr>
      <td>${escapeHtml(new Date(e.startedAt).toLocaleString())}</td>
      <td>${escapeHtml(e.endedAt ? new Date(e.endedAt).toLocaleString() : "—")}</td>
      <td class="num">${escapeHtml(((Number(e.durationSec) || 0) / 3600).toFixed(2))}</td>
      <td>${e.billable ? "✓" : ""}</td>
      <td>${escapeHtml(e.notes ?? "")}</td>
    </tr>`).join("");

  const body = `
    <div class="header">
      <div>
        <h1>Timesheet</h1>
        <div class="muted">Week of ${escapeHtml(ts.periodStart)} – ${escapeHtml(ts.periodEnd)}</div>
        <div class="muted">Status <strong>${escapeHtml(ts.status)}</strong></div>
      </div>
      <div style="text-align: right;">
        <strong>Employee</strong><br>
        ${escapeHtml(employee?.name ?? "—")}<br>
        <span class="muted">${escapeHtml(employee?.email ?? "")}</span>
        ${company ? `<br><br><strong>Workspace</strong><br>${escapeHtml(company.name)}` : ""}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Punched in</th><th>Punched out</th>
          <th class="num">Hours</th><th>Bill</th><th>Notes</th>
        </tr>
      </thead>
      <tbody>${entryRows || `<tr><td colspan="5" class="muted">No entries</td></tr>`}</tbody>
    </table>

    <div class="totals">
      <span class="label">Total hours</span><span class="value">${escapeHtml(ts.totalHours ?? "0.00")}</span>
      <span class="label">Billable hours</span><span class="value">${escapeHtml(ts.totalBillableHours ?? "0.00")}</span>
    </div>

    <div class="footer">
      ${ts.submittedAt ? `Submitted ${escapeHtml(new Date(ts.submittedAt).toLocaleString())}` : ""}
      ${ts.approvedAt ? ` · Approved ${escapeHtml(new Date(ts.approvedAt).toLocaleString())}` : ""}
      ${ts.rejectionReason ? `<br><strong>Rejected:</strong> ${escapeHtml(ts.rejectionReason)}` : ""}
      <br><br>
      <em>Employee signature: ____________________________</em> &nbsp;&nbsp;
      <em>Approver signature: ____________________________</em>
    </div>`;

  return printShell(`Timesheet ${escapeHtml(ts.periodStart)}`, body);
}
