/**
 * The caller's own creator workspace data:
 *   GET   /me                                     — active enrollment row (or null)
 *   PATCH /me                                     — profile fields (name / tagline / bio / languages / pricing)
 *   GET   /me/earnings-rollup                     — lifetime earnings by revenue source (#1185)
 *   GET   /me/payout-profile                      — payout / tax profile (created empty on first read)
 *   PATCH /me/payout-profile                      — entity / tax / address / payout fields
 *   POST  /me/payout-profile/tax-form-envelope    — hosted W-9 / W-8 e-signature envelope (#310)
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import type { PayoutProfileUpdateInput } from "../../../../shared/payout-profile.js";
import { payoutLedgerService } from "../../services/payout/PayoutLedgerService.js";
import { getOwnCreatorProfile, updateOwnCreatorProfile } from "../../services/creators/enrollment.js";
import {
  getOwnPayoutProfile,
  updateOwnPayoutProfile,
  requestTaxFormEnvelope,
} from "../../services/creators/payout-profile.js";
import { requestEnv } from "../../utils/env.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { sendResult } from "./shared.js";

export const creatorMeRoutes = new Hono<AppEnv>();

creatorMeRoutes.get("/me", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getOwnCreatorProfile(userId)), 200);
});

creatorMeRoutes.patch("/me", async (c) => {
  const userId = requireUser(c);
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  return sendResult(c, await updateOwnCreatorProfile(userId, body));
});

creatorMeRoutes.get("/me/earnings-rollup", async (c) => {
  const userId = requireUser(c);
  const rollup = await payoutLedgerService.getEarningsRollup(userId);
  return c.json(success(rollup), 200);
});

creatorMeRoutes.get("/me/payout-profile", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getOwnPayoutProfile(userId)), 200);
});

creatorMeRoutes.patch("/me/payout-profile", async (c) => {
  const userId = requireUser(c);
  const body = await c.req.json().catch(() => ({})) as PayoutProfileUpdateInput;
  return sendResult(c, await updateOwnPayoutProfile(userId, body, requestEnv(c)));
});

creatorMeRoutes.post("/me/payout-profile/tax-form-envelope", async (c) => {
  const userId = requireUser(c);
  const body = (await c.req.json().catch(() => ({}))) as { recipientEmail?: string; recipientName?: string };
  return sendResult(c, await requestTaxFormEnvelope(userId, body, requestEnv(c)));
});
