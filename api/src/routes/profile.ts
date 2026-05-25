/**
 * Profile routes — user-owned profile data that's not auth/credentials.
 *
 * Today: just billing/contact address (used by Checkout, Settings → Billing,
 * and the Services marketplace). Add more profile-scoped endpoints here
 * rather than fattening settings.ts further.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Variables, AppEnv } from "../types/index.js";
import { error, success } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import {
  BillingAddressSchema,
  type BillingAddress,
} from "../../../shared/billing-address.js";

export const profileRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Column-level <-> domain shape converters.  The DB stores the address as
// per-field columns (so each is queryable / validatable / index-able);
// the API still speaks the BillingAddress shape from shared/billing-address.
// ---------------------------------------------------------------------------

function rowToAddress(row: {
  billingFullName: string | null;
  billingCompany: string | null;
  billingLine1: string | null;
  billingLine2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPostalCode: string | null;
  billingCountry: string | null;
  billingPhone: string | null;
}): BillingAddress | null {
  // The address is "set" iff the required fields are populated. Anything
  // less and the form on the frontend should treat it as not yet provided.
  if (
    !row.billingFullName ||
    !row.billingLine1 ||
    !row.billingCity ||
    !row.billingState ||
    !row.billingPostalCode ||
    !row.billingCountry
  ) {
    return null;
  }
  return {
    fullName: row.billingFullName,
    company: row.billingCompany,
    line1: row.billingLine1,
    line2: row.billingLine2,
    city: row.billingCity,
    state: row.billingState,
    postalCode: row.billingPostalCode,
    country: row.billingCountry,
    phone: row.billingPhone,
  };
}

function addressToColumns(addr: BillingAddress) {
  return {
    billingFullName: addr.fullName,
    billingCompany: addr.company ?? null,
    billingLine1: addr.line1,
    billingLine2: addr.line2 ?? null,
    billingCity: addr.city,
    billingState: addr.state,
    billingPostalCode: addr.postalCode,
    billingCountry: addr.country,
    billingPhone: addr.phone ?? null,
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// GET /api/profile/billing-address
// Returns the saved address or null. The frontend treats null as "not yet
// set" and shows empty form fields.
// ---------------------------------------------------------------------------
profileRoutes.get("/billing-address", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [row] = await db
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

  return c.json(success({ billingAddress: row ? rowToAddress(row) : null }), 200);
});

// ---------------------------------------------------------------------------
// PUT /api/profile/billing-address
// Validates against BillingAddressSchema and upserts onto user_profiles.
// Creates the user_profiles row if the user doesn't have one yet — every
// authenticated user has a profile row implicitly.
// ---------------------------------------------------------------------------
profileRoutes.put("/billing-address", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = BillingAddressSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid billing address", parsed.error.flatten()), 400);
  }
  const address = parsed.data;
  const cols = addressToColumns(address);

  const db = getDb();
  const [existing] = await db
    .select({ id: schema.userProfiles.id })
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, userId))
    .limit(1);

  if (existing) {
    await db
      .update(schema.userProfiles)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(cols as any)
      .where(eq(schema.userProfiles.userId, userId));
  } else {
    await db
      .insert(schema.userProfiles)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .values({ userId, ...cols } as any);
  }

  return c.json(success({ billingAddress: address }), 200);
});
