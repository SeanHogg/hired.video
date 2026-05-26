/**
 * Xero accounting connector (#1349 Phase 3).
 *
 * Same OAuth2 pattern as QBO but with a flatter tenant model — one
 * Xero org per OAuth grant. Invoice endpoint:
 * `POST https://api.xero.com/api.xro/2.0/Invoices`.
 *
 * Phase-3 shipping: no-op stub.
 */

import type {
  AccountingConnector,
  InvoiceExportPayload,
  PayoutExportPayload,
  ConnectorResult,
} from "./types.js";

export class XeroConnector implements AccountingConnector {
  readonly name = "xero";

  async pushInvoice(invoice: InvoiceExportPayload): Promise<ConnectorResult> {
    return { ok: true, providerRef: `xero-stub:${invoice.invoiceId}` };
  }

  async pushPayout(payout: PayoutExportPayload): Promise<ConnectorResult> {
    return { ok: true, providerRef: `xero-stub:${payout.payoutEntryId}` };
  }
}
