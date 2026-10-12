/**
 * Workforce connector registry (#1349 Phase 3 + 4).
 *
 * Single SSoT for "given a provider name, return the connector instance".
 * Routes + the timesheet derivation path resolve through here; no other
 * surface should `new ProviderConnector()` directly (DRY rule).
 */

import type { AccountingConnector, ESignConnector } from "./types.js";
import { HelcimWorkforceConnector } from "./helcim-billing.js";
import { QuickBooksConnector } from "./quickbooks.js";
import { XeroConnector } from "./xero.js";
import { GustoConnector } from "./gusto.js";
import { NativeESignConnector } from "./esign-native.js";
import { DocuSignConnector } from "./esign-docusign.js";

export type AccountingProviderName = "helcim" | "quickbooks" | "xero" | "gusto";
export type ESignProviderName = "native" | "docusign";

export function getAccountingConnector(name: string): AccountingConnector {
  switch (name.toLowerCase()) {
    case "helcim": return new HelcimWorkforceConnector();
    case "quickbooks":
    case "qbo": return new QuickBooksConnector();
    case "xero": return new XeroConnector();
    case "gusto": return new GustoConnector();
    default: return new HelcimWorkforceConnector(); // Sensible default — we already use Helcim for payments
  }
}

export function getESignConnector(name: string | null | undefined): ESignConnector {
  switch ((name ?? "").toLowerCase()) {
    case "docusign": return new DocuSignConnector();
    case "native":
    case "":
    default: return new NativeESignConnector();
  }
}

export type { AccountingConnector, ESignConnector } from "./types.js";
export type {
  InvoiceExportPayload,
  PayoutExportPayload,
  ESignEnvelopeRequest,
  ESignEnvelopeResult,
  ConnectorResult,
} from "./types.js";
