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
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const profileRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// GET /api/profile/billing-address
// Returns the saved address or null. The frontend treats null as "not yet
// set" and shows empty form fields.
// ---------------------------------------------------------------------------
profileRoutes.get("/billing-address", async (c) => {
  const userId = requireUser(c);

  return c.json(success({ billingAddress: await getBillingAddress(userId) }), 200);
});

// ---------------------------------------------------------------------------
// PUT /api/profile/billing-address
// Validates against BillingAddressSchema and upserts the user's
// billing_addresses row (one per user).
// ---------------------------------------------------------------------------
profileRoutes.put("/billing-address", validateJson(BillingAddressSchema, (e) => error("VALIDATION_ERROR", "Invalid billing address", e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);

  const body = c.req.valid("json");
  const address = body;
  await saveBillingAddress(userId, address);

  return c.json(success({ billingAddress: address }), 200);
});
