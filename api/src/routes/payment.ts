/**
 * Payment routes — provider-agnostic.
 *
 * All payment processing is delegated to the PaymentProvider implementation
 * selected by the PAYMENT_PROVIDER env var (default: "stripe").
 * Swap to Helcim (or any future provider) by setting PAYMENT_PROVIDER=helcim.
 */

import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { error, success } from "../types/index.js";
import { tryGetPaymentProvider } from "../services/billing/payment/index.js";
import { loadUserBillingContext } from "../services/billing/userBillingContext.js";
import * as billingService from "../services/billing/BillingService.js";
import { processPaymentWebhook } from "../services/billing/paymentWebhookService.js";
import { persistSavedPaymentMethod, findOwnedProviderPaymentMethodId } from "../services/billing/paymentMethodsService.js";
import { tryGetPayoutProvider } from "../services/payout/index.js";
import { applyPayoutWebhook } from "../services/payout/payoutWebhook.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { requestEnv } from "../utils/env.js";
import { validateJson } from "./helpers/validate.js";

export const paymentRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// GET /api/payment/public-key
// Returns the provider's publishable key (for Stripe.js / HelcimPay.js init).
// ---------------------------------------------------------------------------
paymentRoutes.get("/public-key", (c) => {
  const provider = tryGetPaymentProvider(requestEnv(c));
  if (!provider) return c.json(error("NOT_CONFIGURED", "Payment provider not configured"), 503);

  const key = provider.getPublicKey();
  // Return both the key and the provider name so the frontend can load the right SDK
  return c.json(success({ publicKey: key, provider: provider.name }), 200);
});

// ---------------------------------------------------------------------------
// POST /api/payment/init-collection
// Initialise a payment method collection flow. Returns either:
//   { flowType: "embedded", clientSecret }  — use provider JS SDK
//   { flowType: "redirect", redirectUrl }   — navigate browser to URL
// ---------------------------------------------------------------------------
paymentRoutes.post("/init-collection", async (c) => {
  const userId = requireUser(c);

  const body = await c.req.json().catch(() => ({})) as {
    successUrl?: string;
    cancelUrl?: string;
    amount?: number;
    currency?: string;
    paymentMethodType?: "card" | "us_bank_account" | "any";
  };

  const provider = tryGetPaymentProvider(requestEnv(c));
  if (!provider) return c.json(error("NOT_CONFIGURED", "Payment provider not configured"), 503);

  const ctx = await loadUserBillingContext(userId);
  if (!ctx) return c.json(error("NOT_FOUND", "User not found"), 404);

  const customerId = await provider.getOrCreateCustomer(
    userId,
    ctx.user.email,
    ctx.user.name,
    ctx.billingAddress,
  );
  const result = await provider.initPaymentCollection(
    customerId,
    body.successUrl ?? `${c.req.header("origin") ?? "https://hired.video"}/checkout/success`,
    body.cancelUrl ?? `${c.req.header("origin") ?? "https://hired.video"}/checkout?cancelled=true`,
    body.amount,
    body.currency,
    body.paymentMethodType,
  );

  return c.json(success(result), 200);
});

// ---------------------------------------------------------------------------
// POST /api/payment/setup-intent
// Alias for init-collection for backwards compatibility with existing clients.
// ---------------------------------------------------------------------------
paymentRoutes.post("/setup-intent", async (c) => {
  const userId = requireUser(c);

  const provider = tryGetPaymentProvider(requestEnv(c));
  if (!provider) return c.json(error("NOT_CONFIGURED", "Payment provider not configured"), 503);

  const ctx = await loadUserBillingContext(userId);
  if (!ctx) return c.json(error("NOT_FOUND", "User not found"), 404);

  const customerId = await provider.getOrCreateCustomer(
    userId,
    ctx.user.email,
    ctx.user.name,
    ctx.billingAddress,
  );
  const result = await provider.initPaymentCollection(
    customerId,
    `${c.req.header("origin") ?? "https://hired.video"}/checkout/success`,
    `${c.req.header("origin") ?? "https://hired.video"}/checkout?cancelled=true`,
  );

  // Legacy shape — if embedded return clientSecret, else redirectUrl
  if (result.flowType === "embedded") {
    return c.json(success({ clientSecret: result.clientSecret ?? result.checkoutToken }), 200);
  }
  return c.json(success({ redirectUrl: result.redirectUrl }), 200);
});

// ---------------------------------------------------------------------------
// POST /api/payment/save-payment-method
// Attaches a collected payment method to the customer and persists to DB.
// ---------------------------------------------------------------------------
const SavePaymentMethodSchema = z.object({
  paymentMethodId: z.string().min(1),
  setDefault: z.boolean().optional().default(false),
  // Metadata captured from the provider's success postMessage (Helcim
  // doesn't expose a /cards/{token} lookup, so the masked card details
  // come from HelcimPay itself). Stripe ignores this and pulls from its
  // own API.
  type: z.enum(["card", "us_bank_account"]).optional(),
  brand: z.string().optional(),
  last4: z.string().optional(),
  expiryMonth: z.number().int().optional(),
  expiryYear: z.number().int().optional(),
});

