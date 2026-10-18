/**
 * Local persistence of provider-saved payment methods. The provider calls
 * (attach / detach) stay in the route; this owns the `payment_methods`
 * mirror, always scoped to the calling user.
 */
import { getDb } from "../../db/index.js";
import { PaymentMethodsRepository } from "../../repositories/paymentMethodsRepository.js";
import type { SavedPaymentMethod } from "./payment/types.js";

/** Mirror a just-saved provider method locally, optionally as the default. */
export async function persistSavedPaymentMethod(
  userId: string,
  requestedPaymentMethodId: string,
  pm: SavedPaymentMethod,
  setDefault: boolean,
): Promise<void> {
  const repo = new PaymentMethodsRepository(getDb());

  // If setting as default, unset the user's other defaults
  if (setDefault) await repo.clearDefaultsForUser(userId);

  // Upsert into the local table — only ever the caller's own row.
  const existingId = await repo.findIdByProviderIdForUser(requestedPaymentMethodId, userId);
  if (existingId) {
    await repo.setDefaultFlag(existingId, setDefault);
    return;
  }
  await repo.insert({
    userId,
    stripePaymentMethodId: pm.providerPaymentMethodId, // column stores provider's PM ID
    type: pm.type,
    brand: pm.brand ?? null,
    last4: pm.last4 ?? null,
    expiryMonth: pm.expiryMonth ?? null,
    expiryYear: pm.expiryYear ?? null,
    isDefault: setDefault,
  } as any);
}

/** Provider id of one of the caller's own saved methods (null otherwise). */
export function findOwnedProviderPaymentMethodId(userId: string, paymentMethodId: string): Promise<string | null> {
  return new PaymentMethodsRepository(getDb()).findProviderIdForUser(paymentMethodId, userId);
}
