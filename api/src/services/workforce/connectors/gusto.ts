/**
 * Gusto payroll connector (#1349 Phase 3).
 *
 * Gusto owns contractor pay rails — we push payout payloads here and
 * Gusto handles the actual ACH / 1099 issuance + tax filings (the moat
 * split per #1349). Invoice pushing is NOT supported (Gusto isn't an AR
 * tool); routes that try `pushInvoice` should fall back to QBO / Xero.
 *
 * Phase-3 shipping: no-op stub.
 */

import type {
  AccountingConnector,
  InvoiceExportPayload,
  PayoutExportPayload,
  ConnectorResult,
} from "./types.js";

export class GustoConnector implements AccountingConnector {
  readonly name = "gusto";

  async pushInvoice(_invoice: InvoiceExportPayload): Promise<ConnectorResult> {
    return {
      ok: false,
      error: "Gusto does not support invoice push — route to QBO / Xero instead",
      retriable: false,
    };
  }

  async pushPayout(payout: PayoutExportPayload): Promise<ConnectorResult> {
    return { ok: true, providerRef: `gusto-stub:${payout.payoutEntryId}` };
  }
}
