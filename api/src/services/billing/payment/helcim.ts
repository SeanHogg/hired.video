/**
 * Helcim implementation of PaymentProvider.
 *
 * Supports TWO front-end collection flows, selectable per deploy:
 *
 *   1. **HelcimPay.js** (modal, default) — server calls POST /helcim-pay/initialize
 *      to get a checkoutToken, the frontend loads the HelcimPay.js SDK and
 *      calls appendHelcimPayIframe(checkoutToken). The iFrame handles
 *      everything.
 *
 *   2. **Helcim.js** (inline form) — the frontend renders its own card
 *      inputs (with specific `id` attributes) and includes
 *      <script src="https://secure.myhelcim.com/js/version2.js">. On submit
 *      it calls helcimProcess(); Helcim.js tokenises the card via CORS AJAX
 *      → our servers never see raw card numbers.
 *
 * Switch flows by setting HELCIM_COLLECTION_FLOW=modal | inline. Inline mode
 * additionally requires HELCIM_JS_TOKEN; without it the provider silently
 * falls back to modal so a half-configured deploy never 500s checkout.
 *
 * Required secrets (wrangler secret put):
 *   HELCIM_API_TOKEN     — generated in Helcim dashboard → All Tools → Integrations → API Access
 *
 * Optional secrets:
 *   HELCIM_COLLECTION_FLOW — "modal" (default) | "inline"
 *   HELCIM_JS_TOKEN      — Helcim.js Configuration token (required for inline flow)
 *   HELCIM_JS_SECRET     — Helcim.js Configuration secret (for amount hashing — not yet consumed)
 *   HELCIM_WEBHOOK_TOKEN — generated in Helcim dashboard → Settings → Webhooks
 *
 * Authentication: Helcim only requires the `api-token` header — there is no
 * `account-id` header in the Helcim v2 API.
 *
 * To activate: set PAYMENT_PROVIDER=helcim and the secrets above.
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "../../../db/index.js";
import type { BillingAddress } from "../../../../../shared/billing-address.js";
import { HELCIM_PAY_JS, HelcimApiError, helcimRequest as helcimApiRequest, verifyHelcimWebhookSignature } from "../../adapters/helcim.js";
import type {
  PaymentProvider,
  CollectPaymentMethodResult,
  SavedPaymentMethod,
  NormalizedWebhookPayload,
  NormalizedEventType,
  PaymentMethodType,
  CollectedPaymentMethodHint,
  ProviderTransaction,
} from "./types.js";

/** Map our normalised payment-method-type to Helcim's `paymentMethod` value. */
function helcimPaymentMethodValue(type?: PaymentMethodType): "cc" | "ach" | "cc-ach" {
  if (type === "card") return "cc";
  if (type === "us_bank_account") return "ach";
  return "cc-ach";
}

/**
 * Map ISO 3166-1 alpha-2 (what `BillingAddressSchema` stores) to alpha-3,
 * which is what Helcim's customer API accepts. Sending "US" returns
 * 400 `billing Address.country (US) must be a valid Constant`.
 * Only the codes surfaced by `BillingAddressForm.COUNTRY_OPTIONS` are
 * mapped — extend in lockstep if the form adds more countries.
 */
const HELCIM_ALPHA3_BY_ALPHA2: Record<string, string> = {
  US: "USA",
  CA: "CAN",
  GB: "GBR",
  AU: "AUS",
};

/** Convert a normalised BillingAddress to Helcim's customer-API shape. */
function helcimBillingAddress(addr: BillingAddress) {
  return {
    name: addr.fullName,
    street1: addr.line1,
    street2: addr.line2 ?? "",
    city: addr.city,
    province: addr.state,
    country: HELCIM_ALPHA3_BY_ALPHA2[addr.country] ?? addr.country,
    postalCode: addr.postalCode,
    phone: addr.phone ?? "",
    email: undefined as string | undefined,
  };
}

