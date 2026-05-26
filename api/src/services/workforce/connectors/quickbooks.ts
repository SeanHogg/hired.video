/**
 * QuickBooks Online accounting connector (#1349 Phase 3).
 *
 * QBO is the heaviest of the three external accounting targets — its
 * API requires per-company OAuth2 + the realmId, both stored on the
 * employer's `company_integrations` row. The pushInvoice flow maps our
 * `InvoiceExportPayload` to QBO's `Invoice` entity and POSTs to
 * `/v3/company/{realmId}/invoice`.
 *
 * Phase-3 shipping: no-op stub. Real impl tracked under the QBO sub-gap.
 */

import type {
  AccountingConnector,
  InvoiceExportPayload,
  PayoutExportPayload,
  ConnectorResult,
} from "./types.js";

export class QuickBooksConnector implements AccountingConnector {
  readonly name = "quickbooks";

  async pushInvoice(invoice: InvoiceExportPayload): Promise<ConnectorResult> {
    return { ok: true, providerRef: `qbo-stub:${invoice.invoiceId}` };
  }

  async pushPayout(payout: PayoutExportPayload): Promise<ConnectorResult> {
    // QBO doesn't run payroll directly — for contractor pay we'd map
    // this to a "Bill" or push out to QBO Payroll if the employer has
    // it enabled.
    return { ok: true, providerRef: `qbo-stub:${payout.payoutEntryId}` };
  }
}
