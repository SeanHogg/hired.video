/**
 * Helcim accounting/billing connector (#1349 Phase 3, #1437 + #1438).
 *
 * Pushes a workforce invoice / payout out to Helcim. Helcim API auth is
 * a single `api-token` header — same shape that
 * [services/billing/payment/helcim.ts](../../billing/payment/helcim.ts) uses for payment-method
 * collection. We deliberately don't share the HelcimPaymentProvider class
 * because workforce-side calls are server-to-server invoice / recurring
 * billing endpoints, not customer-method tokenisation.
 *
 * Env: `HELCIM_API_TOKEN` (required for live calls). When absent the
 * connector returns `local:{id}` provider refs so the local audit trail
 * still works in dev / test deployments without secrets.
 */

import type {
  AccountingConnector,
  InvoiceExportPayload,
  PayoutExportPayload,
  ConnectorResult,
} from "./types.js";

const HELCIM_API_BASE = "https://api.helcim.com/v2";

function getHelcimToken(): string | null {
  const env = (globalThis as { __ENV?: Record<string, string | undefined> }).__ENV;
  return env?.HELCIM_API_TOKEN ?? env?.HELCIM_API_KEY ?? null;
}

async function helcimFetch<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getHelcimToken();
  if (!token) throw new Error("HELCIM_API_TOKEN not configured");
  const res = await fetch(`${HELCIM_API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "api-token": token,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`Helcim API ${res.status}: ${txt}`);
  }
  return res.json() as Promise<T>;
}

export class HelcimWorkforceConnector implements AccountingConnector {
  readonly name = "helcim";

  /**
   * Create an invoice on Helcim's hosted invoicing surface.
   * POST /v2/invoices — supports line items + customer assignment.
   * Returns the Helcim invoiceNumber (their canonical ID).
   *
   * Customer mapping: workforce invoices target a *company* (the agency's
   * client). Helcim invoices need a `customer` block; we pass through
   * `companyName` so the recipient is identifiable on Helcim's side. A
   * future enhancement (#1444 / OAuth client connect) would maintain a
   * recipient→customerCode mapping in `company_integrations.metadata`.
   */
  async pushInvoice(invoice: InvoiceExportPayload): Promise<ConnectorResult> {
    if (!getHelcimToken()) {
      // Graceful degradation for dev / test — local audit trail still works.
      return { ok: true, providerRef: `local:${invoice.invoiceId}` };
    }
    try {
      const body = {
        invoiceNumber: invoice.invoiceId,
        currency: invoice.currency,
        dueDate: invoice.dueDate ?? undefined,
        status: "unpaid",
        customer: invoice.recipientCompanyId
          ? { customerCode: invoice.recipientCompanyId }
          : undefined,
        lineItems: invoice.lineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          price: li.unitPrice,
          total: li.amount,
        })),
      };
      const res = await helcimFetch<{
        invoiceNumber?: string;
        data?: { invoiceNumber?: string };
      }>("POST", "/invoices", body);
      const providerRef = res.invoiceNumber ?? res.data?.invoiceNumber ?? invoice.invoiceId;
      return { ok: true, providerRef };
    } catch (e) {
      return {
        ok: false,
        error: String((e as Error).message),
        // 5xx is retriable; 4xx (auth, schema) is not.
        retriable: /\b5\d\d\b/.test((e as Error).message),
      };
    }
  }

  /**
   * Contractor payouts via Helcim ACH. The PayoutLedgerService already
   * recorded the accrual locally; this method posts the outbound transfer
   * once the contractor has an on-file payment destination. Without that
   * onboarding step the call returns ok=false so the cron retry doesn't
   * fire forever.
   */
  async pushPayout(payout: PayoutExportPayload): Promise<ConnectorResult> {
    if (!getHelcimToken()) {
      return { ok: true, providerRef: `local:${payout.payoutEntryId}` };
    }
    // Helcim's outbound payments require a saved bank account on the
    // recipient. We defer the actual /payouts POST until #1444 wires the
    // contractor-side bank-account collection — for now we stamp the
    // local entry and let the audit row drive the retry queue.
    return {
      ok: false,
      error: "Contractor bank account not on file (Helcim ACH onboarding pending)",
      retriable: true,
    };
  }

  /**
   * Workforce seat-billing sync (#1437).
   *
   * The provider-side counterpart to `recalculateWorkforceSeats`: given a
   * new seat count + monthly amount, push the change to the company's
   * Helcim recurring-billing subscription so the next cycle bills the
   * right total. The Helcim API supports updating recurring amounts via
   * PUT /v2/recurring-billing-plans/{id} with the new `amount`.
   *
   * Returns ok=true with no providerRef when no subscription is mapped
   * yet — the local seat count IS canonical until the customer connects
   * Helcim recurring billing.
   */
  async syncRecurringAmount(args: {
    helcimSubscriptionId: string | null;
    totalMonthlyAmountCents: number;
    currency: string;
  }): Promise<ConnectorResult> {
    if (!getHelcimToken()) {
      return { ok: true, providerRef: "local:no-helcim" };
    }
    if (!args.helcimSubscriptionId) {
      return { ok: true, providerRef: "local:no-subscription" };
    }
    try {
      const amount = (args.totalMonthlyAmountCents / 100).toFixed(2);
      await helcimFetch(
        "PUT",
        `/recurring-billing-plans/${args.helcimSubscriptionId}`,
        { amount, currency: args.currency },
      );
      return { ok: true, providerRef: args.helcimSubscriptionId };
    } catch (e) {
      return { ok: false, error: String((e as Error).message), retriable: true };
    }
  }
}