// ---------------------------------------------------------------------------
// Helcim API helpers
// ---------------------------------------------------------------------------

/** Shape returned by `GET /v2/customers/{code}/cards`. Helcim's docs are
 *  light here — fields are accepted optionally so the parser doesn't
 *  fight a future schema tweak. Only used inside `lookupCardExpiry`. */
interface HelcimStoredCard {
  cardToken?: string;
  cardType?: string;        // "VISA" | "MC" | …
  brand?: string;
  cardNumberLast4?: string;
  last4?: string;
  cardExpiry?: string;      // "MM/YY" or "MM/YYYY"
  cardExpiryMonth?: number | string;
  cardExpiryYear?: number | string;
}

const HELCIM_JS_SCRIPT = "https://secure.myhelcim.com/js/version2.js";

/** Which front-end collection flow this provider should serve. */
export type HelcimCollectionFlow = "modal" | "inline";

interface HelcimConfig {
  apiToken: string;        // HELCIM_API_TOKEN — used for all server-to-server API calls
  jsToken?: string;        // HELCIM_JS_TOKEN — used client-side for Helcim.js inline form
  jsSecret?: string;       // HELCIM_JS_SECRET — used server-side for amount hashing
  webhookToken?: string;   // HELCIM_WEBHOOK_TOKEN — for webhook signature verification
  /**
   * Which collection flow to expose by default:
   *   - "modal"  → HelcimPay.js iFrame overlay (server pre-mints a checkoutToken)
   *   - "inline" → Helcim.js v2 inline form (page renders its own card inputs)
   *
   * Inline mode requires `jsToken` to be set. If "inline" is requested but no
   * jsToken is configured the provider transparently falls back to "modal".
   */
  collectionFlow: HelcimCollectionFlow;
}

/** Authenticated call via the shared Helcim adapter (services/adapters/helcim.ts). */
function helcimRequest<T = unknown>(
  config: HelcimConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  return helcimApiRequest<T>(config.apiToken, method, path, body);
}

// ---------------------------------------------------------------------------
// Helcim event type normalisation
// ---------------------------------------------------------------------------

const HELCIM_EVENT_MAP: Record<string, NormalizedEventType> = {
  // Helcim webhook event types (https://devdocs.helcim.com/docs/webhooks)
  "transaction.approved": "invoice.paid",
  "transaction.declined": "invoice.payment_failed",
  "recurring.payment.approved": "invoice.paid",
  "recurring.payment.declined": "invoice.payment_failed",
  "recurring.plan.created": "subscription.created",
  "recurring.plan.updated": "subscription.updated",
  "recurring.plan.cancelled": "subscription.deleted",
};

/** The fields we read from Helcim's card-transaction record. */
export interface HelcimCardTransaction {
  transactionId?: number | string;
  status?: string;
  type?: string;
  amount?: number | string;
  amountCharged?: number | string;
  currency?: string;
  currencyCode?: string;
  customerCode?: string;
  invoiceNumber?: string;
  customer?: { customerCode?: string };
}

/** Helcim sometimes returns the record at the top level and sometimes under `data`. */
export function unwrapHelcimRecord<T extends object>(raw: unknown): T | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const inner =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;
  return inner as T;
}

/**
 * Map Helcim's GET /card-transactions/{id} JSON onto ProviderTransaction.
 * Field names follow Helcim v2 docs; `data` wrapping matches other Helcim
 * endpoints we already tolerate (customer create). Pure — unit-tested.
 */
