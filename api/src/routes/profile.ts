/**
 * Profile routes — user-owned profile data that's not auth/credentials.
 *
 * Today: just billing/contact address (used by Checkout, Settings → Billing,
 * and the Services marketplace). Add more profile-scoped endpoints here
 * rather than fattening settings.ts further.
 */

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { error, success } from "../types/index.js";
import { BillingAddressSchema } from "../../../shared/billing-address.js";
import { getBillingAddress, saveBillingAddress } from "../services/billing/userBillingContext.js";

export const profileRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// GET /api/profile/billing-address
// Returns the saved address or null. The frontend treats null as "not yet
// set" and shows empty form fields.
// ---------------------------------------------------------------------------
profileRoutes.get("/billing-address", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  return c.json(success({ billingAddress: await getBillingAddress(userId) }), 200);
});

// ---------------------------------------------------------------------------
// PUT /api/profile/billing-address
// Validates against BillingAddressSchema and upserts the user's
// billing_addresses row (one per user).
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
  await saveBillingAddress(userId, address);

  return c.json(success({ billingAddress: address }), 200);
});
