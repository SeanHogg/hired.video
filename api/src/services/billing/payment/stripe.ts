/**
 * Stripe implementation of PaymentProvider.
 *
 * Uses Stripe API version 2026-02-25.clover with the Fetch HTTP client
 * (required for Cloudflare Workers — no Node.js http module).
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../../db/index.js";
import type { BillingAddress } from "../../../../../shared/billing-address.js";
import type {
  PaymentProvider,
  CollectPaymentMethodResult,
  SavedPaymentMethod,
  NormalizedWebhookPayload,
  NormalizedEventType,
  PaymentMethodType,
  CollectedPaymentMethodHint,
} from "./types.js";

// ---------------------------------------------------------------------------
// Stripe client factory
// ---------------------------------------------------------------------------

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: "2026-02-25.clover",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

// ---------------------------------------------------------------------------
// Event type normalisation map
// ---------------------------------------------------------------------------

const STRIPE_EVENT_MAP: Record<string, NormalizedEventType> = {
  "customer.subscription.created": "subscription.created",
  "customer.subscription.updated": "subscription.updated",
  "customer.subscription.deleted": "subscription.deleted",
  "invoice.payment_succeeded": "invoice.paid",
  "invoice.payment_failed": "invoice.payment_failed",
  "payment_method.attached": "payment_method.attached",
  "payment_method.detached": "payment_method.detached",
  "payout.paid": "payout.paid",
  "payout.failed": "payout.failed",
};

function normaliseStripeEvent(event: Stripe.Event): NormalizedWebhookPayload {
  const eventType: NormalizedEventType = STRIPE_EVENT_MAP[event.type] ?? "unknown";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = event.data.object as any;

  const customerId: string | undefined =
    typeof obj.customer === "string" ? obj.customer : obj.customer?.id;

  const providerSubscriptionId: string | undefined =
    typeof obj.id === "string" && obj.object === "subscription"
      ? obj.id
      : typeof obj.subscription === "string"
        ? obj.subscription
        : obj.parent?.subscription_details?.subscription;

  const providerInvoiceId: string | undefined =
    obj.object === "invoice" ? obj.id : undefined;

  const providerPaymentMethodId: string | undefined =
    obj.object === "payment_method" ? obj.id : undefined;

  const providerPayoutId: string | undefined =
    obj.object === "payout" ? obj.id : undefined;

  return {
    eventId: event.id,
    eventType,
    customerId,
    providerSubscriptionId,
    providerInvoiceId,
    providerPaymentMethodId,
    providerPayoutId,
    amount: typeof obj.amount_paid === "number" ? obj.amount_paid / 100 : undefined,
    currency: obj.currency?.toUpperCase(),
    invoiceStatus: obj.status,
    billingReason: obj.billing_reason,
    invoicePdfUrl: obj.invoice_pdf ?? undefined,
    raw: event,
  };
}

// ---------------------------------------------------------------------------
// StripePaymentProvider
// ---------------------------------------------------------------------------

export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";

  constructor(
    private readonly stripe: Stripe,
    private readonly publishableKey: string | null,
    private readonly webhookSecret: string | null = null,
  ) {}

  getPublicKey(): string | null {
    return this.publishableKey;
  }

  async getOrCreateCustomer(
    userId: string,
    email: string,
    name?: string,
    billingAddress?: BillingAddress | null,
  ): Promise<string> {
    const db = getDb();
    const stripeAddress = billingAddress
      ? {
          line1: billingAddress.line1,
          line2: billingAddress.line2 ?? undefined,
          city: billingAddress.city,
          state: billingAddress.state,
          postal_code: billingAddress.postalCode,
          country: billingAddress.country,
        }
      : undefined;

    const [user] = await db
      .select({ stripeCustomerId: schema.users.stripeCustomerId })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (user?.stripeCustomerId && user.stripeCustomerId.startsWith("cus_")) {
      // Refresh the address on file so Stripe Checkout/Element pre-fills
      // match what the user just typed.
      if (stripeAddress) {
        await this.stripe.customers.update(user.stripeCustomerId, {
          name: billingAddress?.fullName ?? name ?? undefined,
          phone: billingAddress?.phone ?? undefined,
          address: stripeAddress,
        });
      }
      return user.stripeCustomerId;
    }

    // Fall back to subscriptions table (legacy data)
    const [sub] = await db
      .select({ stripeCustomerId: schema.subscriptions.stripeCustomerId })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId))
      .limit(1);

    if (sub?.stripeCustomerId && sub.stripeCustomerId.startsWith("cus_")) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.update(schema.users).set({ stripeCustomerId: sub.stripeCustomerId } as any).where(eq(schema.users.id, userId));
      return sub.stripeCustomerId;
    }

    const customer = await this.stripe.customers.create({
      email,
      name: billingAddress?.fullName ?? name ?? undefined,
      phone: billingAddress?.phone ?? undefined,
      address: stripeAddress,
      metadata: { userId },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.update(schema.users).set({ stripeCustomerId: customer.id } as any).where(eq(schema.users.id, userId));
    return customer.id;
  }

  async createSetupSession(customerId: string, successUrl: string, cancelUrl: string): Promise<string> {
    const session = await this.stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      payment_method_types: ["card"],
      success_url: successUrl || "https://hired.video/settings/billing?setup=success",
      cancel_url: cancelUrl || "https://hired.video/settings/billing?setup=cancel",
    });
    return session.url ?? "https://hired.video/settings/billing";
  }

  async initPaymentCollection(
    customerId: string,
    successUrl: string,
    cancelUrl: string,
    _amount?: number,
    _currency?: string,
    paymentMethodType?: PaymentMethodType,
  ): Promise<CollectPaymentMethodResult> {
    // Map our normalised type to Stripe's payment_method_types list. "any"
    // exposes both card and ACH so the buyer chooses inside the PaymentElement.
    const stripePmTypes: string[] =
      paymentMethodType === "us_bank_account"
        ? ["us_bank_account"]
        : paymentMethodType === "any"
          ? ["card", "us_bank_account"]
          : ["card"];

    const setupIntent = await this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: stripePmTypes,
      usage: "off_session",
    });

    if (setupIntent.client_secret) {
      return {
        flowType: "embedded",
        clientSecret: setupIntent.client_secret,
      };
    }

    // Fallback to redirect if clientSecret unavailable
    const redirectUrl = await this.createSetupSession(customerId, successUrl, cancelUrl);
    return { flowType: "redirect", redirectUrl };
  }

  async savePaymentMethod(
    customerId: string,
    providerPaymentMethodId: string,
    setDefault = false,
    _hint?: CollectedPaymentMethodHint,
  ): Promise<SavedPaymentMethod> {
    let pm: Stripe.PaymentMethod;
    try {
      pm = await this.stripe.paymentMethods.attach(providerPaymentMethodId, { customer: customerId });
    } catch (err) {
      // Already attached — retrieve instead
      pm = await this.stripe.paymentMethods.retrieve(providerPaymentMethodId);
    }

    if (setDefault) {
      await this.stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: providerPaymentMethodId },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const card = pm.type === "card" ? (pm as any).card : undefined;
    return {
      providerPaymentMethodId: pm.id,
      type: pm.type,
      brand: card?.brand,
      last4: card?.last4,
      expiryMonth: card?.exp_month,
      expiryYear: card?.exp_year,
    };
  }

  async detachPaymentMethod(providerPaymentMethodId: string): Promise<void> {
    try {
      await this.stripe.paymentMethods.detach(providerPaymentMethodId);
    } catch {
      // Already detached — ignore
    }
  }

  async verifyWebhook(body: string, headers: Headers): Promise<NormalizedWebhookPayload> {
    if (!this.webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SIGNING_KEY is not configured");
    }
    const signature = headers.get("stripe-signature");
    if (!signature) throw new Error("Missing stripe-signature header");
    const event = await this.stripe.webhooks.constructEventAsync(body, signature, this.webhookSecret);
    return normaliseStripeEvent(event);
  }
}

// ---------------------------------------------------------------------------
// Lookup helper — find userId from a Stripe customerId
// ---------------------------------------------------------------------------

export async function getUserIdByStripeCustomer(stripeCustomerId: string): Promise<string | null> {
  const db = getDb();
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.stripeCustomerId, stripeCustomerId))
    .limit(1);
  if (user) return user.id;

  const [sub] = await db
    .select({ userId: schema.subscriptions.userId })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return sub?.userId ?? null;
}
