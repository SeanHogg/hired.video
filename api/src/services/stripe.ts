/**
 * Stripe service — client initialisation and customer management.
 *
 * All Stripe API calls go through this file so the rest of the codebase
 * never imports `stripe` directly (makes mocking / key-gating easy).
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** Return a configured Stripe client. Throws if STRIPE_SECRET_KEY is absent. */
export function getStripe(env: Record<string, string | undefined>): Stripe {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, {
    apiVersion: "2026-02-25.clover",
    // Cloudflare Workers use the fetch global — no Node http needed
    httpClient: Stripe.createFetchHttpClient(),
  });
}

/** Return the Stripe publishable key or null if not configured. */
export function getPublishableKey(env: Record<string, string | undefined>): string | null {
  return env.STRIPE_PUBLISHABLE_KEY ?? null;
}

// ---------------------------------------------------------------------------
// Customer helpers
// ---------------------------------------------------------------------------

/**
 * Return the Stripe customer ID for a user.
 * If the user has no customer yet, create one and persist the ID.
 */
export async function getOrCreateStripeCustomer(
  stripe: Stripe,
  userId: string,
  email: string,
  name?: string,
): Promise<string> {
  const db = getDb();

  // Look up existing stripeCustomerId on the user row
  const [user] = await db
    .select({ stripeCustomerId: schema.users.stripeCustomerId })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (user?.stripeCustomerId) return user.stripeCustomerId;

  // Also check subscriptions table (legacy data may have it there)
  const [sub] = await db
    .select({ stripeCustomerId: schema.subscriptions.stripeCustomerId })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);

  if (sub?.stripeCustomerId) {
    // Back-fill users table so future lookups are faster
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.update(schema.users).set({ stripeCustomerId: sub.stripeCustomerId } as any).where(eq(schema.users.id, userId));
    return sub.stripeCustomerId;
  }

  // Create a new Stripe customer
  const customer = await stripe.customers.create({
    email,
    name: name ?? undefined,
    metadata: { userId },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.update(schema.users).set({ stripeCustomerId: customer.id } as any).where(eq(schema.users.id, userId));

  return customer.id;
}

/**
 * Look up a userId from a Stripe customerId.
 * Checks users.stripeCustomerId first, then subscriptions.stripeCustomerId.
 */
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