paymentRoutes.post("/save-payment-method", validateJson(SavePaymentMethodSchema, (e) => error("VALIDATION_ERROR", "paymentMethodId is required", e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);

  const body = c.req.valid("json");

  const { paymentMethodId, setDefault, type, brand, last4, expiryMonth, expiryYear } = body;

  const provider = tryGetPaymentProvider(requestEnv(c));
  if (!provider) return c.json(error("NOT_CONFIGURED", "Payment provider not configured"), 503);

  const ctx = await loadUserBillingContext(userId);
  if (!ctx) return c.json(error("NOT_FOUND", "User not found"), 404);

  const customerId = await provider.getOrCreateCustomer(
    userId,
    ctx.user.email,
    ctx.user.name,
    ctx.billingAddress,
  );

  let pm: Awaited<ReturnType<typeof provider.savePaymentMethod>>;
  try {
    pm = await provider.savePaymentMethod(customerId, paymentMethodId, setDefault, {
      type,
      brand,
      last4,
      expiryMonth,
      expiryYear,
    });
  } catch (providerErr: unknown) {
    const msg = providerErr instanceof Error ? providerErr.message : "Payment provider error";
    return c.json(error("PROVIDER_ERROR", msg), 400);
  }

  await persistSavedPaymentMethod(userId, paymentMethodId, pm, setDefault);

  return c.json(success({ ...pm, isDefault: setDefault }), 200);
});

// ---------------------------------------------------------------------------
// POST /api/payment/webhook — the ONE provider webhook URL (Helcim acquiring
// + ACH payouts share it). The legacy /stripe/webhook alias was removed
// 2026-10-17: production runs Helcim; if Stripe is re-enabled, point its
// dashboard endpoint here. Verifies the provider signature and dispatches
// normalised events.
// ---------------------------------------------------------------------------
async function handleWebhook(c: Context<AppEnv>) {
  const provider = tryGetPaymentProvider(requestEnv(c));
  if (!provider) return c.json(error("NOT_CONFIGURED", "Payment provider not configured"), 503);

  const rawBody = await c.req.text();

  // Helcim shares its webhook URL between acquiring (CC + ACH inbound) and
  // ACH credits (outbound payouts). Give the payout provider first crack at
  // the raw event; if it claims the event we record + apply it via the
  // payout pipeline and stop. The signature has already been validated by
  // the payout provider so we don't double-check it on the way through.
  if (provider.name === "helcim") {
    const payoutProvider = tryGetPayoutProvider("helcim_ach", requestEnv(c));
    if (payoutProvider) {
      try {
        const payoutPayload = await payoutProvider.verifyAndNormalizeWebhook(rawBody, c.req.raw.headers);
        if (payoutPayload) {
          await applyPayoutWebhook(payoutPayload, "helcim_ach");
          return c.json({ received: true }, 200);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Webhook signature verification failed";
        return c.json(error("WEBHOOK_ERROR", msg), 400);
      }
    }
  }

  let payload: Awaited<ReturnType<typeof provider.verifyWebhook>>;
  try {
    payload = await provider.verifyWebhook(rawBody, c.req.raw.headers);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook signature verification failed";
    return c.json(error("WEBHOOK_ERROR", msg), 400);
  }

  await processPaymentWebhook(payload, requestEnv(c));

  return c.json({ received: true }, 200);
}

paymentRoutes.post("/webhook", handleWebhook as any);

// ---------------------------------------------------------------------------
// POST /api/payment/create-setup-session  (legacy — kept for existing clients)
// ---------------------------------------------------------------------------
paymentRoutes.post("/create-setup-session", async (c) => {
  const userId = requireUser(c);

  const body = await c.req.json().catch(() => null) as { successUrl?: string; cancelUrl?: string } | null;

  const provider = tryGetPaymentProvider(requestEnv(c));
  if (!provider) {
    // Graceful degradation — redirect to billing settings
    return c.json(success({ Url: "https://hired.video/settings/billing?billing_setup=1" }), 200);
  }

  const ctx = await loadUserBillingContext(userId);
  if (!ctx) return c.json(error("NOT_FOUND", "User not found"), 404);

  const customerId = await provider.getOrCreateCustomer(
    userId,
    ctx.user.email,
    ctx.user.name,
    ctx.billingAddress,
  );
  const url = await provider.createSetupSession(
    customerId,
    body?.successUrl ?? "https://hired.video/checkout/success",
    body?.cancelUrl ?? "https://hired.video/checkout?cancelled=true",
  );
  return c.json(success({ Url: url }), 200);
});

// ---------------------------------------------------------------------------
// DELETE /api/payment/payment-methods/:id
// ---------------------------------------------------------------------------
paymentRoutes.delete("/payment-methods/:id", async (c) => {
  const userId = requireUser(c);

  const id = c.req.param("id");
  if (!id) return c.json(error("VALIDATION_ERROR", "Missing payment method id"), 400);

  // Detach from provider if available
  const provider = tryGetPaymentProvider(requestEnv(c));
  if (provider) {
    // Only the caller's own method — never detach another user's by row id.
    const providerPaymentMethodId = await findOwnedProviderPaymentMethodId(userId, id);
    if (providerPaymentMethodId) {
      await provider.detachPaymentMethod(providerPaymentMethodId).catch(() => {/* already removed */});
    }
  }

  const message = await billingService.deletePaymentMethod(userId, id);
  return c.json({ message }, 200);
});
