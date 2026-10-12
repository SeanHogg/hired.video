/**
 * The contact basics + saved billing address a payment provider needs to
 * create/link a customer and pre-fill its checkout. Shared by every flow
 * that opens a payment widget (routes/payment.ts, token-pack purchases).
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

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

  const [profile] = await db
    .select({
      billingFullName: schema.userProfiles.billingFullName,
      billingCompany: schema.userProfiles.billingCompany,
      billingLine1: schema.userProfiles.billingLine1,
      billingLine2: schema.userProfiles.billingLine2,
      billingCity: schema.userProfiles.billingCity,
      billingState: schema.userProfiles.billingState,
      billingPostalCode: schema.userProfiles.billingPostalCode,
      billingCountry: schema.userProfiles.billingCountry,
      billingPhone: schema.userProfiles.billingPhone,
    })
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, userId))
    .limit(1);

  // Reconstruct the BillingAddress shape only when the required fields are
  // populated — otherwise let the provider fall back to an empty modal.
  const billingAddress =
    profile &&
    profile.billingFullName &&
    profile.billingLine1 &&
    profile.billingCity &&
    profile.billingState &&
    profile.billingPostalCode &&
    profile.billingCountry
      ? {
          fullName: profile.billingFullName,
          company: profile.billingCompany,
          line1: profile.billingLine1,
          line2: profile.billingLine2,
          city: profile.billingCity,
          state: profile.billingState,
          postalCode: profile.billingPostalCode,
          country: profile.billingCountry,
          phone: profile.billingPhone,
        }
      : null;

  return { user, billingAddress };
}
