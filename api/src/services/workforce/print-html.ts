/**
 * Print-ready HTML for workforce invoices + timesheets (#1440).
 *
 * Browser print-to-PDF was picked over a server-side PDF library because:
 *   • Cloudflare Workers can't run pdfkit (Node streams) and pdf-lib
 *     would add a heavy dep just for plain text rendering.
 *   • Users get a familiar "Print → Save as PDF" UX with native font
 *     rendering + page setup.
 *
 * The HTML is single-page, A4-sized via @page CSS, with print-only
 * styling that hides the action buttons. Frontend opens these URLs in a
 * new tab and triggers `window.print()` automatically.
 */

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { ForbiddenError } from "../../middleware/errorHandler.js";
import { resolveEmployerCompanyIds } from "./index.js";

const {
  invoices,
  invoiceLineItems,
  timesheets,
  taskTimeEntries,
  users,
  placements,
  companyProfiles,
} = schema;

function escapeHtml(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(amount: string | number | null | undefined, currency = "USD"): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));
}

/** Wrap markup with the print-ready document chrome — A4 page, sans-serif,
 *  hides anything tagged `.no-print` when actually printing. */
function wrap(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: Letter; margin: 0.6in; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; font-size: 11pt; }
  h1 { font-size: 20pt; margin: 0 0 0.25rem; }
  h2 { font-size: 13pt; margin: 1rem 0 0.5rem; }
  table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { font-weight: 600; background: #f6f6f7; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
  .muted { color: #666; font-size: 9pt; }
  .totals { margin-top: 1rem; display: grid; grid-template-columns: auto auto; gap: 4px 16px; width: max-content; margin-left: auto; }
  .totals .label { color: #666; }
  .totals .value { font-variant-numeric: tabular-nums; text-align: right; }
  .totals .grand { font-weight: 700; font-size: 13pt; border-top: 2px solid #111; padding-top: 6px; margin-top: 4px; }
  .actions { display: flex; gap: 0.5rem; margin: 1rem 0; }
  .actions button { font-size: 11pt; padding: 6px 14px; border: 1px solid #ddd; background: #fff; cursor: pointer; border-radius: 4px; }
  .actions button:hover { background: #f6f6f7; }
  .footer { margin-top: 1.5rem; font-size: 9pt; color: #666; border-top: 1px solid #eee; padding-top: 0.5rem; }
  @media print { .no-print { display: none !important; } body { font-size: 10pt; } }
</style>
</head>
<body>
<div class="no-print actions">
  <button onclick="window.print()">Print / Save as PDF</button>
  <button onclick="window.close()">Close</button>
</div>
${body}
<script>
  // Auto-prompt the print dialog so the URL doubles as a one-click PDF export.
  // Users who landed via a navigation can still hit Esc and use the Print button.
  setTimeout(() => { try { window.print(); } catch (e) {} }, 250);
</script>
</body>
</html>`;
}

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

  return wrap(`Invoice ${inv.id.slice(0, 8)}`, body);
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

  return wrap(`Timesheet ${escapeHtml(ts.periodStart)}`, body);
}