export function mapHelcimCardTransaction(raw: unknown, fallbackId: string): ProviderTransaction | null {
  const tx = unwrapHelcimRecord<HelcimCardTransaction>(raw);
  if (!tx) return null;
  const status = String(tx.status ?? "").toUpperCase();
  const type = String(tx.type ?? "").toLowerCase();
  const amount = tx.amount ?? tx.amountCharged;
  const currency = tx.currency ?? tx.currencyCode;
  const customerCode = tx.customerCode ?? tx.customer?.customerCode;
  const invoiceNumber = tx.invoiceNumber;
  return {
    id: String(tx.transactionId ?? fallbackId),
    approved: status === "APPROVED" && (type === "purchase" || type === "capture"),
    amountCents: Math.round(Number(amount ?? 0) * 100),
    currency: String(currency ?? "").toUpperCase(),
    ...(customerCode ? { customerId: String(customerCode) } : {}),
    ...(invoiceNumber ? { invoiceNumber: String(invoiceNumber) } : {}),
  };
}

// ---------------------------------------------------------------------------
// HelcimPaymentProvider
// ---------------------------------------------------------------------------

export class HelcimPaymentProvider implements PaymentProvider {
  readonly name = "helcim";

  constructor(private readonly config: HelcimConfig) {}
  getPublicKey(): string | null {
    // Helcim does not use a publishable key — the checkout flow uses a
    // checkoutToken obtained server-side and the HelcimPay.js SDK.
    return null;
  }

  async getOrCreateCustomer(
    userId: string,
    email: string,
    name?: string,
    billingAddress?: BillingAddress | null,
  ): Promise<string> {
    // Helcim's customer API exists at /v2/customers. We persist the
    // returned `customerCode` into users.stripeCustomerId — the column
    // name is legacy but acts as a provider-agnostic customer reference
    // (Stripe stores `cus_…`, Helcim stores `CST…`). Pre-creating the
    // customer here lets HelcimPay's modal pre-fill billing fields when
    // we pass `customerCode` to /helcim-pay/initialize.
    const db = getDb();
    const [user] = await db
      .select({ stripeCustomerId: schema.users.stripeCustomerId })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    const existingCode =
      user?.stripeCustomerId && user.stripeCustomerId.startsWith("CST")
        ? user.stripeCustomerId
        : null;

    const baseBody: Record<string, unknown> = {
      contactName: name ?? email,
      email,
    };
    if (billingAddress) {
      baseBody.billingAddress = helcimBillingAddress(billingAddress);
      if (billingAddress.company) baseBody.businessName = billingAddress.company;
    }

    if (existingCode) {
      // Update so the next checkout sees the latest address. Helcim's
      // /v2/customers/{customerCode} accepts PUT for partial updates.
      try {
        await helcimRequest(this.config, "PUT", `/customers/${existingCode}`, baseBody);
      } catch (err) {
        // Non-fatal — pre-fill is a UX nicety. Worst case, the modal
        // shows blank fields like before.
        console.warn(`[helcim] update customer ${existingCode} failed:`, err);
      }
      return existingCode;
    }

    const created = await helcimRequest<{ customerCode?: string; data?: { customerCode?: string } }>(
      this.config,
      "POST",
      "/customers",
      baseBody,
    );
    const customerCode = created.customerCode ?? created.data?.customerCode;
    if (!customerCode) {
      throw new Error("Helcim customer creation did not return a customerCode");
    }

     
    await db.update(schema.users).set({ stripeCustomerId: customerCode } as any).where(eq(schema.users.id, userId));
    return customerCode;
  }

