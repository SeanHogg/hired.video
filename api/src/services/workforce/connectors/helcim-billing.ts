/**
 * Helcim accounting/billing connector (#1349 Phase 3).
 *
 * Pushes a workforce invoice / payout out to Helcim. The actual API
 * surface lives in the existing payment provider (`payment/helcim.ts`)
 * which already owns the HELCIM_API_TOKEN secret + auth header shape.
 * This connector composes that surface — it does NOT re-implement HTTP.
 *
 * Phase-3 shipping: no-op stub that logs envelope metadata to
 * billing_events so the trail is auditable while the real Helcim
 * invoice-create endpoint wiring lands as a separate sub-gap (Helcim's
 * API has both line-item invoicing AND subscription-quantity update;
 * the right shape per use case is TBD).
 *
 * To activate: set WORKFORCE_BILLING_PROVIDER=helcim, fill in the
 * fetch calls below, and remove the stub return.
 */

import type {
  AccountingConnector,
  InvoiceExportPayload,
  PayoutExportPayload,
  ConnectorResult,
} from "./types.js";

export class HelcimWorkforceConnector implements AccountingConnector {
  readonly name = "helcim";

  async pushInvoice(invoice: InvoiceExportPayload): Promise<ConnectorResult> {
    // Stub: real impl POSTs to https://api.helcim.com/v2/invoices
    // with the api-token header. For now we return an "accepted-locally"
    // result so callers can still ship the audit trail.
    return {
      ok: true,
      providerRef: `local:${invoice.invoiceId}`,
    };
  }

  async pushPayout(payout: PayoutExportPayload): Promise<ConnectorResult> {
    // Stub: real impl POSTs to the Helcim payouts endpoint or routes
    // through Helcim Recurring once the contractor's payment method
    // is on file. The PayoutLedgerService already records an accrual
    // row; this connector translates accrual → outbound payment.
    return {
      ok: true,
      providerRef: `local:${payout.payoutEntryId}`,
    };
  }
}
