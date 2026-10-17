/**
 * The contact basics + saved billing address a payment provider needs to
 * create/link a customer and pre-fill its checkout. Shared by every flow
 * that opens a payment widget (routes/payment.ts, token-pack purchases),
 * plus the owner read/write behind /api/profile/billing-address.
 *
 * Storage: `billing_addresses` (mig 0631) via BillingAddressRepository.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { BillingAddressRepository } from "../../repositories/billingAddressRepository.js";
import type { BillingAddress } from "../../../../shared/billing-address.js";

function billingAddressRepo(): BillingAddressRepository {
  return new BillingAddressRepository(getDb());
}

/** The user's saved address, or null when not (fully) provided. */
export async function getBillingAddress(userId: string): Promise<BillingAddress | null> {
  return billingAddressRepo().findByUserId(userId);
}

/** Upsert the user's address (already validated by BillingAddressSchema). */
export async function saveBillingAddress(userId: string, address: BillingAddress): Promise<void> {
  await billingAddressRepo().upsert(userId, address);
}

/**
 * Read a user's contact basics + saved billing address. Used by every
 * route that initialises a payment-collection flow so the provider can
 * pre-fill the modal/checkout from the user's profile rather than asking
 * for the address twice.
 */
export async function loadUserBillingContext(userId: string) {
  const db = getDb();
  const [user] = await db
    .select({ email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) return null;

  // Null when the required fields aren't populated — the provider then
  // falls back to an empty modal.
  const billingAddress = await getBillingAddress(userId);

  return { user, billingAddress };
}