  async createSetupSession(
    _customerId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<string> {
    // Helcim's Hosted Payment Page (HPP) initialisation. paymentType=verify
    // is the card-on-file flow — Helcim tokenises the card without billing.
    // Using paymentType=purchase with amount=0 is rejected by Helcim's API.
    const res = await helcimRequest<{ checkoutToken: string }>(
      this.config,
      "POST",
      "/helcim-pay/initialize",
      {
        paymentType: "verify",
        currency: "USD",
        successUrl,
        cancelUrl,
      },
    );

    // The frontend must redirect to: https://secure.helcim.com/hpp/{checkoutToken}
    return `https://secure.helcim.com/hpp/${res.checkoutToken}`;
  }

  async initPaymentCollection(
    customerId: string,
    successUrl: string,
    cancelUrl: string,
    amount?: number,
    currency?: string,
    paymentMethodType?: PaymentMethodType,
    invoiceNumber?: string,
  ): Promise<CollectPaymentMethodResult> {
    const currencyValue = currency ?? "USD";
    // The inline path requires `jsToken`; gracefully degrade to modal so a
    // mis-configured deploy doesn't 500 the checkout.
    const flow: HelcimCollectionFlow =
      this.config.collectionFlow === "inline" && this.config.jsToken ? "inline" : "modal";

    if (flow === "inline") {
      // Helcim.js tokenises card data via CORS AJAX directly from the buyer's
      // browser, so we don't need to call /helcim-pay/initialize. The
      // frontend renders the form itself; the only server-side prep is
      // returning the JS token + amount + currency so the hidden inputs the
      // page mounts are correct.
      return {
        flowType: "embedded",
        collectionFlow: "inline",
        helcimJsConfig: {
          token: this.config.jsToken!,
          scriptUrl: HELCIM_JS_SCRIPT,
        },
        amount: !amount || amount <= 0 ? undefined : amount,
        currency: currencyValue,
        providerName: "helcim",
      };
    }

    const paymentMethod = helcimPaymentMethodValue(paymentMethodType);
    // Helcim rejects amount=0 for paymentType=purchase. For card-on-file
    // (Settings → Add payment method) we issue a `verify` instead — Helcim
    // tokenises the card without billing, returning a cardToken on success.
    const isCardOnFile = !amount || amount <= 0;
    // Linking the checkout to a Helcim customerCode is what makes the modal
    // pre-fill the billing address fields. When `getOrCreateCustomer`
    // succeeded with a real CST… code, pass it; otherwise fall through and
    // let the buyer type the address again.
    const linkedCustomer = customerId.startsWith("CST") ? customerId : undefined;
    const baseBody: Record<string, unknown> = {
      paymentMethod,
      currency: currencyValue,
      successUrl,
      cancelUrl,
      ...(linkedCustomer ? { customerCode: linkedCustomer } : {}),
    };
    const initBody: Record<string, unknown> = isCardOnFile
      ? { paymentType: "verify", ...baseBody }
      : {
          paymentType: "purchase",
          amount,
          ...baseBody,
          // Tags the charge so a transaction.approved webhook can credit the
          // pack if the tab closes before POST /confirm (gap #2352).
          ...(invoiceNumber ? { invoiceNumber } : {}),
        };

    const res = await helcimRequest<{ checkoutToken: string }>(
      this.config,
      "POST",
      "/helcim-pay/initialize",
      initBody,
    );

    return {
      flowType: "embedded",
      collectionFlow: "modal",
      checkoutToken: res.checkoutToken,
      sdkScriptUrl: HELCIM_PAY_JS,
      providerName: "helcim",
    };
  }

  async savePaymentMethod(
    customerId: string,
    providerPaymentMethodId: string,
    _setDefault = false,
    hint?: CollectedPaymentMethodHint,
  ): Promise<SavedPaymentMethod> {
    // #386 — Capture expiry. Source priority:
    //   1. `hint.expiryMonth/Year` from HelcimPay's success postMessage
    //      (preferred — already in-flight, no extra call).
    //   2. Per-customer card listing fallback: `GET /v2/customers/{code}/cards`
    //      and find the row matching this cardToken or last4. This is the
    //      "ask Helcim what they know" path the gap entry suggested.
    // The fallback is best-effort; if Helcim still doesn't return expiry
    // we land with "Expires —/—" as before instead of failing the save.
    let expiryMonth = hint?.expiryMonth;
    let expiryYear = hint?.expiryYear;
    let brand = hint?.brand;
    let last4 = hint?.last4;

    const needsLookup = !expiryMonth || !expiryYear;
    if (needsLookup && customerId.startsWith("CST")) {
      const fallback = await this.lookupCardExpiry(customerId, providerPaymentMethodId, last4);
      if (fallback) {
        expiryMonth = expiryMonth ?? fallback.expiryMonth;
        expiryYear = expiryYear ?? fallback.expiryYear;
        brand = brand ?? fallback.brand;
        last4 = last4 ?? fallback.last4;
      }
    }

    return {
      providerPaymentMethodId,
      type: hint?.type ?? "card",
      brand,
      last4,
      expiryMonth,
      expiryYear,
    };
  }

  /** #386 — ask Helcim for the customer's stored cards and return the
   *  one that matches our cardToken or the supplied last-4. Returns
   *  null on any provider error so the save flow keeps working. */
  private async lookupCardExpiry(
    customerCode: string,
    cardToken: string,
    last4?: string,
  ): Promise<
    | { expiryMonth?: number; expiryYear?: number; brand?: string; last4?: string }
    | null
  > {
    try {
      // Helcim's customer-cards endpoint returns either a `cards` array or
      // a paged `{ data: [...] }` shape. We tolerate both.
      const raw = await helcimRequest<
        | Array<HelcimStoredCard>
        | { data?: Array<HelcimStoredCard>; cards?: Array<HelcimStoredCard> }
      >(this.config, "GET", `/customers/${customerCode}/cards`);
      const cards: Array<HelcimStoredCard> = Array.isArray(raw)
        ? raw
        : raw?.cards ?? raw?.data ?? [];
      if (cards.length === 0) return null;

      // Best match: cardToken; fallback: last4.
      const byToken = cards.find((c) => c.cardToken === cardToken);
      const byLast4 =
        !byToken && last4 ? cards.find((c) => c.cardNumberLast4 === last4 || c.last4 === last4) : undefined;
      const card = byToken ?? byLast4 ?? cards[cards.length - 1]; // most recently added is usually last
      if (!card) return null;

      let expiryMonth: number | undefined;
      let expiryYear: number | undefined;
      const expRaw =
        card.cardExpiry ??
        (card.cardExpiryMonth && card.cardExpiryYear
          ? `${String(card.cardExpiryMonth).padStart(2, "0")}/${String(card.cardExpiryYear).slice(-2)}`
          : undefined);
      if (expRaw && /^\d{2}\/\d{2,4}$/.test(expRaw)) {
        const [mm, yy] = expRaw.split("/");
        const mn = Number.parseInt(mm, 10);
        const yn = Number.parseInt(yy.length === 2 ? `20${yy}` : yy, 10);
        if (Number.isInteger(mn)) expiryMonth = mn;
        if (Number.isInteger(yn)) expiryYear = yn;
      } else if (card.cardExpiryMonth && card.cardExpiryYear) {
        const mn = typeof card.cardExpiryMonth === "number"
          ? card.cardExpiryMonth
          : Number.parseInt(String(card.cardExpiryMonth), 10);
        const yyStr = String(card.cardExpiryYear);
        const yn = Number.parseInt(yyStr.length === 2 ? `20${yyStr}` : yyStr, 10);
        if (Number.isInteger(mn)) expiryMonth = mn;
        if (Number.isInteger(yn)) expiryYear = yn;
      }
      return {
        expiryMonth,
        expiryYear,
        brand: card.cardType ?? card.brand,
        last4: card.cardNumberLast4 ?? card.last4,
      };
    } catch (err) {
      console.warn(`[helcim] card-expiry lookup for ${customerCode}/${cardToken} failed:`, err);
      return null;
    }
  }

  async detachPaymentMethod(_providerPaymentMethodId: string): Promise<void> {
    // Helcim does not expose a card deletion endpoint in v2 API as of 2025.
    // Cards expire naturally or can be managed through the Helcim dashboard.
    // TODO: Call DELETE /cards/{cardToken} if/when available.
  }

  async verifyWebhook(body: string, headers: Headers): Promise<NormalizedWebhookPayload> {
    const expected = await verifyHelcimWebhookSignature(body, headers, this.config.webhookToken);

    const payload = JSON.parse(body) as Record<string, any>;
    const event = unwrapHelcimRecord<Record<string, any>>(payload) ?? payload;
    const eventType: NormalizedEventType = HELCIM_EVENT_MAP[event.eventType ?? payload.eventType] ?? "unknown";
    const transactionId = event.transactionId ?? payload.transactionId;
    const invoiceNumber = event.invoiceNumber ?? payload.invoiceNumber;
    const customerCode = event.customerCode ?? payload.customerCode ?? event.customerId ?? payload.customerId;

    return {
      // Idempotency key for billing_events. Prefer Helcim's own ids; fall back
      // to the body HMAC (deterministic per payload) rather than Date.now() —
      // a wall-clock fallback gave every redelivery a fresh id, so a retried
      // webhook for the same body slipped past the dedupe and reprocessed.
      eventId: String(payload.eventId ?? event.eventId ?? transactionId ?? `helcim:${expected}`),
      eventType,
      // cardToken is a card, not a customer — looking it up on users.stripeCustomerId
      // never matches. Prefer Helcim's customerCode (CST…).
      customerId: customerCode ? String(customerCode) : undefined,
      providerSubscriptionId: event.recurringPlanId ?? payload.recurringPlanId,
      providerInvoiceId: transactionId != null ? String(transactionId) : undefined,
      amount: (event.amount ?? payload.amount) != null ? Number(event.amount ?? payload.amount) : undefined,
      currency: (event.currency ?? payload.currency)?.toUpperCase(),
      billingReason: event.eventType ?? payload.eventType,
      ...(invoiceNumber ? { invoiceNumber: String(invoiceNumber) } : {}),
      raw: payload,
    };
  }

  async cancelSubscription(subscriptionId: string, _immediately?: boolean): Promise<void> {
    // Helcim manages recurring plans via their dashboard or the
    // recurring-plans API.  If a providerSubscriptionId (recurring plan ID)
    // is stored, we'd call DELETE /recurring-plans/{id}.
    //
    // For now we handle cancellation at the DB layer; the admin route
    // marks the subscription canceled.  When Helcim recurring API support
    // is fully integrated, uncomment the API call below.
    //
    // await helcimRequest(this.config, "DELETE", `/recurring-plans/${subscriptionId}`);
    console.info(`[helcim] cancelSubscription called for ${subscriptionId} — handled at DB layer`);
  }

  async refundPayment(
    transactionId: string,
    amountCents?: number,
    _reason?: string,
  ): Promise<{ refundId: string }> {
    const refundBody: Record<string, unknown> = {
      originalTransactionId: Number(transactionId),
    };
    if (amountCents !== undefined) {
      refundBody.amount = amountCents / 100;
    }
    const res = await helcimRequest<{ transactionId: number }>(
      this.config,
      "POST",
      "/payment/refund",
      refundBody,
    );
    return { refundId: String(res.transactionId) };
  }

  /**
   * GET /card-transactions/{id} — the authoritative record of a HelcimPay.js
   * purchase. Used to credit one-off purchases (token packs) from Helcim's
   * own data rather than the widget's postMessage, which the buyer controls.
   */
  async getTransaction(transactionId: string): Promise<ProviderTransaction | null> {
    if (!/^\d+$/.test(transactionId)) return null;
    let raw: unknown;
    try {
      raw = await helcimRequest<unknown>(
        this.config,
        "GET",
        `/card-transactions/${transactionId}`,
      );
    } catch (err) {
      if (err instanceof HelcimApiError && err.status === 404) return null;
      throw err;
    }
    return mapHelcimCardTransaction(raw, transactionId);
  }
}
