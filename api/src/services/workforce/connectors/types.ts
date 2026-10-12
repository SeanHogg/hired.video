/**
 * Workforce outbound connector interfaces (#1349 Phase 3 + 4).
 *
 * Two flavours:
 *   - AccountingConnector — receives invoice + payout payloads from
 *     workforce derivation (approveTimesheet) and posts them outbound
 *     to the customer's accounting / payroll system. We DO NOT own the
 *     money flow ourselves — connectors are envelope-only.
 *   - ESignConnector — receives a document envelope create request and
 *     returns a provider ref + signing URL.
 *
 * Every connector is selected at runtime by reading the company's
 * `workforce_integration_provider` configuration (stored in
 * `company_integrations`, see #1349 follow-on). For Phase-3 shipping we
 * stub the actual provider HTTP calls with no-op implementations and
 * log to `billing_events` / `placement_documents.metadata`. Filling in
 * real API calls is per-provider work that requires OAuth credentials
 * + webhook configuration — tracked as sub-gaps under the provider
 * impl files.
 */

export interface InvoiceExportPayload {
  invoiceId: string;
  recruiterId: string | null;
  recipientCompanyId: string | null;   // The client being billed
  currency: string;
  total: string;                       // Decimal-string for accuracy
  dueDate: string | null;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
    amount: string;
  }>;
}

export interface PayoutExportPayload {
  payoutEntryId: string;
  contractorUserId: string;
  amountCents: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  reference: string;                   // "Timesheet {id} week of {periodStart}"
}

export interface ConnectorResult {
  ok: boolean;
  providerRef?: string;                // Vendor's invoice / payout ID
  error?: string;
  retriable?: boolean;
}

export interface AccountingConnector {
  readonly name: string;
  /** Push an invoice + line items to the provider's AR module. */
  pushInvoice(invoice: InvoiceExportPayload): Promise<ConnectorResult>;
  /** Push a contractor payout to the provider's AP / payroll module. */
  pushPayout(payout: PayoutExportPayload): Promise<ConnectorResult>;
}

export interface ESignEnvelopeRequest {
  documentId: string;
  documentKind: string;                // i9 | w9 | w8ben | coi | bg_check | msa | sow | offer_letter | nda
  recipientEmail: string;
  recipientName: string;
  templateRef?: string;                // Provider-side template ID, when reusing a template
  fileUrl?: string;                    // Pre-signed URL to the PDF when not using a template
}

export interface ESignEnvelopeResult extends ConnectorResult {
  envelopeId?: string;
  signingUrl?: string;
}

export interface ESignConnector {
  readonly name: string;
  /** Create a signing envelope and return the recipient's signing URL. */
  createEnvelope(req: ESignEnvelopeRequest): Promise<ESignEnvelopeResult>;
  /** Resolve the status of a previously-created envelope. */
  getEnvelopeStatus(envelopeId: string): Promise<{
    status: "pending" | "signed" | "declined" | "expired";
    signedAt?: string;
  }>;
}
