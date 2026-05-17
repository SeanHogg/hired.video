/**
 * Payment provider factory.
 *
 * Reads PAYMENT_PROVIDER from env (defaults to "stripe") and returns the
 * configured PaymentProvider implementation.
 *
 * Usage:
 *   const provider = getPaymentProvider(env);
 *   const customerId = await provider.getOrCreateCustomer(userId, email);
 */

import { StripePaymentProvider, createStripeClient } from "./stripe.js";
import { HelcimPaymentProvider } from "./helcim.js";
import type { PaymentProvider } from "./types.js";

export * from "./types.js";

export function getPaymentProvider(
  env: Record<string, string | undefined>,
): PaymentProvider {
  const providerName = (env.PAYMENT_PROVIDER ?? "stripe").toLowerCase();

  switch (providerName) {
    case "helcim": {
      const apiToken = env.HELCIM_API_TOKEN ?? env.HELCIM_API_KEY ?? "";
      const jsToken = env.HELCIM_JS_TOKEN;
      const jsSecret = env.HELCIM_JS_SECRET;
      const webhookToken = env.HELCIM_WEBHOOK_TOKEN;
      const flowRaw = (env.HELCIM_COLLECTION_FLOW ?? "modal").toLowerCase();
      const collectionFlow = flowRaw === "inline" ? "inline" : "modal";
      if (!apiToken) {
        throw new Error("HELCIM_API_TOKEN is required for Helcim provider");
      }
      return new HelcimPaymentProvider({ apiToken, jsToken, jsSecret, webhookToken, collectionFlow });
    }

    case "stripe":
    default: {
      const secretKey = env.STRIPE_SECRET_KEY;
      if (!secretKey) {
        throw new Error("STRIPE_SECRET_KEY is required for Stripe provider");
      }
      const stripe = createStripeClient(secretKey);
      return new StripePaymentProvider(
        stripe,
        env.STRIPE_PUBLISHABLE_KEY ?? null,
        env.STRIPE_WEBHOOK_SIGNING_KEY ?? null,
      );
    }
  }
}

/**
 * Try to build a PaymentProvider; return null if required secrets are missing.
 * Use this in request handlers to gracefully degrade when not yet configured.
 */
export function tryGetPaymentProvider(
  env: Record<string, string | undefined>,
): PaymentProvider | null {
  try {
    return getPaymentProvider(env);
  } catch {
    return null;
  }
}
